/**
 * VoiceCraft Signaling Server
 *
 * Responsibilities:
 *  - Persist Spaces + Rooms on disk (JSON)
 *  - Authenticate peers by userId (sent by client on first message)
 *  - Track who's connected to what Space/Room
 *  - Relay WebRTC offer/answer/ICE between peers in the same RTC room
 *  - Broadcast presence changes (peer-joined/left) within an RTC room
 *
 * Architecture:
 *  - Space (persistent, server-side) → contains Rooms (persistent) → contains
 *    ephemeral "rtc-rooms" (in-memory, only while peers are connected) for
 *    WebRTC signaling.
 *  - A "Room" with type=voice is a hub where peers connect via WebRTC.
 *  - A "Room" with type=text is purely text chat (no WebRTC).
 *
 * Storage: data/spaces.json (debounced atomic writes).
 */

import { WebSocketServer } from 'ws'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const PORT = 5185
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const SPACES_FILE = path.join(DATA_DIR, 'spaces.json')

// --------------------------------------------------------------------------
// Persistence layer
// --------------------------------------------------------------------------
function loadSpaces() {
  try {
    if (!fs.existsSync(SPACES_FILE)) return []
    const raw = fs.readFileSync(SPACES_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('[spaces] load failed, starting empty:', err.message)
    return []
  }
}

let saveTimer = null
function saveSpacesSoon(spaces) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
      const tmp = SPACES_FILE + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(spaces, null, 2))
      fs.renameSync(tmp, SPACES_FILE)
    } catch (err) {
      console.error('[spaces] save failed:', err.message)
    }
  }, 250)
}

// --------------------------------------------------------------------------
// Domain model
// --------------------------------------------------------------------------
/**
 * Space:
 *   id: string
 *   name: string
 *   description: string
 *   icon: string          // packed Phosphor id, e.g. ph:users-three:outline
 *   color: string         // hex color used as the icon background
 *   createdBy: string (userId)
 *   createdAt: number (ms epoch)
 *   members: string[] (userIds)
 *   rooms: Room[]
 *
 * Room:
 *   id: string
 *   name: string
 *   type: 'voice' | 'text'
 *   icon: string          // optional emoji shown next to the name
 *   createdBy: string
 *   createdAt: number
 */
let spaces = loadSpaces()

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function sanitizeCoverFit(raw) {
  if (!raw || typeof raw !== 'object') return null
  const x = Number(raw.x)
  const y = Number(raw.y)
  const zoom = Number(raw.zoom)
  if (![x, y, zoom].every(Number.isFinite)) return null
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
  return {
    x: Math.round(clamp(x, 0, 100) * 10) / 10,
    y: Math.round(clamp(y, 0, 100) * 10) / 10,
    zoom: Math.round(clamp(zoom, 1, 2.5) * 100) / 100,
  }
}

function findSpace(spaceId) {
  return spaces.find(s => s.id === spaceId)
}

function findRoom(spaceId, roomId) {
  const space = findSpace(spaceId)
  if (!space) return null
  return space.rooms.find(r => r.id === roomId) || null
}

// --------------------------------------------------------------------------
// Connection state
// --------------------------------------------------------------------------
// rtcRooms: Map<roomId, Set<ws>> — ephemeral, only while peers are in
// voice/text rooms. WebRTC offer/answer/ICE is relayed through these.
// userConn: Map<userId, ws> — who is connected right now.
// userLocation: Map<userId, { spaceId, roomId }> — for broadcasts.

const rtcRooms = new Map()
const userConn = new Map()        // userId → ws
const userLocation = new Map()    // userId → { spaceId, roomId }
const userInfo = new Map()        // userId → { displayName }

function broadcastToSpace(spaceId, payload, excludeWs = null) {
  for (const [userId, loc] of userLocation.entries()) {
    if (loc.spaceId !== spaceId) continue
    const ws = userConn.get(userId)
    if (ws && ws !== excludeWs && ws.readyState === 1) {
      try { ws.send(JSON.stringify(payload)) } catch {}
    }
  }
}

function broadcastToRoom(spaceId, roomId, payload, excludeWs = null) {
  const room = rtcRooms.get(roomId)
  if (!room) return
  for (const ws of room) {
    if (ws !== excludeWs && ws.readyState === 1) {
      try { ws.send(JSON.stringify(payload)) } catch {}
    }
  }
}

// --------------------------------------------------------------------------
// WebRTC relay (within rtcRooms)
// --------------------------------------------------------------------------
const RELAY_MESSAGE_TYPES = new Set([
  'offer',
  'answer',
  'ice-candidate',
  'screen-share-state',
])

function relayInRoom(roomId, ws, msg) {
  const room = rtcRooms.get(roomId)
  if (!room) return
  for (const peer of room) {
    if (peer !== ws && peer.readyState === 1) {
      try { peer.send(JSON.stringify(msg)) } catch {}
    }
  }
}

// --------------------------------------------------------------------------
// HTTP server (health + debug)
// --------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: 'ok',
      spaces: spaces.length,
      rooms: spaces.reduce((n, s) => n + s.rooms.length, 0),
      connected: userConn.size,
    }))
    return
  }
  if (req.url === '/spaces') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(spaces))
    return
  }
  res.writeHead(404)
  res.end('VoiceCraft Signaling Server')
})

// --------------------------------------------------------------------------
// WebSocket
// --------------------------------------------------------------------------
const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  let userId = null
  let currentSpaceId = null
  let currentRoomId = null

  console.log('🔌 Nova conexão')

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }

    // ---- Identity handshake (must be first) -----------------------------
    if (msg.type === 'hello') {
      userId = String(msg.userId || '').slice(0, 64) || uid()
      const displayName = String(msg.displayName || '').slice(0, 64) || 'convidado'
      // If this userId is already connected, kick the old one.
      const existing = userConn.get(userId)
      if (existing && existing !== ws && existing.readyState === 1) {
        try { existing.close(4000, 'replaced') } catch {}
      }
      userConn.set(userId, ws)
      userInfo.set(userId, { displayName })
      try {
        ws.send(JSON.stringify({
          type: 'hello-ack',
          userId,
          spaces: spaces.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
            icon: s.icon,
            color: s.color,
            cover: s.cover,
            coverFit: s.coverFit || null,
            themeId: s.themeId,
            memberCount: s.members.length,
            roomCount: s.rooms.length,
            joined: s.members.includes(userId),
          })),
        }))
      } catch {}
      return
    }

    if (!userId) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'envie hello primeiro' })) } catch {}
      return
    }

    // ---- Space management -----------------------------------------------
    switch (msg.type) {
      case 'space:create': {
        const name = String(msg.name || '').slice(0, 64).trim() || 'sem nome'
        const description = String(msg.description || '').slice(0, 256)
        const icon = String(msg.icon || 'users').slice(0, 80)
        const color = /^#[0-9a-fA-F]{6}$/.test(msg.color || '') ? msg.color : '#0A84FF'
        // Optional cover (data URL) and theme id (referenced by client-side
        // theme catalog). Cap the cover size to keep spaces.json from
        // exploding.
        let cover = null
        if (typeof msg.cover === 'string' && msg.cover.startsWith('data:image/')) {
          cover = msg.cover.slice(0, 4 * 1024 * 1024)  // 4 MB raw ceiling
        }
        const themeId = String(msg.themeId || '').slice(0, 32) || null
        const coverFit = cover ? sanitizeCoverFit(msg.coverFit) : null
        const space = {
          id: uid(),
          name,
          description,
          icon,
          color,
          cover,
          coverFit,
          themeId,
          events: [],
          createdBy: userId,
          createdAt: Date.now(),
          members: [userId],
          rooms: [],
        }
        spaces.push(space)
        saveSpacesSoon(spaces)
        try { ws.send(JSON.stringify({ type: 'space:created', space })) } catch {}
        console.log(`📁 Space criado: ${space.name} ${space.icon}${themeId ? ` [${themeId}]` : ''}`)
        return
      }

      case 'space:join': {
        const space = findSpace(String(msg.spaceId || ''))
        if (!space) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'space não encontrado' })) } catch {}
          return
        }
        if (!space.members.includes(userId)) {
          space.members.push(userId)
          saveSpacesSoon(spaces)
        }
        currentSpaceId = space.id
        userLocation.set(userId, { spaceId: space.id, roomId: currentRoomId })
        try {
          ws.send(JSON.stringify({
            type: 'space:joined',
            space: {
              ...space,
              members: space.members.map(id => ({
                userId: id,
                displayName: userInfo.get(id)?.displayName || 'convidado',
                online: userConn.has(id),
                location: userLocation.get(id) || null,
                status: userInfo.get(id)?.status || null,
              })),
            },
          }))
        } catch {}
        broadcastToSpace(space.id, {
          type: 'space:member-joined',
          spaceId: space.id,
          userId,
          displayName: userInfo.get(userId)?.displayName || 'convidado',
        }, ws)
        return
      }

      case 'space:leave': {
        const leaveId = String(msg.spaceId || currentSpaceId || '')
        const space = findSpace(leaveId)
        if (space) {
          space.members = space.members.filter(id => id !== userId)
          saveSpacesSoon(spaces)
          if (currentRoomId && rtcRooms.has(currentRoomId)) {
            const prev = rtcRooms.get(currentRoomId)
            prev.delete(ws)
            broadcastToRoom(space.id, currentRoomId, { type: 'peer-left', userId }, ws)
            if (prev.size === 0) rtcRooms.delete(currentRoomId)
          }
          broadcastToSpace(space.id, {
            type: 'space:member-left',
            spaceId: space.id,
            userId,
          }, ws)
        }
        currentSpaceId = null
        currentRoomId = null
        userLocation.set(userId, { spaceId: null, roomId: null })
        try { ws.send(JSON.stringify({ type: 'space:left', spaceId: leaveId || null })) } catch {}
        return
      }

      case 'space:delete': {
        const space = findSpace(String(msg.spaceId || currentSpaceId || ''))
        if (!space) return
        if (space.createdBy !== userId) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'só o criador pode deletar' })) } catch {}
          return
        }
        spaces = spaces.filter(s => s.id !== space.id)
        saveSpacesSoon(spaces)
        broadcastToSpace(space.id, { type: 'space:deleted', spaceId: space.id })
        if (currentSpaceId === space.id) currentSpaceId = null
        return
      }

      case 'space:update': {
        const space = findSpace(String(msg.spaceId || currentSpaceId || ''))
        if (!space) return
        if (space.createdBy !== userId) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'só o criador pode editar' })) } catch {}
          return
        }
        // Whitelist of mutable fields. Each is sanitised before write.
        const updates = {}
        if (typeof msg.name === 'string') {
          const n = msg.name.slice(0, 64).trim()
          if (n) updates.name = n
        }
        if (typeof msg.description === 'string') {
          updates.description = msg.description.slice(0, 256)
        }
        if (typeof msg.slogan === 'string') {
          updates.slogan = msg.slogan.slice(0, 80)
        }
        if (typeof msg.icon === 'string') {
          updates.icon = msg.icon.slice(0, 80)
        }
        if (typeof msg.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(msg.color)) {
          updates.color = msg.color
        }
        if (msg.cover === null) {
          updates.cover = null
          updates.coverFit = null
        } else if (typeof msg.cover === 'string' && msg.cover.startsWith('data:image/')) {
          updates.cover = msg.cover.slice(0, 4 * 1024 * 1024)
        }
        if (msg.coverFit === null) {
          updates.coverFit = null
        } else if (msg.coverFit != null) {
          const fit = sanitizeCoverFit(msg.coverFit)
          if (fit) updates.coverFit = fit
        }
        if (Array.isArray(msg.events)) {
          updates.events = msg.events.slice(0, 40).map(ev => ({
            id: String(ev?.id || uid()).slice(0, 40),
            title: String(ev?.title || 'Evento').slice(0, 80),
            at: Number(ev?.at) || Date.now(),
            roomId: ev?.roomId ? String(ev.roomId).slice(0, 64) : null,
            note: String(ev?.note || '').slice(0, 160),
          }))
        }
        Object.assign(space, updates)
        saveSpacesSoon(spaces)
        // Ack the editor and broadcast to everyone else in the space.
        try { ws.send(JSON.stringify({ type: 'space:updated', space })) } catch {}
        broadcastToSpace(space.id, { type: 'space:updated', space }, ws)
        console.log(`📝 Space atualizado: ${space.name}`)
        return
      }

      // ---- Room management ---------------------------------------------
      case 'room:create': {
        if (!currentSpaceId) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'entre num space primeiro' })) } catch {}
          return
        }
        const space = findSpace(currentSpaceId)
        if (!space) return
        const name = String(msg.name || '').slice(0, 64).trim() || 'sem nome'
        const type = msg.type_ === 'text' ? 'text' : 'voice'
        const purpose = String(msg.purpose || (type === 'voice' ? 'voice' : 'conversation')).slice(0, 32)
        const room = {
          id: uid(),
          name,
          type,
          purpose,
          createdBy: userId,
          createdAt: Date.now(),
        }
        space.rooms.push(room)
        saveSpacesSoon(spaces)
        broadcastToSpace(space.id, {
          type: 'room:created',
          spaceId: space.id,
          room,
        })
        return
      }

      case 'room:delete': {
        const room = findRoom(currentSpaceId, String(msg.roomId || ''))
        if (!room) return
        const space = findSpace(currentSpaceId)
        if (room.createdBy !== userId && space?.createdBy !== userId) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'sem permissão' })) } catch {}
          return
        }
        space.rooms = space.rooms.filter(r => r.id !== room.id)
        saveSpacesSoon(spaces)
        // Kick anyone still in the rtc-room
        rtcRooms.delete(room.id)
        broadcastToSpace(space.id, {
          type: 'room:deleted',
          spaceId: space.id,
          roomId: room.id,
        })
        return
      }

      // ---- Joining a Room (creates the ephemeral rtc-room for WebRTC) -
      case 'room:enter': {
        const room = findRoom(currentSpaceId, String(msg.roomId || ''))
        if (!room) {
          try { ws.send(JSON.stringify({ type: 'error', message: 'room não encontrada' })) } catch {}
          return
        }
        // Leave previous rtc-room if any
        if (currentRoomId && rtcRooms.has(currentRoomId)) {
          const prev = rtcRooms.get(currentRoomId)
          prev.delete(ws)
          broadcastToRoom(currentSpaceId, currentRoomId, { type: 'peer-left', userId }, ws)
          if (prev.size === 0) rtcRooms.delete(currentRoomId)
        }
        // Enter new rtc-room
        if (!rtcRooms.has(room.id)) rtcRooms.set(room.id, new Set())
        const rtcRoom = rtcRooms.get(room.id)
        const wasEmpty = rtcRoom.size === 0
        rtcRoom.add(ws)
        currentRoomId = room.id
        userLocation.set(userId, { spaceId: currentSpaceId, roomId: room.id })

        try {
          ws.send(JSON.stringify({
            type: 'room:entered',
            room,
            peers: [...rtcRoom]
              .filter(w => w !== ws && w.readyState === 1)
              .map(w => {
                // Look up the userId for this ws.
                for (const [uid, conn] of userConn.entries()) {
                  if (conn === w) return {
                    userId: uid,
                    displayName: userInfo.get(uid)?.displayName || 'convidado',
                  }
                }
                return null
              })
              .filter(Boolean),
          }))
        } catch {}
        // Notify others
        broadcastToRoom(currentSpaceId, room.id, {
          type: 'peer-joined',
          userId,
          displayName: userInfo.get(userId)?.displayName || 'convidado',
          wasEmpty,
        }, ws)
        return
      }

      case 'room:leave': {
        if (!currentRoomId) return
        const rtcRoom = rtcRooms.get(currentRoomId)
        if (rtcRoom) {
          rtcRoom.delete(ws)
          broadcastToRoom(currentSpaceId, currentRoomId, { type: 'peer-left', userId }, ws)
          if (rtcRoom.size === 0) rtcRooms.delete(currentRoomId)
        }
        currentRoomId = null
        userLocation.set(userId, { spaceId: currentSpaceId, roomId: null })
        try { ws.send(JSON.stringify({ type: 'room:left' })) } catch {}
        return
      }

      case 'room:thought': {
        if (!currentRoomId || !currentSpaceId) return
        const text = String(msg.text || '').trim().slice(0, 180)
        if (!text) return
        const thought = {
          type: 'room:thought',
          id: uid(),
          roomId: currentRoomId,
          userId,
          displayName: userInfo.get(userId)?.displayName || 'convidado',
          text,
          ts: Date.now(),
        }
        broadcastToRoom(currentSpaceId, currentRoomId, thought)
        return
      }

      case 'member:status': {
        if (!currentSpaceId) return
        const status = String(msg.status || '').trim().slice(0, 40)
        const info = userInfo.get(userId) || {}
        info.status = status || null
        userInfo.set(userId, info)
        broadcastToSpace(currentSpaceId, {
          type: 'member:status',
          userId,
          status: info.status,
        })
        return
      }

      // ---- WebRTC relay -------------------------------------------------
      default: {
        if (RELAY_MESSAGE_TYPES.has(msg.type)) {
          if (!currentRoomId) return
          relayInRoom(currentRoomId, ws, msg)
          return
        }
        // Unknown — ignore silently.
      }
    }
  })

  ws.on('close', () => {
    if (userId) {
      // Remove from current rtc-room
      if (currentRoomId && rtcRooms.has(currentRoomId)) {
        const rtcRoom = rtcRooms.get(currentRoomId)
        rtcRoom.delete(ws)
        broadcastToRoom(currentSpaceId, currentRoomId, { type: 'peer-left', userId }, ws)
        if (rtcRoom.size === 0) rtcRooms.delete(currentRoomId)
      }
      // Notify space
      if (currentSpaceId) {
        broadcastToSpace(currentSpaceId, {
          type: 'space:member-left',
          spaceId: currentSpaceId,
          userId,
        }, ws)
      }
      // Only forget the user if this was their latest socket (don't drop a
      // newer connection that replaced us).
      if (userConn.get(userId) === ws) {
        userConn.delete(userId)
        userInfo.delete(userId)
        userLocation.delete(userId)
      }
    }
    console.log('🔌 Conexão fechada')
  })
})

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.warn(`[signaling] porta ${PORT} já está em uso — ignorando.`)
    return
  }
  console.error('[signaling]', err)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎙️  VoiceCraft Signaling Server rodando em ws://0.0.0.0:${PORT}`)
  console.log(`📁 Spaces: ${spaces.length}, rooms: ${spaces.reduce((n, s) => n + s.rooms.length, 0)}`)
})
