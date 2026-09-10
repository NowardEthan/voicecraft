/**
 * Client notification / unread persistence (per Auth uid).
 * Room read cursors + inbox list. Badges derive from room lastMessage* vs lastRead.
 */
const READ_PREFIX = 'vc:notif:read:'
const INBOX_PREFIX = 'vc:notif:inbox:'
const LEGACY_SESSION_PREFIX = 'vc:chat:lastRead:'
const INBOX_MAX = 80

export function roomKey(spaceId, roomId) {
  return `${spaceId || ''}:${roomId || ''}`
}

function readKey(uid, spaceId, roomId) {
  return `${READ_PREFIX}${uid || 'anon'}:${roomKey(spaceId, roomId)}`
}

function inboxKey(uid) {
  return `${INBOX_PREFIX}${uid || 'anon'}`
}

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

/** @returns {{ at: number, id: string|null }} */
export function getLastRead(uid, spaceId, roomId) {
  if (typeof localStorage === 'undefined') return { at: 0, id: null }
  try {
    const raw = localStorage.getItem(readKey(uid, spaceId, roomId))
    if (raw) {
      const parsed = safeParse(raw, null)
      if (parsed && typeof parsed === 'object') {
        return {
          at: Number(parsed.at) || 0,
          id: parsed.id || null,
        }
      }
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) return { at: n, id: null }
    }
  } catch { /* ignore */ }

  // Migrate one-shot from MessageList sessionStorage
  try {
    const legacy = sessionStorage.getItem(`${LEGACY_SESSION_PREFIX}${roomKey(spaceId, roomId)}`)
    const n = Number(legacy)
    if (Number.isFinite(n) && n > 0) {
      setLastRead(uid, spaceId, roomId, { at: n })
      return { at: n, id: null }
    }
  } catch { /* ignore */ }

  return { at: 0, id: null }
}

export function setLastRead(uid, spaceId, roomId, { at, id = null } = {}) {
  if (!spaceId || !roomId || typeof localStorage === 'undefined') return
  const ts = Number(at) || Date.now()
  try {
    localStorage.setItem(
      readKey(uid, spaceId, roomId),
      JSON.stringify({ at: ts, id: id || null }),
    )
  } catch { /* ignore */ }
  try {
    sessionStorage.setItem(`${LEGACY_SESSION_PREFIX}${roomKey(spaceId, roomId)}`, String(ts))
  } catch { /* ignore */ }
}

export function markRoomRead(uid, spaceId, roomId, meta = {}) {
  const at = meta.at || Date.now()
  setLastRead(uid, spaceId, roomId, { at, id: meta.id || null })
  markInboxReadForRoom(uid, spaceId, roomId)
}

export function getInbox(uid) {
  if (typeof localStorage === 'undefined') return []
  try {
    const list = safeParse(localStorage.getItem(inboxKey(uid)), [])
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeInbox(uid, list) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(inboxKey(uid), JSON.stringify(list.slice(0, INBOX_MAX)))
  } catch { /* ignore */ }
}

/**
 * Append a message notification (deduped by message id).
 * @returns {object|null} the item if newly inserted
 */
export function pushMessageNotif(uid, item) {
  if (!uid || !item?.id) return null
  const list = getInbox(uid)
  if (list.some((n) => n.id === item.id)) return null
  const next = {
    id: item.id,
    kind: 'message',
    spaceId: item.spaceId,
    roomId: item.roomId,
    spaceName: item.spaceName || '',
    roomName: item.roomName || '',
    authorId: item.authorId || null,
    authorName: item.authorName || 'alguém',
    preview: String(item.preview || '').slice(0, 140),
    ts: item.ts || Date.now(),
    read: false,
  }
  writeInbox(uid, [next, ...list])
  return next
}

export function markNotifRead(uid, notifId) {
  const list = getInbox(uid).map((n) => (n.id === notifId ? { ...n, read: true } : n))
  writeInbox(uid, list)
  return list
}

export function markInboxReadForRoom(uid, spaceId, roomId) {
  const list = getInbox(uid).map((n) => (
    n.spaceId === spaceId && n.roomId === roomId ? { ...n, read: true } : n
  ))
  writeInbox(uid, list)
  return list
}

export function markAllNotifsRead(uid) {
  const list = getInbox(uid).map((n) => ({ ...n, read: true }))
  writeInbox(uid, list)
  return list
}

export function markAllRoomsRead(uid, roomActivityBySpace = {}) {
  const now = Date.now()
  Object.entries(roomActivityBySpace).forEach(([spaceId, rooms]) => {
    ;(rooms || []).forEach((room) => {
      if (!room?.id) return
      const at = Math.max(Number(room.lastMessageAt) || 0, now)
      setLastRead(uid, spaceId, room.id, {
        at,
        id: room.lastMessageId || null,
      })
    })
  })
  return markAllNotifsRead(uid)
}

export function isRoomUnread(uid, spaceId, room, currentUserId) {
  if (!room?.id || !spaceId) return false
  // Voice-only rooms don't carry text unread
  if (room.purpose === 'voice' || room.type === 'voice') return false
  const at = Number(room.lastMessageAt) || 0
  if (!at) return false
  if (room.lastAuthorId && currentUserId && room.lastAuthorId === currentUserId) return false
  const read = getLastRead(uid, spaceId, room.id)
  if (read.id && room.lastMessageId && read.id === room.lastMessageId) return false
  return at > (read.at || 0)
}

export function formatBadgeCount(n) {
  const c = Number(n) || 0
  if (c <= 0) return ''
  if (c > 99) return '99+'
  return String(c)
}
