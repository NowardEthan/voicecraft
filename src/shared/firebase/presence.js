/**
 * Firebase Realtime Database presence helpers.
 * Ephemeral online/offline — durable profile stays in Firestore.
 *
 * Electron note: Chromium throttles background renderers, which can stall
 * the RTDB websocket. We keep a heartbeat + re-assert on focus/visibility
 * so peers see fresh online state.
 */
import {
  getDatabase,
  ref,
  onValue,
  onDisconnect,
  set,
  serverTimestamp,
} from 'firebase/database'
import { firebaseApp } from './app'

const HEARTBEAT_MS = 20_000
/** If lastChanged is older than this, treat as offline (missed onDisconnect). */
const STALE_MS = 60_000

let _db = null

export function getRtdb() {
  if (!_db) _db = getDatabase(firebaseApp)
  return _db
}

export function presenceUserPath(uid) {
  return `vc_presence/${uid}`
}

export function presenceSpacePath(spaceId, uid) {
  return `vc_space_presence/${spaceId}/${uid}`
}

export function presencePayload(state, extra = {}) {
  return {
    state,
    lastChanged: serverTimestamp(),
    ...extra,
  }
}

function tsMs(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'object' && typeof value.toMillis === 'function') return value.toMillis()
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isFreshPresence(lastChanged) {
  const ms = tsMs(lastChanged)
  // Pending serverTimestamp reads as null briefly — keep as online.
  if (ms == null) return true
  return Date.now() - ms < STALE_MS
}

/** Exported for clients that cache presence and re-evaluate locally. */
export function isPresenceLastFresh(lastChanged) {
  return isFreshPresence(lastChanged)
}

function onForeground(cb) {
  if (typeof document === 'undefined') return () => {}
  const run = () => {
    if (document.visibilityState === 'visible') cb()
  }
  document.addEventListener('visibilitychange', run)
  window.addEventListener('focus', run)
  return () => {
    document.removeEventListener('visibilitychange', run)
    window.removeEventListener('focus', run)
  }
}

/**
 * Wire global presence for the signed-in user.
 * Returns an unsubscribe that tears down listeners (does not force offline —
 * onDisconnect handles crash/kill).
 */
export function attachUserPresence(uid) {
  if (!uid) return () => {}
  const db = getRtdb()
  const connectedRef = ref(db, '.info/connected')
  const userRef = ref(db, presenceUserPath(uid))
  let heartbeat = null

  const writeOnline = () => set(userRef, presencePayload('online'))

  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
  }

  const startHeartbeat = () => {
    stopHeartbeat()
    heartbeat = setInterval(() => {
      writeOnline().catch(() => {})
    }, HEARTBEAT_MS)
  }

  const onConnected = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return
    onDisconnect(userRef)
      .set(presencePayload('offline'))
      .then(() => writeOnline())
      .then(() => startHeartbeat())
      .catch((err) => console.warn('[presence] user', err))
  })

  const offFg = onForeground(() => {
    writeOnline().catch(() => {})
  })

  return () => {
    stopHeartbeat()
    offFg()
    try { onConnected() } catch { /* ignore */ }
  }
}

/**
 * Track presence inside a Space (and optional room).
 * Returns `{ setRoomId, dispose }` so room changes do not tear down the
 * RTDB listener / onDisconnect registration (important for Electron).
 */
export function attachSpacePresence(uid, spaceId, roomId = null) {
  if (!uid || !spaceId) {
    return { setRoomId: () => {}, dispose: () => {} }
  }
  const db = getRtdb()
  const connectedRef = ref(db, '.info/connected')
  const spacePRef = ref(db, presenceSpacePath(spaceId, uid))
  const userRef = ref(db, presenceUserPath(uid))
  let currentRoomId = roomId || null
  let heartbeat = null
  let connected = false

  const writeOnline = () => {
    const payload = presencePayload('online', { roomId: currentRoomId || null })
    return Promise.all([
      set(spacePRef, payload),
      set(userRef, presencePayload('online')),
    ])
  }

  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
  }

  const startHeartbeat = () => {
    stopHeartbeat()
    heartbeat = setInterval(() => {
      writeOnline().catch(() => {})
    }, HEARTBEAT_MS)
  }

  const onConnected = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) {
      connected = false
      return
    }
    connected = true
    onDisconnect(spacePRef)
      .set(presencePayload('offline', { roomId: null }))
      .then(() => writeOnline())
      .then(() => startHeartbeat())
      .catch((err) => console.warn('[presence] space', err))
  })

  const offFg = onForeground(() => {
    if (connected) writeOnline().catch(() => {})
  })

  return {
    setRoomId(nextRoomId) {
      currentRoomId = nextRoomId || null
      if (connected) writeOnline().catch(() => {})
    },
    dispose(writeOffline = true) {
      stopHeartbeat()
      offFg()
      try { onConnected() } catch { /* ignore */ }
      if (writeOffline) {
        set(spacePRef, presencePayload('offline', { roomId: null })).catch(() => {})
      }
    },
  }
}

/** Subscribe to all presence docs under a Space. */
export function listenSpacePresence(spaceId, onChange) {
  if (!spaceId) return () => {}
  const db = getRtdb()
  const spaceRoot = ref(db, `vc_space_presence/${spaceId}`)
  return onValue(spaceRoot, (snap) => {
    const val = snap.val() || {}
    const map = {}
    Object.keys(val).forEach((uid) => {
      const row = val[uid] || {}
      map[uid] = {
        online: row.state === 'online' && isFreshPresence(row.lastChanged),
        roomId: row.roomId || null,
        lastChanged: row.lastChanged || null,
      }
    })
    onChange(map)
  }, (err) => console.warn('[presence] listen', err))
}

/** Subscribe to global presence for a set of user ids. */
export function listenUsersPresence(userIds, onChange) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)))
  if (ids.length === 0) {
    onChange({})
    return () => {}
  }
  const db = getRtdb()
  const map = {}
  const unsubs = ids.map((uid) => {
    const r = ref(db, presenceUserPath(uid))
    return onValue(r, (snap) => {
      const row = snap.val() || {}
      map[uid] = {
        online: row.state === 'online' && isFreshPresence(row.lastChanged),
        lastChanged: row.lastChanged || null,
      }
      onChange({ ...map })
    }, () => {
      map[uid] = { online: false, lastChanged: null }
      onChange({ ...map })
    })
  })
  return () => unsubs.forEach((u) => {
    try { u() } catch { /* ignore */ }
  })
}
