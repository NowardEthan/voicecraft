/**
 * VoiceCraft realtime client — Firebase Auth + Firestore + Storage.
 *
 * Keeps the same event API the rest of the app already uses
 * (onSpaceChanged, enterRoom, sendSignal, …) so hooks do not change.
 * Durable data lives under vc_spaces / vc_users; WebRTC offers ride
 * as short-lived docs in the room's signals subcollection.
 */
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  deleteField,
} from 'firebase/firestore'
import { normalizeAutopurge } from '../../features/chat/commands/chatAutomation'
import { normalizeLobby, applyLobbyTemplate, lobbyDayKey } from '../../features/chat/lobbySchema'
import {
  normalizeRules,
  rulesContentFingerprint,
  findRulesRoom,
} from '../../features/chat/rulesSchema'
import { onAuthStateChanged, updateProfile } from 'firebase/auth'
import { auth, db, VC } from '../firebase/app'
import { deleteSpaceCover, uploadSpaceCover, uploadSpaceIcon, deleteSpaceIcon, uploadRoomCover, deleteRoomCover, uploadAnnounceAsset } from '../firebase/covers'
import {
  normalizeAnnounce,
  announcePreviewText,
  sanitizeAnnounceHtml,
  htmlToPlainText,
} from '../../features/chat/announceSchema.js'
import { uploadChatFile } from '../firebase/chatFiles'
import {
  attachUserPresence,
  attachSpacePresence,
  listenSpacePresence,
  isPresenceLastFresh,
} from '../firebase/presence'
import { canSpacePermission, normalizePerms } from '../../features/spaces/model/spaceRoles'
import {
  normalizeSpaceFonts,
  normalizeTypography,
} from '../../features/spaces/model/spaceTypography'

const ONLINE_MS = 45_000

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function isFresh(lastSeen) {
  const n = Number(lastSeen)
  return Number.isFinite(n) && Date.now() - n < ONLINE_MS
}

function friendlyName() {
  const animals = ['Fox', 'Owl', 'Cat', 'Bee', 'Cub', 'Lynx', 'Jay', 'Ram']
  const a = animals[Math.floor(Math.random() * animals.length)]
  const n = Math.random().toString(36).slice(2, 5)
  return `${a}-${n}`
}

function spaceRef(id) {
  return doc(db, VC.spaces, id)
}

function membersCol(spaceId) {
  return collection(db, VC.spaces, spaceId, 'members')
}

function roomsCol(spaceId) {
  return collection(db, VC.spaces, spaceId, 'rooms')
}

function roomRef(spaceId, roomId) {
  return doc(db, VC.spaces, spaceId, 'rooms', roomId)
}

function memberRef(spaceId, userId) {
  return doc(db, VC.spaces, spaceId, 'members', userId)
}

function peersCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'peers')
}

function signalsCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'signals')
}

function thoughtsCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'thoughts')
}

function messagesCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'messages')
}

function scheduledAnnouncementsCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'scheduled_announcements')
}

function scheduledAnnouncementRef(spaceId, roomId, id) {
  return doc(db, VC.spaces, spaceId, 'rooms', roomId, 'scheduled_announcements', id)
}

function toMemberView(id, data = {}) {
  return {
    userId: id,
    displayName: data.displayName || 'convidado',
    photoURL: data.photoURL || '',
    handle: data.handle || '',
    bio: data.bio || '',
    statusText: data.statusText || '',
    cover: data.cover || '',
    coverFit: data.coverFit || null,
    bannerHue: data.bannerHue ?? null,
    cardThemeId: data.cardThemeId || 'default',
    online: data.online === true && isFresh(data.lastSeen),
    lastSeen: data.lastSeen || null,
    location: data.location || null,
    status: data.status || data.statusText || null,
    roleIds: Array.isArray(data.roleIds) ? data.roleIds.filter(Boolean) : [],
    perms: data.perms && typeof data.perms === 'object' ? data.perms : null,
    rulesAcceptedAt: data.rulesAcceptedAt || null,
    rulesAcceptedVersion: Math.max(0, Math.floor(Number(data.rulesAcceptedVersion) || 0)),
  }
}

function mergeUserOntoMember(view, user = {}) {
  if (!user) return view
  // Incoming `view` (member doc) wins when it has a value. `user` (vc_users)
  // only fills gaps — otherwise live cosmetic updates never stick.
  const pick = (a, b, fallback = '') => (a != null && a !== '' ? a : (b != null && b !== '' ? b : fallback))
  return {
    ...view,
    displayName: pick(view.displayName, user.displayName, view.displayName),
    photoURL: pick(view.photoURL, user.photoURL, ''),
    handle: pick(view.handle, user.handle, ''),
    bio: pick(view.bio, user.bio, ''),
    statusText: pick(view.statusText, user.statusText, ''),
    cover: pick(view.cover, user.cover, ''),
    coverFit: view.coverFit || user.coverFit || null,
    bannerHue: view.bannerHue ?? user.bannerHue ?? null,
    cardThemeId: view.cardThemeId || user.cardThemeId || 'default',
    createdAt: view.createdAt || user.createdAt || null,
    status: view.status || user.statusText || user.status || null,
  }
}

function toRoomView(id, data = {}) {
  return {
    id,
    name: data.name || 'sala',
    type: data.type === 'voice' ? 'voice' : 'text',
    purpose: data.purpose || (data.type === 'voice' ? 'voice' : 'conversation'),
    icon: data.icon || null,
    emoji: data.emoji || null,
    color: data.color || null,
    nameStyle: data.nameStyle || 'default',
    fontId: typeof data.fontId === 'string' ? data.fontId.slice(0, 64) : 'default',
    cover: data.cover || null,
    coverFit: data.coverFit || null,
    createdBy: data.createdBy || null,
    createdAt: data.createdAt || Date.now(),
    groupId: data.groupId || null,
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : null,
    lastMessageAt: data.lastMessageAt || null,
    lastMessageId: data.lastMessageId || null,
    lastMessagePreview: data.lastMessagePreview || '',
    lastAuthorId: data.lastAuthorId || null,
    lastAuthorName: data.lastAuthorName || '',
    chatLocked: !!data.chatLocked,
    slowModeSeconds: Math.min(3600, Math.max(0, Number(data.slowModeSeconds) || 0)),
    lobby: normalizeLobby(data.lobby),
    rules: normalizeRules(data.rules),
  }
}

function normalizeVisibility(value) {
  return value === 'private' ? 'private' : 'public'
}

function toSpaceSummary(id, data = {}, joined = true) {
  return {
    id,
    name: data.name || 'sem nome',
    description: data.description || '',
    slogan: data.slogan || '',
    icon: data.icon || 'ph:users-three:outline',
    color: data.color || '#E74C3C',
    cover: data.cover || null,
    coverFit: data.coverFit || null,
    themeId: data.themeId || null,
    visibility: normalizeVisibility(data.visibility),
    typography: data.typography || null,
    fonts: Array.isArray(data.fonts) ? data.fonts : [],
    memberCount: Array.isArray(data.memberIds) ? data.memberIds.length : 0,
    roomCount: Number(data.roomCount) || 0,
    joined,
    createdBy: data.createdBy || null,
    chatAutomation: data.chatAutomation && typeof data.chatAutomation === 'object'
      ? { autopurge: normalizeAutopurge(data.chatAutomation.autopurge) }
      : null,
  }
}

function toSpaceFull(id, data, rooms, members) {
  return {
    ...toSpaceSummary(id, data, true),
    events: Array.isArray(data.events) ? data.events : [],
    createdAt: data.createdAt || Date.now(),
    members,
    rooms,
  }
}

export class SignalingClient {
  constructor() {
    this.ws = null
    this.userId = null
    this.displayName = null
    this._profile = {}
    this.spaceId = null
    this.roomId = null
    /** Space that owns the active voice peer/LiveKit membership (may differ from browse spaceId). */
    this.voiceSpaceId = null
    this.connected = false
    this._closed = false
    this._connectPromise = null
    this._unsubs = []
    this._spaceUnsubs = []
    this._roomUnsubs = []
    this._heartbeat = null
    this._spaceCache = null
    /** Cache of every recently visited Space, keyed by id. */
    this._spaceCacheById = new Map()

    this.peerJoinedCallback = null
    this.peerLeftCallback = null
    this.signalCallback = null
    this.errorCallback = null
    this.screenShareStateCallback = null
    this.spaceChangedCallback = null
    this.memberJoinedCallback = null
    this.memberLeftCallback = null
    this.roomChangedCallback = null
    this.statusCallback = null

    this._listeners = {
      spaceChanged: new Set(),
      memberJoined: new Set(),
      memberLeft: new Set(),
      roomChanged: new Set(),
      status: new Set(),
      peerJoined: new Set(),
      peerLeft: new Set(),
      screenShareState: new Set(),
      cameraState: new Set(),
      roomThought: new Set(),
      memberStatus: new Set(),
      chat: new Set(),
      presenceChanged: new Set(),
    }
  }

  // ----------------------------------------------------------------------
  // In-memory Space cache helpers.
  //
  // _spaceCache keeps the active space for backward compatibility, but we
  // also keep every visited Space around in a Map so switching between
  // recently visited Spaces becomes instant (no Firestore round-trip, no
  // second hydration, no flicker). The cache is invalidated on
  // updateSpace / deleteSpace / leaveSpace / Firestore delete events so
  // stale data never lingers.
  // ----------------------------------------------------------------------

  /** Read a cached Space by id without touching Firestore. */
  getCachedSpace(id) {
    if (!id) return null
    return this._spaceCacheById.get(id) || null
  }

  /** Store (or replace) a Space in the cache. Keeps _spaceCache in sync
   *  when the stored Space is the active one. */
  cacheSpace(space) {
    if (!space || !space.id) return space
    this._spaceCacheById.set(space.id, space)
    if (this.spaceId === space.id) this._spaceCache = space
    return space
  }

  /** Drop a Space from the cache. Clears _spaceCache if it pointed here. */
  invalidateCachedSpace(id) {
    if (!id) return
    if (this._spaceCacheById.has(id)) this._spaceCacheById.delete(id)
    if (this.spaceId === id) this._spaceCache = null
  }

  /** Wipe the entire cache (used by disconnect / sign-out). */
  clearSpaceCache() {
    this._spaceCacheById.clear()
    this._spaceCache = null
  }

  onSpaceChanged(fn)      { return this._subscribe('spaceChanged', fn) }
  onMemberJoined(fn)      { return this._subscribe('memberJoined', fn) }
  onMemberLeft(fn)        { return this._subscribe('memberLeft', fn) }
  onRoomChanged(fn)       { return this._subscribe('roomChanged', fn) }
  onStatus(fn)            { return this._subscribe('status', fn) }
  onPeerJoined(fn)        { return this._subscribe('peerJoined', fn) }
  onPeerLeft(fn)          { return this._subscribe('peerLeft', fn) }
  onScreenShareState(fn)  { return this._subscribe('screenShareState', fn) }
  onCameraState(fn)       { return this._subscribe('cameraState', fn) }
  onRoomThought(fn)       { return this._subscribe('roomThought', fn) }
  onMemberStatus(fn)      { return this._subscribe('memberStatus', fn) }
  onChat(fn)              { return this._subscribe('chat', fn) }
  onPresenceChanged(fn)   { return this._subscribe('presenceChanged', fn) }

  _subscribe(name, fn) {
    if (typeof fn !== 'function') return () => {}
    this._listeners[name].add(fn)
    return () => this._listeners[name].delete(fn)
  }

  _emit(name, payload) {
    const legacy = this[name + 'Callback']
    if (typeof legacy === 'function') {
      try { legacy(payload) } catch (e) { console.error(`[${name}Callback]`, e) }
    }
    for (const fn of this._listeners[name]) {
      try { fn(payload) } catch (e) { console.error(`[${name}]`, e) }
    }
  }

  _selfMember() {
    const members = this._spaceCache?.members
    if (!Array.isArray(members) || !this.userId) return null
    return members.find((m) => m.userId === this.userId) || null
  }

  _selfPerms() {
    return normalizePerms(this._selfMember()?.perms)
  }

  can(permission) {
    return canSpacePermission(
      this._spaceCache,
      { userId: this.userId, perms: this._selfPerms() },
      permission,
    )
  }

  _assertCan(permission, message) {
    if (this.can(permission)) return
    throw new Error(message || 'Sem permissão neste Space')
  }

  _loadDisplayName(uid = null) {
    try {
      const keyed = uid ? localStorage.getItem(`voicecraft:displayName:${uid}`) : null
      if (keyed) return keyed
      // Legacy global key — only adopt once, then migrate under this uid.
      const legacy = localStorage.getItem('voicecraft:displayName')
      if (legacy && uid) {
        localStorage.setItem(`voicecraft:displayName:${uid}`, legacy)
        try { localStorage.removeItem('voicecraft:displayName') } catch {}
        return legacy
      }
      if (legacy && !uid) return legacy
      const name = friendlyName()
      if (uid) localStorage.setItem(`voicecraft:displayName:${uid}`, name)
      else localStorage.setItem('voicecraft:displayName', name)
      return name
    } catch {
      return friendlyName()
    }
  }

  _storeDisplayName(name) {
    try {
      if (this.userId) {
        localStorage.setItem(`voicecraft:displayName:${this.userId}`, name)
        try { localStorage.removeItem('voicecraft:displayName') } catch {}
      } else {
        localStorage.setItem('voicecraft:displayName', name)
      }
    } catch { /* ignore */ }
  }

  _clear(list) {
    for (const off of list) {
      try { off() } catch { /* already dropped */ }
    }
    list.length = 0
  }

  connect() {
    if (this._connectPromise) return this._connectPromise
    this._closed = false
    this._connectPromise = this._connectFirebase()
      return this._connectPromise
    }

  async _connectFirebase() {
    this._emit('status', { type: 'reconnecting' })
    try {
      await new Promise((resolve, reject) => {
        if (auth.currentUser && !auth.currentUser.isAnonymous) return resolve()
        let settled = false
        const done = (fn, value) => {
          if (settled) return
          settled = true
          off()
          clearTimeout(timer)
          fn(value)
        }
        const off = onAuthStateChanged(auth, (user) => {
          if (user && !user.isAnonymous) done(resolve)
        })
        const timer = setTimeout(() => {
          done(reject, new Error('Entre na sua conta para continuar.'))
        }, 8000)
      })

      const user = auth.currentUser
      if (!user || user.isAnonymous) {
        throw new Error('Entre na sua conta para continuar.')
      }
      this.userId = user.uid
      this.displayName = user.displayName || this._loadDisplayName(user.uid)
      if (!user.displayName && this.displayName) {
        try { await updateProfile(user, { displayName: this.displayName }) } catch {}
      }

      const userRef = doc(db, VC.users, this.userId)
      const existing = await getDoc(userRef)
      const prior = existing.data() || {}
      this._profile = {
        displayName: this.displayName,
        photoURL: prior.photoURL || user.photoURL || '',
        handle: prior.handle || '',
        bio: prior.bio || '',
        statusText: prior.statusText || '',
        cover: prior.cover || '',
        coverFit: prior.coverFit || null,
        bannerHue: prior.bannerHue ?? 340,
        cardThemeId: prior.cardThemeId || 'default',
      }
      this.displayName = prior.displayName || this.displayName
      this._profile.displayName = this.displayName
      await setDoc(userRef, {
        displayName: this.displayName,
        email: user.email || null,
        photoURL: this._profile.photoURL || null,
        online: true,
        lastSeen: Date.now(),
        updatedAt: serverTimestamp(),
        ...(prior.createdAt ? {} : { createdAt: Date.now() }),
      }, { merge: true })

      this.ws = { readyState: 1 }
      this.connected = true
      this._listenMySpaces()
      this._startPresence()
      this._emit('status', { type: 'connected' })
      console.log('✅ Conectado ao Firebase')
    } catch (err) {
      this.connected = false
      this._emit('status', { type: 'failed' })
      const message = err?.message || 'Falha ao conectar no Firebase'
      if (this.errorCallback) this.errorCallback(message)
      throw new Error(message)
    }
  }

  _listenMySpaces() {
    const q = query(collection(db, VC.spaces), where('memberIds', 'array-contains', this.userId))
    const off = onSnapshot(q, (snap) => {
      const spaces = snap.docs.map((d) => toSpaceSummary(d.id, d.data(), true))
      this._emit('spaceChanged', {
        spaces,
        currentSpace: this._spaceCache,
      })
    }, (err) => {
      console.warn('[spaces list]', err)
    })
    this._unsubs.push(off)
  }

  _startPresence() {
    if (this._presenceOff) {
      try { this._presenceOff() } catch {}
      this._presenceOff = null
    }
    if (!this.userId) return
    this._presenceOff = attachUserPresence(this.userId)
    this._unsubs.push(() => {
      if (this._presenceOff) {
        try { this._presenceOff() } catch {}
        this._presenceOff = null
      }
    })
  }

  _bindSpacePresence(spaceId) {
    if (this._presenceFreshTimer) {
      clearInterval(this._presenceFreshTimer)
      this._presenceFreshTimer = null
    }
    if (this._spacePresenceOff) {
      try {
        // Full dispose only when leaving the space or switching spaces.
        if (typeof this._spacePresenceOff === 'function') this._spacePresenceOff()
        else this._spacePresenceOff.dispose?.(true)
      } catch {}
      this._spacePresenceOff = null
    }
    if (this._spacePresenceListenOff) {
      try { this._spacePresenceListenOff() } catch {}
      this._spacePresenceListenOff = null
    }
    if (!this.userId || !spaceId) return

    // While browsing another Space with a call still live, don't advertise
    // the voice roomId on the browse Space's RTDB presence.
    const roomForPresence = (
      this.voiceSpaceId && this.voiceSpaceId !== spaceId
    ) ? null : (this.roomId || null)

    const handle = attachSpacePresence(this.userId, spaceId, roomForPresence)
    this._spacePresenceOff = handle

    const applyPresenceMap = (map) => {
      const prev = this._presenceByUser || {}
      // Shallow compare: if every user's online/roomId stays the same we
      // must NOT bump _spaceCache, otherwise useCurrentSpace re-renders
      // the entire member tree on every harmless RTDB tick.
      let changed = false
      const aKeys = Object.keys(prev)
      const bKeys = Object.keys(map)
      if (aKeys.length !== bKeys.length) {
        changed = true
      } else {
        for (const k of bKeys) {
          const pa = prev[k]
          const pb = map[k]
          if (!pa) { changed = true; break }
          if (!!pa.online !== !!pb.online) { changed = true; break }
          if ((pa.roomId || null) !== (pb.roomId || null)) { changed = true; break }
        }
        if (!changed) {
          for (const k of aKeys) {
            if (!(k in map)) { changed = true; break }
          }
        }
      }
      this._presenceByUser = map

      if (changed && this._spaceCache?.members) {
        const members = this._spaceCache.members.map((m) => {
          const p = map[m.userId]
          if (!p) {
            // Keep last known status for members not yet in the map —
            // an empty/partial snapshot during reconnect must not wipe everyone.
            return m
          }
          return {
            ...m,
            online: !!p.online,
            location: p.online
              ? { spaceId, roomId: p.roomId || null }
              : null,
          }
        })
        this._spaceCache = this.cacheSpace({ ...this._spaceCache, members })
      }

      // Always emit so other listeners (e.g. live audio room composition)
      // can refresh; the per-member React state in useCurrentSpace
      // applies its own shallow check before triggering a re-render.
      this._emit('presenceChanged', { spaceId, presence: map })
    }

    this._spacePresenceListenOff = listenSpacePresence(spaceId, applyPresenceMap)

    // Re-evaluate freshness locally so stale "online" expires even if RTDB
    // is quiet (common when Electron throttles the socket briefly).
    if (this._presenceFreshTimer) {
      clearInterval(this._presenceFreshTimer)
      this._presenceFreshTimer = null
    }
    this._presenceFreshTimer = setInterval(() => {
      const prev = this._presenceByUser || {}
      if (!Object.keys(prev).length) return
      const next = {}
      let changed = false
      Object.keys(prev).forEach((uid) => {
        const row = prev[uid]
        const online = !!row.online && isPresenceLastFresh(row.lastChanged)
        if (online !== !!row.online) changed = true
        next[uid] = { ...row, online }
      })
      if (changed) applyPresenceMap(next)
    }, 15_000)
  }

  _updateSpacePresenceRoom() {
    const handle = this._spacePresenceOff
    if (handle && typeof handle.setRoomId === 'function') {
      const roomForPresence = (
        this.voiceSpaceId && this.voiceSpaceId !== this.spaceId
      ) ? null : (this.roomId || null)
      handle.setRoomId(roomForPresence)
      return
    }
    if (this.spaceId) this._bindSpacePresence(this.spaceId)
  }

  _clearSpacePresence() {
    if (this._presenceFreshTimer) {
      clearInterval(this._presenceFreshTimer)
      this._presenceFreshTimer = null
    }
    if (this._spacePresenceOff) {
      try {
        if (typeof this._spacePresenceOff === 'function') this._spacePresenceOff()
        else this._spacePresenceOff.dispose?.(true)
      } catch {}
      this._spacePresenceOff = null
    }
    if (this._spacePresenceListenOff) {
      try { this._spacePresenceListenOff() } catch {}
      this._spacePresenceListenOff = null
    }
    this._presenceByUser = {}
  }

  async _hydrateSpace(spaceId, prefetchedSnap = null, { enrichUsers = true } = {}) {
    const snap = prefetchedSnap?.exists?.() ? prefetchedSnap : await getDoc(spaceRef(spaceId))
    if (!snap.exists()) throw new Error('space não encontrado')
    const [roomsSnap, membersSnap] = await Promise.all([
      getDocs(roomsCol(spaceId)),
      getDocs(membersCol(spaceId)),
    ])
    const rooms = roomsSnap.docs.map((d) => toRoomView(d.id, d.data()))
    let members
    if (enrichUsers && membersSnap.docs.length > 0) {
      const userSnaps = await Promise.all(
        membersSnap.docs.map((d) => getDoc(doc(db, VC.users, d.id)).catch(() => null)),
      )
      const usersById = {}
      userSnaps.forEach((s) => {
        if (s?.exists()) usersById[s.id] = s.data()
      })
      members = membersSnap.docs.map((d) => mergeUserOntoMember(toMemberView(d.id, d.data()), usersById[d.id]))
    } else {
      members = membersSnap.docs.map((d) => toMemberView(d.id, d.data()))
    }
    const full = toSpaceFull(spaceId, snap.data(), rooms, members)
    // Mirror into the per-id cache so subsequent navigations to this Space
    // are instant. _spaceCache stays bound to the active space for legacy
    // callers (can(), _selfMember(), etc.).
    this.cacheSpace(full)
    return full
  }

  _attachSpaceListeners(spaceId) {
    this._clear(this._spaceUnsubs)

    let roomsReady = false
    let membersReady = false

    this._spaceUnsubs.push(onSnapshot(spaceRef(spaceId), (snap) => {
      if (!snap.exists()) {
        // Server-side delete event — drop from every cache so a stale
        // navigation later cannot resurrect this Space from memory.
        this.invalidateCachedSpace(spaceId)
        if (this.spaceId === spaceId) {
        this.spaceId = null
          this._spaceCache = null
          this._emit('spaceChanged', { space: null, currentSpace: null, deleted: spaceId })
        }
        return
      }
      const data = snap.data()
      const prev = this._spaceCache
      const full = toSpaceFull(spaceId, data, prev?.rooms || [], prev?.members || [])
      this.cacheSpace(full)
      this._emit('spaceChanged', { space: full, updated: true })
    }))

    this._spaceUnsubs.push(onSnapshot(roomsCol(spaceId), (snap) => {
      const rooms = snap.docs.map((d) => toRoomView(d.id, d.data()))
      if (this._spaceCache) {
        this._spaceCache = this.cacheSpace({
          ...this._spaceCache,
          rooms,
          roomCount: rooms.length,
        })
      }
      if (!roomsReady) {
        roomsReady = true
        return
      }
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          this._emit('roomChanged', { kind: 'created', spaceId, room: toRoomView(change.doc.id, change.doc.data()) })
        } else if (change.type === 'modified') {
          this._emit('roomChanged', { kind: 'updated', spaceId, room: toRoomView(change.doc.id, change.doc.data()) })
        } else if (change.type === 'removed') {
          this._emit('roomChanged', { kind: 'deleted', spaceId, roomId: change.doc.id })
        }
      })
    }))

    this._spaceUnsubs.push(onSnapshot(membersCol(spaceId), (snap) => {
      // Prefer the fresh member doc, but never let empty cosmetics wipe
      // values already enriched from vc_users.
      const pick = (a, b, fallback = '') =>
        (a != null && a !== '' ? a : (b != null && b !== '' ? b : fallback))
      const members = snap.docs.map((d) => {
        const view = toMemberView(d.id, d.data())
        const prev = this._spaceCache?.members?.find((m) => m.userId === d.id)
        if (!prev) return view
        return {
          ...prev,
          ...view,
          displayName: pick(view.displayName, prev.displayName, view.displayName),
          photoURL: pick(view.photoURL, prev.photoURL, ''),
          handle: pick(view.handle, prev.handle, ''),
          bio: pick(view.bio, prev.bio, ''),
          statusText: pick(view.statusText, prev.statusText, ''),
          cover: pick(view.cover, prev.cover, ''),
          coverFit: view.coverFit || prev.coverFit || null,
          bannerHue: view.bannerHue ?? prev.bannerHue ?? null,
          cardThemeId: pick(view.cardThemeId, prev.cardThemeId, 'default'),
          createdAt: view.createdAt || prev.createdAt || null,
        }
      })
      if (this._spaceCache) {
        this._spaceCache = this.cacheSpace({
          ...this._spaceCache,
          members,
          memberCount: members.length,
        })
      }
      if (!membersReady) {
        membersReady = true
        // Push enriched list into UI — first snapshot used to skip emits and
        // left the shell on optimistic / photo-stripped members.
        this._emit('spaceChanged', { space: this._spaceCache, updated: true })
        return
      }
      snap.docChanges().forEach((change) => {
        const view = toMemberView(change.doc.id, change.doc.data())
        if (change.type === 'added') {
          this._emit('memberJoined', view)
        } else if (change.type === 'removed') {
          this._emit('memberLeft', { userId: view.userId, spaceId })
        } else if (change.type === 'modified') {
          const member = members.find((m) => m.userId === view.userId) || view
          this._emit('memberStatus', { userId: view.userId, status: view.status, member })
          // Presence online/offline lives on RTDB — avoid full spaceChanged
          // storm from profile/location patches alone.
        }
      })
    }))
  }

  _attachRoomListeners(spaceId, roomId) {
    this._clear(this._roomUnsubs)
    const seenPeers = new Set()

    this._roomUnsubs.push(onSnapshot(peersCol(spaceId, roomId), (snap) => {
      const now = new Set(snap.docs.map((d) => d.id))
      for (const id of now) {
        if (id === this.userId) continue
        if (!seenPeers.has(id)) {
          const data = snap.docs.find((d) => d.id === id)?.data() || {}
          const msg = { type: 'peer-joined', userId: id, peerId: id, displayName: data.displayName }
          this._emit('peerJoined', msg)
          if (this.signalCallback) this.signalCallback(msg)
        }
      }
      for (const id of seenPeers) {
        if (!now.has(id) && id !== this.userId) {
          const msg = { type: 'peer-left', userId: id, peerId: id }
          this._emit('peerLeft', msg)
          if (this.signalCallback) this.signalCallback(msg)
        }
      }
      seenPeers.clear()
      now.forEach((id) => seenPeers.add(id))
    }))

    this._roomUnsubs.push(onSnapshot(signalsCol(spaceId, roomId), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const data = change.doc.data() || {}
        if (data.from === this.userId) return
        if (data.to && data.to !== this.userId) return
        const msg = {
          type: data.type,
          ...(data.payload || {}),
          from: data.from,
          to: data.to,
        }
        if (this.signalCallback) this.signalCallback(msg)
        if (data.type === 'screen-share-state') {
          this._emit('screenShareState', { active: !!msg.active, userId: data.from })
        }
        if (data.type === 'camera-state') {
          this._emit('cameraState', { active: !!msg.active, userId: data.from })
        }
        deleteDoc(change.doc.ref).catch(() => {})
      })
    }))

    this._roomUnsubs.push(onSnapshot(thoughtsCol(spaceId, roomId), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const data = change.doc.data() || {}
        this._emit('roomThought', {
          type: 'room:thought',
          id: change.doc.id,
          roomId,
          userId: data.userId,
          displayName: data.displayName,
          text: data.text,
          ts: data.ts,
        })
      })
    }))
  }

  async createSpace(name, description = '', icon = 'ph:users-three:outline', color = '#5865F2', extras = {}) {
    const spaceId = uid()
    let cover = null
    if (extras.cover) {
      cover = await uploadSpaceCover(spaceId, extras.cover)
    }
    let resolvedIcon = String(icon || 'ph:users-three:outline')
    if (resolvedIcon.startsWith('data:image/')) {
      const uploaded = await uploadSpaceIcon(spaceId, resolvedIcon)
      resolvedIcon = uploaded || resolvedIcon
    } else if (!/^https?:\/\//.test(resolvedIcon)) {
      resolvedIcon = resolvedIcon.slice(0, 80)
    }
    const payload = {
      name: String(name || '').trim() || 'sem nome',
      description: String(description || '').slice(0, 256),
      icon: resolvedIcon,
      color: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#E74C3C',
      cover,
      coverFit: extras.coverFit || null,
      themeId: extras.themeId || null,
      visibility: normalizeVisibility(extras.visibility),
      events: [],
      createdBy: this.userId,
      createdAt: Date.now(),
      memberIds: [this.userId],
      roomCount: 0,
    }
    if (extras.typography) {
      payload.typography = normalizeTypography(extras.typography)
    }
    await setDoc(spaceRef(spaceId), payload)
    await setDoc(memberRef(spaceId, this.userId), {
      ...this._memberProfileFields(),
      role: 'creator',
      online: true,
      lastSeen: Date.now(),
      joinedAt: Date.now(),
      location: { spaceId, roomId: null },
      status: null,
    })
    const space = toSpaceFull(spaceId, payload, [], [toMemberView(this.userId, {
      displayName: this.displayName, online: true, lastSeen: Date.now(),
    })])
    return { space }
  }

  async listPublicSpaces({ query: search = '', limit: max = 48 } = {}) {
    if (!this.userId) throw new Error('não autenticado')
    const q = query(
      collection(db, VC.spaces),
      where('visibility', '==', 'public'),
      limit(Math.min(Math.max(Number(max) || 48, 1), 100)),
    )
    const snap = await getDocs(q)
    const needle = String(search || '').trim().toLowerCase()
    const spaces = snap.docs.map((d) => {
      const data = d.data() || {}
      const memberIds = Array.isArray(data.memberIds) ? data.memberIds : []
      return toSpaceSummary(d.id, data, memberIds.includes(this.userId))
    })
    if (!needle) return spaces
    return spaces.filter((s) => {
      const hay = `${s.name} ${s.description}`.toLowerCase()
      return hay.includes(needle)
    })
  }

  async joinSpace(spaceId, { keepVoice = false } = {}) {
    // Cache hit short-circuit: if we already hydrated this Space in this
    // session, paint it instantly and skip the round-trip. We still need
    // to flip presence / voiceSpaceId, but those don't block the UI.
    const cached = this.getCachedSpace(spaceId)
    if (cached && cached.id) {
      const voiceSpaceId = this.voiceSpaceId || (this.roomId ? this.spaceId : null)
      const voiceRoomId = this.roomId
      const preserving = !!(keepVoice && voiceRoomId && voiceSpaceId)

      // Drop the current call only when not preserving it — keepVoice must
      // never interrupt an active voice session.
      if (!preserving && this.roomId) {
        try { await this.leaveRoom() } catch {}
      }

      this.spaceId = spaceId
      if (preserving) {
        this.voiceSpaceId = voiceSpaceId
        this.roomId = voiceRoomId
      } else {
        this.voiceSpaceId = null
        this.roomId = null
      }

      // Mirror the cached object into _spaceCache so legacy callers
      // (can(), _selfMember(), _reconcileMemberDocs, etc.) keep working.
      this._spaceCache = cached

      // Refresh presence doc + membership marker in the background.
      // We don't gate the UI on these — the cached data already paints.
      this._writeJoinPresence(spaceId).catch((err) => console.warn('[joinSpace] presence', err))

      // Only clean leftover Auth UIDs for this account — never mass-delete
      // members from a possibly stale cache of memberIds (that was kicking people).
      if (this.userId) {
        this._reconcileMemberDocs(spaceId)
          .catch((err) => console.warn('[joinSpace] reconcile', err))
      }

      // Still attach fresh listeners so we react to new messages / room
      // changes — the cached snapshot may be a few minutes old.
      this._attachSpaceListeners(spaceId)
      this._bindSpacePresence(spaceId)

      this._emit('spaceChanged', {
        space: cached,
        currentSpace: cached,
        currentRoom: preserving ? { id: voiceRoomId } : null,
        voicePreserved: preserving,
        fromCache: true,
      })
      return { space: cached, fromCache: true }
    }

    // Cache miss: full hydration path. This still runs ONE _hydrateSpace
    // (the original code ran it twice in immediate succession — once
    // before reconcile and once after, which doubled every first-visit
    // round-trip for no observable benefit).
    const snap = await getDoc(spaceRef(spaceId))
    if (!snap.exists()) throw new Error('space não encontrado')
    const data = snap.data() || {}
    const memberIds = Array.isArray(data.memberIds) ? data.memberIds : []
    const alreadyMember = !!this.userId && memberIds.includes(this.userId)

    const voiceSpaceId = this.voiceSpaceId || (this.roomId ? this.spaceId : null)
    const voiceRoomId = this.roomId
    const preserving = !!(keepVoice && voiceRoomId && voiceSpaceId)

    if (!preserving && this.roomId) {
      try { await this.leaveRoom() } catch {}
    }

    // Already a member: skip arrayUnion and hydrate without N user round-trips
    // (member/room listeners enrich profiles right after attach).
    const membershipWrite = alreadyMember
      ? Promise.resolve()
      : updateDoc(spaceRef(spaceId), { memberIds: arrayUnion(this.userId) })

    const presenceWrite = setDoc(memberRef(spaceId, this.userId), {
      ...this._memberProfileFields(),
      role: data.createdBy === this.userId ? 'creator' : 'member',
      online: true,
      lastSeen: Date.now(),
      ...(alreadyMember ? {} : { joinedAt: Date.now() }),
      // Browse location — voice membership stays on voiceSpaceId when preserving.
      location: { spaceId, roomId: null },
    }, { merge: true })

    const voicePresenceWrite = preserving
      ? setDoc(memberRef(voiceSpaceId, this.userId), {
        location: { spaceId: voiceSpaceId, roomId: voiceRoomId },
        online: true,
        lastSeen: Date.now(),
      }, { merge: true }).catch(() => {})
      : Promise.resolve()

    this.spaceId = spaceId
    if (preserving) {
      this.voiceSpaceId = voiceSpaceId
      this.roomId = voiceRoomId
    } else {
      this.voiceSpaceId = null
      this.roomId = null
    }

    const [space] = await Promise.all([
      this._hydrateSpace(spaceId, snap, { enrichUsers: !alreadyMember }),
      membershipWrite,
      presenceWrite,
      voicePresenceWrite,
    ])

    // Fire-and-forget: clean duplicate Auth UIDs for this account only.
    if (this.userId) {
      this._reconcileMemberDocs(spaceId)
        .catch((err) => console.warn('[joinSpace] reconcile', err))
    }

    this._attachSpaceListeners(spaceId)
    this._bindSpacePresence(spaceId)
    this._emit('spaceChanged', {
      space,
      currentSpace: space,
      currentRoom: preserving ? { id: voiceRoomId } : null,
      voicePreserved: preserving,
    })
    if (!alreadyMember) {
      this._postLobbyEventsForSpace('join').catch((err) => {
        console.warn('[joinSpace] lobby', err)
      })
    }
    return { space }
  }

  /** Write the local member's presence row on join. Used by the cache-hit
   *  branch where we want to mark ourselves online without gating the UI. */
  _writeJoinPresence(spaceId) {
    if (!this.userId || !spaceId) return Promise.resolve()
    return setDoc(memberRef(spaceId, this.userId), {
      ...this._memberProfileFields(),
      online: true,
      lastSeen: Date.now(),
      location: { spaceId, roomId: null },
    }, { merge: true })
  }

  /**
   * Clean leftover member docs for THIS account only (same email, other Auth UID
   * after Google/email re-login). Never deletes other people — a stale cached
   * memberIds list previously caused mass kicks on join.
   * Removes one UID at a time so Firestore rules (±1 memberIds) stay happy.
   */
  async _reconcileMemberDocs(spaceId) {
    if (!spaceId || !this.userId) return
    const myEmail = (auth.currentUser?.email || '').trim().toLowerCase()
    if (!myEmail) return

    const snap = await getDocs(membersCol(spaceId))
    const toDelete = []

    for (const d of snap.docs) {
      if (d.id === this.userId) continue
      try {
        const userSnap = await getDoc(doc(db, VC.users, d.id))
        const email = String(userSnap.data()?.email || '').trim().toLowerCase()
        if (email && email === myEmail) toDelete.push(d.id)
      } catch { /* ignore */ }
    }

    if (toDelete.length === 0) return

    const unique = [...new Set(toDelete)].slice(0, 40)
    const spaceSnap = await getDoc(spaceRef(spaceId))
    const createdBy = spaceSnap.data()?.createdBy

    for (const uid of unique) {
      try {
        await deleteDoc(memberRef(spaceId, uid))
      } catch (err) {
        console.warn('[reconcile] member doc', uid, err)
      }
      try {
        const claimOwner = createdBy === uid
        await updateDoc(spaceRef(spaceId), {
          memberIds: arrayRemove(uid),
          ...(claimOwner ? { createdBy: this.userId } : {}),
        })
      } catch (err) {
        // No kick/edit on this space: orphan may linger in memberIds until
        // an admin removes it; membership doc is already gone above.
        console.warn('[reconcile] memberIds', uid, err)
      }
    }
  }

  async leaveSpace(spaceId) {
    const id = spaceId || this.spaceId
    if (!id || !this.userId) return

    // Post leave cards while we still have space context / lobby rooms.
    if (this.spaceId === id) {
      try { await this._postLobbyEventsForSpace('leave') } catch (err) {
        console.warn('[leaveSpace] lobby', err)
      }
    }

    // Leaving the Space that owns the call also ends the call.
    const voiceSpace = this.voiceSpaceId || this.spaceId
    if (this.roomId && voiceSpace === id) {
      try { await this.leaveRoom() } catch {}
    }

    this._clearSpacePresence()
    // Keep voice room listeners if call lives in another Space.
    if (!this.roomId || this.voiceSpaceId === id || !this.voiceSpaceId) {
      this._clear(this._roomUnsubs)
    }
    this._clear(this._spaceUnsubs)
    try {
      await updateDoc(spaceRef(id), { memberIds: arrayRemove(this.userId) })
      await deleteDoc(memberRef(id, this.userId))
    } catch (err) {
      console.warn('[leaveSpace]', err)
    }
    if (this.spaceId === id) this.spaceId = this.voiceSpaceId || null
    if (this.voiceSpaceId === id) {
      this.voiceSpaceId = null
        this.roomId = null
    }
    this.invalidateCachedSpace(id)
        this._emit('spaceChanged', {
      space: null,
      currentSpace: null,
          currentRoom: null,
      left: id,
    })
  }

  async deleteSpace(spaceId) {
    const id = spaceId || this.spaceId
    if (!id) return
    const snap = await getDoc(spaceRef(id))
    if (!snap.exists()) return
    if (snap.data().createdBy !== this.userId) {
      throw new Error('só o criador pode deletar')
    }
    const [roomsSnap, membersSnap] = await Promise.all([
      getDocs(roomsCol(id)),
      getDocs(membersCol(id)),
    ])
    const batch = writeBatch(db)
    roomsSnap.docs.forEach((d) => batch.delete(d.ref))
    membersSnap.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(spaceRef(id))
    await batch.commit()
    await deleteSpaceCover(id)
    await deleteSpaceIcon(id)
    if (this.spaceId === id) {
      this._clearSpacePresence()
      this._clear(this._roomUnsubs)
      this._clear(this._spaceUnsubs)
        this.spaceId = null
        this.roomId = null
      this._spaceCache = null
        }
    this.invalidateCachedSpace(id)
        this._emit('spaceChanged', {
          space: null,
          currentSpace: null,
      deleted: id,
    })
  }

  async updateSpace(spaceId, updates = {}) {
    const id = spaceId || this.spaceId
    if (!id) return

    const keys = Object.keys(updates || {}).filter((k) => updates[k] !== undefined)
    const onlyEvents = keys.length > 0 && keys.every((k) => k === 'events')
    if (onlyEvents) {
      if (!this.can('manage_events') && !this.can('edit_space')) {
        throw new Error('só quem tem permissão de eventos pode alterar')
      }
    } else {
      this._assertCan('edit_space', 'só o criador ou quem tem permissão pode alterar este Space')
    }

    const next = {}
    if (typeof updates.name === 'string') next.name = updates.name.slice(0, 64).trim()
    if (typeof updates.description === 'string') next.description = updates.description.slice(0, 256)
    if (typeof updates.slogan === 'string') next.slogan = updates.slogan.slice(0, 80)
    if (typeof updates.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.color)) next.color = updates.color
    if (Array.isArray(updates.events)) next.events = updates.events
    if (updates.coverFit !== undefined) next.coverFit = updates.coverFit
    if (updates.visibility !== undefined) next.visibility = normalizeVisibility(updates.visibility)
    if (updates.typography !== undefined) {
      next.typography = normalizeTypography(updates.typography)
    }
    if (updates.fonts !== undefined) {
      next.fonts = normalizeSpaceFonts(updates.fonts).slice(0, 24)
    }
    if (typeof updates.icon === 'string') {
      if (updates.icon.startsWith('data:image/')) {
        const uploaded = await uploadSpaceIcon(id, updates.icon)
        next.icon = uploaded || updates.icon
      } else if (/^https?:\/\//.test(updates.icon)) {
        next.icon = updates.icon
      } else {
        next.icon = updates.icon.slice(0, 80)
      }
    }
    if (updates.cover === null) {
      await deleteSpaceCover(id)
      next.cover = null
    } else if (typeof updates.cover === 'string') {
      next.cover = await uploadSpaceCover(id, updates.cover)
    }
    if (Object.keys(next).length === 0) return next
    await updateDoc(spaceRef(id), next)
    if (this._spaceCache?.id === id) {
      // Mirror into per-id cache so the next visit gets the fresh values.
      this._spaceCache = this.cacheSpace({ ...this._spaceCache, ...next })
      this._emit('spaceChanged', { space: this._spaceCache, updated: true })
    } else {
      // The Space isn't active, but we may still have it cached from a
      // prior visit — update the cached copy in place without firing
      // any UI event.
      const cached = this._spaceCacheById.get(id)
      if (cached) this._spaceCacheById.set(id, { ...cached, ...next })
    }
    return next
  }

  async createRoom(name, type = 'voice', purpose, cosmetics = {}) {
    if (!this.spaceId) throw new Error('entre num space primeiro')
    this._assertCan('manage_rooms', 'só o criador ou quem tem permissão pode criar salas neste Space')
    const roomType = type === 'voice' ? 'voice' : 'text'
    const payload = {
      name: String(name || '').trim() || 'sem nome',
      type: roomType,
      purpose: String(purpose || (roomType === 'voice' ? 'voice' : 'conversation')).slice(0, 32),
      createdBy: this.userId,
      createdAt: Date.now(),
    }
    if (cosmetics?.icon) payload.icon = String(cosmetics.icon).slice(0, 80)
    if (cosmetics?.emoji) payload.emoji = String(cosmetics.emoji).slice(0, 16)
    if (cosmetics?.color) payload.color = String(cosmetics.color).slice(0, 16)
    if (cosmetics?.nameStyle) payload.nameStyle = String(cosmetics.nameStyle).slice(0, 24)
    if (cosmetics?.fontId) payload.fontId = String(cosmetics.fontId).slice(0, 64)
    if (cosmetics?.coverFit && typeof cosmetics.coverFit === 'object') {
      payload.coverFit = cosmetics.coverFit
    }
    if (cosmetics?.groupId) payload.groupId = String(cosmetics.groupId).slice(0, 64)
    payload.sortOrder = typeof cosmetics?.sortOrder === 'number' ? cosmetics.sortOrder : Date.now()

    const ref = await addDoc(roomsCol(this.spaceId), payload)
    let coverUrl = null
    if (typeof cosmetics?.cover === 'string' && cosmetics.cover) {
      try {
        coverUrl = await uploadRoomCover(this.spaceId, ref.id, cosmetics.cover)
        if (coverUrl) {
          await updateDoc(ref, { cover: coverUrl })
          payload.cover = coverUrl
        }
      } catch (err) {
        console.warn('[createRoom] cover upload failed', err)
      }
    }
    try {
      await updateDoc(spaceRef(this.spaceId), { roomCount: (this._spaceCache?.rooms?.length || 0) + 1 })
    } catch {}
    return { room: toRoomView(ref.id, payload) }
  }

  async updateRoom(roomId, updates = {}) {
    if (!this.spaceId || !roomId) return
    this._assertCan('manage_rooms', 'só o criador ou quem tem permissão pode editar salas neste Space')
    const next = {}
    if (typeof updates.name === 'string') {
      next.name = updates.name.slice(0, 64).trim() || 'sem nome'
    }
    if (typeof updates.purpose === 'string') {
      const purpose = updates.purpose.slice(0, 32)
      next.purpose = purpose
      next.type = purpose === 'voice' ? 'voice' : 'text'
    } else if (typeof updates.type === 'string') {
      next.type = updates.type === 'voice' ? 'voice' : 'text'
    }
    if (updates.icon === null) next.icon = null
    else if (typeof updates.icon === 'string') next.icon = updates.icon.slice(0, 80)
    if (updates.emoji === null) next.emoji = null
    else if (typeof updates.emoji === 'string') next.emoji = updates.emoji.slice(0, 16)
    if (updates.color === null) next.color = null
    else if (typeof updates.color === 'string') next.color = updates.color.slice(0, 16)
    if (typeof updates.nameStyle === 'string') next.nameStyle = updates.nameStyle.slice(0, 24)
    if (typeof updates.fontId === 'string') next.fontId = updates.fontId.slice(0, 64)
    if (updates.coverFit === null) next.coverFit = null
    else if (updates.coverFit && typeof updates.coverFit === 'object') next.coverFit = updates.coverFit
    if (updates.groupId === null) next.groupId = null
    else if (typeof updates.groupId === 'string') next.groupId = updates.groupId.slice(0, 64)
    if (typeof updates.sortOrder === 'number') next.sortOrder = updates.sortOrder

    if (updates.cover === null) {
      try { await deleteRoomCover(this.spaceId, roomId) } catch {}
      next.cover = null
    } else if (typeof updates.cover === 'string' && updates.cover) {
      try {
        const url = await uploadRoomCover(this.spaceId, roomId, updates.cover)
        if (url) next.cover = url
      } catch (err) {
        console.warn('[updateRoom] cover upload failed', err)
      }
    }

    if (Object.keys(next).length === 0) return
    await updateDoc(roomRef(this.spaceId, roomId), next)
    const snap = await getDoc(roomRef(this.spaceId, roomId))
    if (!snap.exists()) return
    return { room: toRoomView(roomId, snap.data()) }
  }

  async deleteRoom(roomId) {
    if (!this.spaceId || !roomId) return
    this._assertCan('manage_rooms', 'só o criador ou quem tem permissão pode excluir salas neste Space')
    try { await deleteRoomCover(this.spaceId, roomId) } catch {}
    await deleteDoc(roomRef(this.spaceId, roomId))
    try {
      const remaining = Math.max(0, (this._spaceCache?.rooms?.length || 1) - 1)
      await updateDoc(spaceRef(this.spaceId), { roomCount: remaining })
    } catch {}
    if (this.roomId === roomId) {
      this._clear(this._roomUnsubs)
      this.roomId = null
    }
  }

  /** Remove a member from the current Space (kick permission). */
  async kickMember(targetUid) {
    const spaceId = this.spaceId
    if (!spaceId || !targetUid) return
    if (targetUid === this.userId) throw new Error('use sair do Space para se remover')
    this._assertCan('kick', 'sem permissão para expulsar membros')
    if (this._spaceCache?.createdBy === targetUid) {
      throw new Error('não dá pra expulsar o criador')
    }
    await updateDoc(spaceRef(spaceId), { memberIds: arrayRemove(targetUid) })
    try { await deleteDoc(memberRef(spaceId, targetUid)) } catch {}
    if (this._spaceCache) {
      this._spaceCache = this.cacheSpace({
        ...this._spaceCache,
        memberIds: (this._spaceCache.memberIds || []).filter((id) => id !== targetUid),
        members: (this._spaceCache.members || []).filter((m) => m.userId !== targetUid),
      })
      this._emit('spaceChanged', { space: this._spaceCache, updated: true })
      this._emit('memberLeft', { userId: targetUid, spaceId })
    }
  }

  async enterRoom(roomId) {
    if (!this.spaceId) throw new Error('entre num space primeiro')
    const snap = await getDoc(roomRef(this.spaceId, roomId))
    if (!snap.exists()) throw new Error('room não encontrada')

    const prevVoiceSpace = this.voiceSpaceId || this.spaceId
    const prevRoom = this.roomId
    if (prevRoom && (prevRoom !== roomId || prevVoiceSpace !== this.spaceId)) {
      try { await deleteDoc(doc(peersCol(prevVoiceSpace, prevRoom), this.userId)) } catch {}
      try {
        await setDoc(memberRef(prevVoiceSpace, this.userId), {
          location: { spaceId: prevVoiceSpace, roomId: null },
        }, { merge: true })
      } catch {}
      this._clear(this._roomUnsubs)
    }

    this.voiceSpaceId = this.spaceId
    this.roomId = roomId
    await setDoc(doc(peersCol(this.spaceId, roomId), this.userId), {
      displayName: this.displayName,
      photoURL: this._profile.photoURL || '',
      joinedAt: Date.now(),
    })
    await setDoc(memberRef(this.spaceId, this.userId), {
      location: { spaceId: this.spaceId, roomId },
    }, { merge: true })
    this._updateSpacePresenceRoom()
    this._attachRoomListeners(this.spaceId, roomId)
    const peersSnap = await getDocs(peersCol(this.spaceId, roomId))
    const room = toRoomView(roomId, snap.data())
    const peers = peersSnap.docs
      .filter((d) => d.id !== this.userId)
      .map((d) => ({
        userId: d.id,
        displayName: d.data().displayName || 'convidado',
        photoURL: d.data().photoURL || '',
      }))
    this._emit('roomChanged', { kind: 'entered', room, peers })
    return { room, peers }
  }

  async leaveRoom() {
    const spaceId = this.voiceSpaceId || this.spaceId
    const roomId = this.roomId
    if (!spaceId || !roomId) return
    try { await deleteDoc(doc(peersCol(spaceId, roomId), this.userId)) } catch {}
    try {
      await setDoc(memberRef(spaceId, this.userId), {
        location: { spaceId, roomId: null },
      }, { merge: true })
    } catch {}
    this._clear(this._roomUnsubs)
    this.roomId = null
    this.voiceSpaceId = null
    this._updateSpacePresenceRoom()
    this._emit('roomChanged', { kind: 'left' })
  }

  async sendThought(text) {
    const spaceId = this.voiceSpaceId || this.spaceId
    if (!spaceId || !this.roomId) return
    const trimmed = String(text || '').trim().slice(0, 180)
    if (!trimmed) return
    await addDoc(thoughtsCol(spaceId, this.roomId), {
      userId: this.userId,
      displayName: this.displayName,
      text: trimmed,
      ts: Date.now(),
    })
  }

  async sendMemberStatus(status) {
    if (!this.userId) return
    const value = String(status || '').trim().slice(0, 40) || null
    await setDoc(doc(db, VC.users, this.userId), { status: value }, { merge: true })
    if (this.spaceId) {
      await setDoc(memberRef(this.spaceId, this.userId), { status: value }, { merge: true })
    }
  }

  sendSignal(type, payload = {}) {
    const spaceId = this.voiceSpaceId || this.spaceId
    if (!spaceId || !this.roomId) return
    addDoc(signalsCol(spaceId, this.roomId), {
      from: this.userId,
      to: payload.to || null,
      type,
      payload,
      ts: Date.now(),
    }).catch((err) => console.warn('[signal]', err))
  }

  sendScreenShareState(active) {
    this.sendSignal('screen-share-state', { active: !!active })
    this._emit('screenShareState', { active: !!active, userId: this.userId })
  }

  sendCameraState(active) {
    this.sendSignal('camera-state', { active: !!active })
    this._emit('cameraState', { active: !!active, userId: this.userId })
  }

  async uploadChatFile(file, roomId = null) {
    const sid = this.voiceSpaceId || this.spaceId
    const rid = roomId || this.roomId
    if (!sid || !rid || !file) return null
    return uploadChatFile(sid, rid, file)
  }

  async sendChatMessage(message, roomId = null) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !message) return
    const id = message.id || uid()
    const clean = JSON.parse(JSON.stringify({
      ...message,
      id,
      authorId: this.userId,
      ts: message.ts || Date.now(),
    }))
    // Doc id === client message id so edit/delete can target by id.
    await setDoc(doc(messagesCol(this.spaceId, rid), id), clean, { merge: true })
    const preview = String(clean.text || clean.attachment?.name || 'Anexo').slice(0, 140)
    try {
      await updateDoc(roomRef(this.spaceId, rid), {
        lastMessageAt: clean.ts,
        lastMessageId: id,
        lastMessagePreview: preview,
        lastAuthorId: this.userId,
        lastAuthorName: clean.author || this.displayName || 'alguém',
      })
    } catch (err) {
      console.warn('[sendChatMessage] lastMessage', err)
    }
  }

  /**
   * Soft-delete a chat message in Firestore so it stays deleted across
   * room/space switches. Supports both new docs (id === doc id) and
   * legacy addDoc rows that stored client id as a field.
   */
  async deleteChatMessage(messageId, roomId = null) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !messageId) return
    const col = messagesCol(this.spaceId, rid)
    const patch = {
      deleted: true,
      text: '',
      deletedAt: Date.now(),
      deletedBy: this.userId,
      pinned: false,
      pinnedAt: deleteField(),
      pinnedBy: deleteField(),
    }
    const directRef = doc(col, messageId)
    const direct = await getDoc(directRef)
    if (direct.exists()) {
      await updateDoc(directRef, patch)
      return
    }
    const q = query(col, where('id', '==', messageId), limit(1))
    const found = await getDocs(q)
    if (found.empty) {
      console.warn('[deleteChatMessage] message not found', messageId)
      return
    }
    await updateDoc(found.docs[0].ref, patch)
  }

  /**
   * Pin / unpin a chat message. Persists on the message doc so all
   * clients see it via listenChat. Max 50 pins per room.
   */
  async pinChatMessage(messageId, pinned = true, roomId = null) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !messageId) return null

    const col = messagesCol(this.spaceId, rid)
    let targetRef = doc(col, messageId)
    let snap = await getDoc(targetRef)
    if (!snap.exists()) {
      const q = query(col, where('id', '==', messageId), limit(1))
      const found = await getDocs(q)
      if (found.empty) throw new Error('Mensagem não encontrada')
      targetRef = found.docs[0].ref
      snap = found.docs[0]
    }

    const data = snap.data() || {}
    if (data.deleted) throw new Error('Não dá para fixar mensagem apagada')

    const isAuthor = data.authorId === this.userId
    if (!isAuthor && !this.can('mod_chat')) {
      throw new Error('só o autor ou quem modera o chat pode fixar')
    }

    if (pinned) {
      try {
        const pinnedSnap = await getDocs(query(col, where('pinned', '==', true), limit(51)))
        const already = pinnedSnap.docs.some((d) => d.id === targetRef.id || d.data()?.id === messageId)
        if (!already && pinnedSnap.size >= 50) {
          throw new Error('Limite de 50 mensagens fixadas nesta sala')
        }
      } catch (err) {
        if (err?.message?.includes('Limite de 50')) throw err
        console.warn('[pinChatMessage] count', err)
      }
      const meta = { pinned: true, pinnedAt: Date.now(), pinnedBy: this.userId }
      await updateDoc(targetRef, meta)
      return meta
    }

    await updateDoc(targetRef, {
      pinned: false,
      pinnedAt: deleteField(),
      pinnedBy: deleteField(),
    })
    return { pinned: false }
  }

  /**
   * Hard-delete chat messages in the current (or given) room — including
   * already soft-deleted stubs ("mensagem apagada"). Purge empties the
   * channel; single-message delete stays soft-delete.
   * @returns {Promise<number>} number of docs removed
   */
  async purgeChatMessages(roomId = null, { authorId = null, beforeTs = null, max = 2000 } = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) return 0
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')

    const col = messagesCol(this.spaceId, rid)
    const pageSize = 200
    const maxTotal = Math.min(Math.max(Number(max) || 2000, 1), 5000)
    let purged = 0
    let cursor = null

    while (purged < maxTotal) {
      const constraints = [orderBy('ts', 'asc')]
      if (cursor) constraints.push(startAfter(cursor))
      constraints.push(limit(pageSize))
      const snap = await getDocs(query(col, ...constraints))
      if (snap.empty) break

      const batch = writeBatch(db)
      let ops = 0
      for (const d of snap.docs) {
        if (purged + ops >= maxTotal) break
        const data = d.data() || {}
        if (authorId && data.authorId !== authorId) continue
        if (beforeTs != null && Number(data.ts || 0) >= Number(beforeTs)) continue
        batch.delete(d.ref)
        ops += 1
      }

      if (ops > 0) {
        await batch.commit()
        purged += ops
        // Deletes invalidate pagination — rescan from the start.
        cursor = null
        continue
      }

      // No matches in this page (author/before filter): advance.
      cursor = snap.docs[snap.docs.length - 1]
      if (snap.size < pageSize) break
    }
    return purged
  }

  /**
   * Persist chatAutomation.autopurge on the Space (mod_chat or edit_space).
   */
  async updateChatAutomation(spaceId, autopurge) {
    const id = spaceId || this.spaceId
    if (!id) throw new Error('Space inválido')
    if (!this.can('mod_chat') && !this.can('edit_space')) {
      throw new Error('precisa de Moderar chat ou Editar Space')
    }
    const next = {
      chatAutomation: {
        autopurge: normalizeAutopurge(autopurge),
      },
    }
    await updateDoc(spaceRef(id), next)
    if (this._spaceCache?.id === id) {
      this._spaceCache = this.cacheSpace({ ...this._spaceCache, ...next })
      this._emit('spaceChanged', { space: this._spaceCache, updated: true })
    } else {
      const cached = this._spaceCacheById.get(id)
      if (cached) this._spaceCacheById.set(id, { ...cached, ...next })
    }
    return next
  }

  /**
   * Chat moderation flags on a room (lock / slowmode). Requires mod_chat.
   */
  async updateRoomChatModeration(roomId, updates = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) throw new Error('Sala inválida')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')
    const next = {}
    if (updates.chatLocked !== undefined) next.chatLocked = !!updates.chatLocked
    if (updates.slowModeSeconds !== undefined) {
      next.slowModeSeconds = Math.min(3600, Math.max(0, Number(updates.slowModeSeconds) || 0))
    }
    if (Object.keys(next).length === 0) return null
    await updateDoc(roomRef(this.spaceId, rid), next)
    const snap = await getDoc(roomRef(this.spaceId, rid))
    if (!snap.exists()) return null
    const room = toRoomView(rid, snap.data())
    this._emit('roomChanged', { kind: 'updated', spaceId: this.spaceId, room })
    return { room }
  }

  /** Lobby / welcome-screen config for a conversation room. Requires mod_chat. */
  async updateRoomLobby(roomId, lobbyConfig = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) throw new Error('Sala inválida')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')
    let lobby = normalizeLobby(lobbyConfig)
    lobby = {
      ...lobby,
      body: lobby.body || htmlToPlainText(lobby.bodyHtml),
      bodyHtml: sanitizeAnnounceHtml(lobby.bodyHtml),
    }

    const uploadField = async (key, kind) => {
      const value = lobby[key]
      if (!value || typeof value !== 'string' || !value.startsWith('data:image/')) return
      const url = await uploadAnnounceAsset(this.spaceId, rid, value, kind)
      if (!url) throw new Error(`Falha ao enviar ${kind}`)
      lobby = { ...lobby, [key]: url }
    }
    await uploadField('banner', 'lobby-banner')
    await uploadField('iconImage', 'lobby-icon')
    await uploadField('authorPhoto', 'lobby-author')

    await updateDoc(roomRef(this.spaceId, rid), { lobby })
    const snap = await getDoc(roomRef(this.spaceId, rid))
    if (!snap.exists()) return null
    const room = toRoomView(rid, snap.data())
    this._emit('roomChanged', { kind: 'updated', spaceId: this.spaceId, room })
    return { room }
  }

  /** Rules channel config. Requires mod_chat. Exclusive: only one enabled rules room per Space. */
  async updateRoomRules(roomId, rulesConfig = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) throw new Error('Sala inválida')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')

    const prevSnap = await getDoc(roomRef(this.spaceId, rid))
    const prevRules = normalizeRules(prevSnap.exists() ? prevSnap.data()?.rules : null)

    let rules = normalizeRules(rulesConfig)
    rules = {
      ...rules,
      body: rules.body || htmlToPlainText(rules.bodyHtml),
      bodyHtml: sanitizeAnnounceHtml(rules.bodyHtml),
    }

    const uploadField = async (key, kind) => {
      const value = rules[key]
      if (!value || typeof value !== 'string' || !value.startsWith('data:image/')) return
      const url = await uploadAnnounceAsset(this.spaceId, rid, value, kind)
      if (!url) throw new Error(`Falha ao enviar ${kind}`)
      rules = { ...rules, [key]: url }
    }
    await uploadField('banner', 'rules-banner')
    await uploadField('iconImage', 'rules-icon')
    await uploadField('authorPhoto', 'rules-author')

    if (rules.enabled) {
      const contentChanged = rulesContentFingerprint(rules) !== rulesContentFingerprint(prevRules)
        || !prevRules.enabled
      rules = {
        ...rules,
        version: contentChanged
          ? Math.max(1, (prevRules.version || 0) + 1)
          : Math.max(1, prevRules.version || 1),
      }
    } else {
      rules = { ...rules, version: Math.max(1, prevRules.version || 1) }
    }

    await updateDoc(roomRef(this.spaceId, rid), { rules })

    // Ensure only one rules channel is enabled in the Space.
    if (rules.enabled) {
      try {
        const roomsSnap = await getDocs(roomsCol(this.spaceId))
        await Promise.all(roomsSnap.docs.map(async (d) => {
          if (d.id === rid) return
          const other = normalizeRules(d.data()?.rules)
          if (!other.enabled) return
          await updateDoc(roomRef(this.spaceId, d.id), {
            rules: { ...other, enabled: false },
          })
        }))
      } catch (err) {
        console.warn('[updateRoomRules] exclusive', err)
      }
    }

    const snap = await getDoc(roomRef(this.spaceId, rid))
    if (!snap.exists()) return null
    const room = toRoomView(rid, snap.data())
    this._emit('roomChanged', { kind: 'updated', spaceId: this.spaceId, room })
    return { room }
  }

  /** Member confirms they read the current rules version. */
  async acceptSpaceRules(spaceId, version) {
    const sid = spaceId || this.spaceId
    if (!sid || !this.userId) throw new Error('Space inválido')
    const rulesRoom = findRulesRoom(this._spaceCache)
      || (this._spaceCache?.rooms || []).find((r) => normalizeRules(r?.rules).enabled)
    const ver = Math.max(
      1,
      Math.floor(Number(version)
        || normalizeRules(rulesRoom?.rules).version
        || 1),
    )
    const payload = {
      rulesAcceptedAt: Date.now(),
      rulesAcceptedVersion: ver,
    }
    await setDoc(memberRef(sid, this.userId), payload, { merge: true })

    if (this._spaceCache?.members) {
      this._spaceCache = this.cacheSpace({
        ...this._spaceCache,
        members: this._spaceCache.members.map((m) => (
          m.userId === this.userId ? { ...m, ...payload } : m
        )),
      })
      this._emit('spaceChanged', { space: this._spaceCache, updated: true })
    }
    return payload
  }

  /**
   * Persist a join/leave card in lobby channel(s).
   * Join cards are Discord-style (banner + avatar + template).
   * @param {string} [roomId]
   * @param {'join'|'leave'} type
   * @param {object} [memberOverride]
   */
  async sendLobbyEvent(roomId, type = 'join', memberOverride = null, opts = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !this.userId) return null
    const force = !!opts.force

    const roomSnap = await getDoc(roomRef(this.spaceId, rid))
    if (!roomSnap.exists()) return null
    const lobby = normalizeLobby(roomSnap.data()?.lobby)
    if (!lobby.enabled) return null
    const eventType = type === 'leave' ? 'leave' : 'join'
    if (eventType === 'join' && !lobby.showJoins) return null
    if (eventType === 'leave' && !lobby.showLeaves) return null

    const member = memberOverride && typeof memberOverride === 'object' ? memberOverride : null
    const userId = member?.userId || this.userId
    const displayName = member?.displayName
      || this.displayName
      || this._profile?.displayName
      || 'Alguém'
    const photoURL = member?.photoURL || this._profile?.photoURL || ''
    const spaceName = this._spaceCache?.name || 'Space'
    const memberCount = Array.isArray(this._spaceCache?.members)
      ? this._spaceCache.members.length
      : (this._spaceCache?.memberCount || null)

    const ctx = { user: displayName, space: spaceName, count: memberCount ?? '' }
    // Keep {{tokens}} in stored templates so the card can render chips at display time.
    const title = lobby.title
    const body = lobby.body
    const bodyHtml = sanitizeAnnounceHtml(lobby.bodyHtml || '')
    const bannerCaption = lobby.bannerCaption
    const previewText = applyLobbyTemplate(
      lobby.body || lobby.title || `${displayName} entrou em ${spaceName}`,
      ctx,
    )

    const ts = Date.now()
    const id = force || eventType === 'leave'
      ? `lobby_${eventType}_${userId}_${ts}_${uid().slice(0, 6)}`
      : `lobby_join_${userId}_${lobbyDayKey(ts)}`

    const clean = {
      id,
      kind: 'lobby_event',
      text: eventType === 'join'
        ? (previewText.slice(0, 140) || `${displayName} entrou em ${spaceName}`)
        : `${displayName} saiu de ${spaceName}`,
      author: displayName,
      authorId: userId,
      authorPhoto: photoURL,
      ts,
      lobbyAccent: lobby.accent,
      lobbyEvent: {
        type: eventType,
        userId,
        displayName,
        photoURL,
        spaceName,
        memberCount,
        title,
        body,
        bodyHtml,
        bannerCaption,
        banner: lobby.banner || null,
        bannerFit: lobby.bannerFit || null,
        accent: lobby.accent,
        badge: lobby.badge,
        badgeColor: lobby.badgeColor,
        icon: lobby.icon,
        iconValue: lobby.iconValue,
        iconImage: lobby.iconImage,
        authorName: lobby.authorName,
        authorPhoto: lobby.authorPhoto,
        authorIcon: lobby.authorIcon,
        authorIconValue: lobby.authorIconValue,
        config: { ...lobby },
      },
    }

    try {
      if (!force && eventType === 'join') {
        const existing = await getDoc(doc(messagesCol(this.spaceId, rid), id))
        if (existing.exists()) return null
      }
      await setDoc(doc(messagesCol(this.spaceId, rid), id), JSON.parse(JSON.stringify(clean)))
    } catch (err) {
      if (eventType === 'join' && !force) return null
      throw err
    }
    try {
      await updateDoc(roomRef(this.spaceId, rid), {
        lastMessageAt: ts,
        lastMessageId: id,
        lastMessagePreview: clean.text.slice(0, 140),
        lastAuthorId: userId,
        lastAuthorName: displayName,
      })
    } catch {}
    return clean
  }

  /** Post join/leave cards into every lobby-enabled room of the current space. */
  async _postLobbyEventsForSpace(type = 'join', memberOverride = null) {
    const spaceId = this.spaceId
    if (!spaceId) return
    const rooms = Array.isArray(this._spaceCache?.rooms) ? this._spaceCache.rooms : []
    const targets = rooms.filter((r) => normalizeLobby(r?.lobby).enabled)
    if (targets.length === 0) {
      try {
        const snap = await getDocs(roomsCol(spaceId))
        for (const d of snap.docs) {
          const lobby = normalizeLobby(d.data()?.lobby)
          if (lobby.enabled) targets.push(toRoomView(d.id, d.data()))
        }
      } catch {}
    }
    await Promise.allSettled(
      targets.map((r) => this.sendLobbyEvent(r.id, type, memberOverride)),
    )
  }

  /**
   * Upload data-URL media on an announce draft and sanitize HTML body.
   * Keeps https URLs as-is so schedule → publish does not re-upload.
   */
  async _prepareAnnouncePayload(rid, payload) {
    const raw = typeof payload === 'string' ? { body: payload } : (payload || {})
    let announce = normalizeAnnounce(raw)
    announce = {
      ...announce,
      bodyHtml: sanitizeAnnounceHtml(announce.bodyHtml),
      body: announce.body || htmlToPlainText(announce.bodyHtml),
    }
    const hasBody = !!(announce.body || htmlToPlainText(announce.bodyHtml))
    if (!announce.title && !hasBody) throw new Error('Título ou corpo obrigatório')

    const uploadField = async (field, kind, { required = false } = {}) => {
      const value = announce[field]
      if (!value) return
      if (typeof value === 'string' && /^https?:\/\//i.test(value)) return
      if (!String(value).startsWith('data:image/')) {
        if (required) throw new Error('Cover do anúncio inválida')
        announce = { ...announce, [field]: field === 'authorPhoto' ? '' : null }
        return
      }
      try {
        const url = await uploadAnnounceAsset(this.spaceId, rid, value, kind)
        if (!url) {
          if (required) throw new Error('Falha ao enviar a cover do anúncio')
          announce = { ...announce, [field]: field === 'authorPhoto' ? '' : null }
          return
        }
        announce = { ...announce, [field]: url }
      } catch (err) {
        console.warn(`[announce] ${kind}`, err)
        if (required) {
          throw new Error(err?.message || 'Falha ao enviar a cover do anúncio')
        }
        announce = { ...announce, [field]: field === 'authorPhoto' ? '' : null }
      }
    }

    await uploadField('cover', 'cover', { required: true })
    await uploadField('iconImage', 'icon')
    await uploadField('authorPhoto', 'author')
    return announce
  }

  /**
   * Publish a rich announcement card to the room chat.
   * @param {string|null} roomId
   * @param {object|string} payload — string (legacy body) or announce draft
   */
  async sendChatAnnouncement(roomId, payload = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) throw new Error('Sala inválida')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')

    const announce = await this._prepareAnnouncePayload(rid, payload)

    const id = uid()
    const ts = Date.now()
    const clean = {
      id,
      kind: 'announce',
      text: announcePreviewText(announce),
      author: announce.authorName || 'sistema',
      authorId: this.userId,
      authorPhoto: announce.authorPhoto || '',
      ts,
      announce: {
        ...announce,
        scheduledFor: null,
      },
    }
    await setDoc(doc(messagesCol(this.spaceId, rid), id), JSON.parse(JSON.stringify(clean)))
    try {
      await updateDoc(roomRef(this.spaceId, rid), {
        lastMessageAt: ts,
        lastMessageId: id,
        lastMessagePreview: announcePreviewText(announce).slice(0, 140),
        lastAuthorId: this.userId,
        lastAuthorName: announce.authorName || 'Anúncio',
      })
    } catch {}
    return clean
  }

  /** Update an existing published announcement message. */
  async updateChatAnnouncement(roomId, messageId, payload = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !messageId) throw new Error('Sala inválida')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')

    const announce = await this._prepareAnnouncePayload(rid, {
      ...(typeof payload === 'object' ? payload : {}),
      scheduledFor: null,
    })

    const col = messagesCol(this.spaceId, rid)
    let targetRef = doc(col, messageId)
    let snap = await getDoc(targetRef)
    if (!snap.exists()) {
      const found = await getDocs(query(col, where('id', '==', messageId), limit(1)))
      if (found.empty) throw new Error('Anúncio não encontrado')
      targetRef = found.docs[0].ref
      snap = found.docs[0]
    }
    const prior = snap.data() || {}
    if (prior.kind !== 'announce' && !prior.announce) {
      throw new Error('Mensagem não é um anúncio')
    }

    const editedAt = Date.now()
    const patch = {
      kind: 'announce',
      text: announcePreviewText(announce),
      author: announce.authorName || prior.author || 'sistema',
      authorPhoto: announce.authorPhoto || '',
      edited: true,
      editedAt,
      announce: {
        ...announce,
        scheduledFor: null,
      },
    }
    await updateDoc(targetRef, JSON.parse(JSON.stringify(patch)))
    return {
      id: prior.id || messageId,
      ...prior,
      ...patch,
      ts: prior.ts || editedAt,
    }
  }

  /** Queue a rich announcement for later publish. */
  async scheduleChatAnnouncement(roomId, payload = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) throw new Error('Sala inválida')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')

    const announce = await this._prepareAnnouncePayload(rid, payload)
    if (!announce.scheduledFor || announce.scheduledFor <= Date.now()) {
      throw new Error('Horário de agendamento inválido')
    }

    const id = uid()
    const docData = {
      id,
      spaceId: this.spaceId,
      roomId: rid,
      createdAt: Date.now(),
      createdBy: this.userId,
      publishAt: announce.scheduledFor,
      status: 'scheduled',
      announce: { ...announce },
    }
    await setDoc(
      doc(scheduledAnnouncementsCol(this.spaceId, rid), id),
      JSON.parse(JSON.stringify(docData)),
    )
    return docData
  }

  /** List pending scheduled announcements for a room (mods only). */
  async listScheduledAnnouncements(roomId = null) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) return []
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')
    const col = scheduledAnnouncementsCol(this.spaceId, rid)
    const q = query(col, where('status', '==', 'scheduled'), limit(40))
    const snap = await getDocs(q)
    return snap.docs
      .map((d) => {
        const data = d.data() || {}
        return {
          ...data,
          id: data.id || d.id,
          firestoreId: d.id,
          publishAt: Number(data.publishAt || data.announce?.scheduledFor || 0) || 0,
          announce: data.announce || {},
        }
      })
      .sort((a, b) => (a.publishAt || 0) - (b.publishAt || 0))
  }

  /** Update a pending scheduled announcement (content and/or time). */
  async updateScheduledAnnouncement(roomId, scheduleId, payload = {}) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !scheduleId) throw new Error('Agendamento inválido')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')

    const ref = scheduledAnnouncementRef(this.spaceId, rid, scheduleId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Agendamento não encontrado')
    if (snap.data()?.status !== 'scheduled') throw new Error('Este anúncio já não está agendado')

    const announce = await this._prepareAnnouncePayload(rid, payload)
    const publishAt = Number(announce.scheduledFor || payload.publishAt || 0)
    if (!publishAt || publishAt <= Date.now() + 15_000) {
      throw new Error('Horário de agendamento inválido')
    }
    const next = {
      ...announce,
      scheduledFor: publishAt,
    }
    await updateDoc(ref, {
      announce: JSON.parse(JSON.stringify(next)),
      publishAt,
      updatedAt: Date.now(),
      updatedBy: this.userId,
    })
    return {
      id: scheduleId,
      firestoreId: scheduleId,
      publishAt,
      status: 'scheduled',
      announce: next,
    }
  }

  /** Cancel / delete a pending scheduled announcement. */
  async cancelScheduledAnnouncement(roomId, scheduleId) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !scheduleId) throw new Error('Agendamento inválido')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')
    await deleteDoc(scheduledAnnouncementRef(this.spaceId, rid, scheduleId))
    return { ok: true }
  }

  /** Publish a scheduled announcement immediately. */
  async publishScheduledAnnouncementNow(roomId, scheduleId) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid || !scheduleId) throw new Error('Agendamento inválido')
    this._assertCan('mod_chat', 'precisa da permissão Moderar chat')
    const ref = scheduledAnnouncementRef(this.spaceId, rid, scheduleId)
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error('Agendamento não encontrado')
    const data = snap.data() || {}
    if (data.status !== 'scheduled') throw new Error('Este anúncio já não está agendado')
    await this.sendChatAnnouncement(rid, data.announce || {})
    await updateDoc(ref, { status: 'published', publishedAt: Date.now() })
    return { ok: true }
  }

  /**
   * Publish due scheduled announcements for a room (client-side runner).
   * Returns number published.
   */
  async publishDueAnnouncements(roomId = null) {
    const rid = roomId || this.roomId
    if (!this.spaceId || !rid) return 0
    if (!this.can('mod_chat')) return 0

    const col = scheduledAnnouncementsCol(this.spaceId, rid)
    const q = query(col, where('status', '==', 'scheduled'), limit(40))
    let snap
    try {
      snap = await getDocs(q)
    } catch (err) {
      console.warn('[publishDueAnnouncements]', err)
      return 0
    }
    const now = Date.now()
    let n = 0
    for (const d of snap.docs) {
      const data = d.data() || {}
      if (Number(data.publishAt || 0) > now) continue
      try {
        await this.sendChatAnnouncement(rid, data.announce || {})
        await updateDoc(d.ref, { status: 'published', publishedAt: Date.now() })
        n += 1
      } catch (err) {
        console.warn('[publishDueAnnouncements] one failed', d.id, err)
      }
    }
    return n
  }

  /** Lightweight rooms listener for unread badges (all rooms in a Space). */
  listenSpaceRooms(spaceId, cb) {
    if (!spaceId || typeof cb !== 'function') return () => {}
    return onSnapshot(roomsCol(spaceId), (snap) => {
      cb(snap.docs.map((d) => toRoomView(d.id, d.data())))
    }, (err) => console.warn('[listenSpaceRooms]', err))
  }

  listenChat(spaceId, roomId, cb) {
    if (!spaceId || !roomId || typeof cb !== 'function') return () => {}
    return onSnapshot(messagesCol(spaceId, roomId), (snap) => {
      const list = snap.docs
        .map((d) => {
          const data = d.data() || {}
          return {
            ...data,
            // Prefer client id field; fall back to Firestore doc id.
            id: data.id || d.id,
            firestoreId: d.id,
          }
        })
        .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      cb(list)
    })
  }

  _memberProfileFields() {
    return {
      displayName: this.displayName,
      photoURL: this._profile.photoURL || '',
      handle: this._profile.handle || '',
      bio: this._profile.bio || '',
      statusText: this._profile.statusText || '',
      cover: this._profile.cover || '',
      coverFit: this._profile.coverFit || null,
      bannerHue: this._profile.bannerHue ?? 340,
      cardThemeId: this._profile.cardThemeId || 'default',
    }
  }

  async setDisplayName(name) {
    return this.setProfile({ displayName: name })
  }

  async setProfile(patch = {}) {
    if (!this.userId) return
    if (patch.displayName) {
      this.displayName = String(patch.displayName || '').slice(0, 64) || this.displayName
      try { this._storeDisplayName(this.displayName) } catch {}
    }
    this._profile = {
      ...this._profile,
      ...patch,
      displayName: this.displayName,
    }
    if (auth.currentUser && (patch.displayName || patch.photoURL !== undefined)) {
      try {
        await updateProfile(auth.currentUser, {
          displayName: this.displayName,
          ...(patch.photoURL !== undefined ? { photoURL: patch.photoURL || null } : {}),
        })
      } catch { /* optional */ }
    }
    await setDoc(doc(db, VC.users, this.userId), this._memberProfileFields(), { merge: true })
    if (this.spaceId) {
      await setDoc(memberRef(this.spaceId, this.userId), this._memberProfileFields(), { merge: true })
    }
  }

  disconnect() {
    this._closed = true
    this.connected = false
    if (this._heartbeat) {
      clearInterval(this._heartbeat)
      this._heartbeat = null
    }
    this._clear(this._roomUnsubs)
    this._clear(this._spaceUnsubs)
    this._clear(this._unsubs)
    this.clearSpaceCache()
    this.ws = null
    this._connectPromise = null
    this._emit('status', { type: 'disconnected' })
  }
}
