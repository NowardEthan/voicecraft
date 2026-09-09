/**
 * Firebase Realtime Database presence helpers.
 * Ephemeral online/offline — durable profile stays in Firestore.
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

  const onConnected = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return
    onDisconnect(userRef)
      .set(presencePayload('offline'))
      .then(() => set(userRef, presencePayload('online')))
      .catch((err) => console.warn('[presence] user', err))
  })

  return () => {
    try { onConnected() } catch { /* ignore */ }
  }
}

/**
 * Track presence inside a Space (and optional room).
 * Clears space presence on disconnect / leave.
 */
export function attachSpacePresence(uid, spaceId, roomId = null) {
  if (!uid || !spaceId) return () => {}
  const db = getRtdb()
  const connectedRef = ref(db, '.info/connected')
  const spaceRef = ref(db, presenceSpacePath(spaceId, uid))
  const userRef = ref(db, presenceUserPath(uid))

  const writeOnline = () => {
    const payload = presencePayload('online', { roomId: roomId || null })
    return Promise.all([
      set(spaceRef, payload),
      set(userRef, presencePayload('online')),
    ])
  }

  const onConnected = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return
    onDisconnect(spaceRef)
      .set(presencePayload('offline', { roomId: null }))
      .then(() => writeOnline())
      .catch((err) => console.warn('[presence] space', err))
  })

  return () => {
    try { onConnected() } catch { /* ignore */ }
    set(spaceRef, presencePayload('offline', { roomId: null })).catch(() => {})
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
        online: row.state === 'online',
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
        online: row.state === 'online',
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
