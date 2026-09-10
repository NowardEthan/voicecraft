/**
 * Process-wide LiveKit Room sessions.
 * Survives React Strict Mode remounts so we don't tear down WebRTC
 * (User-Initiated Abort / DUPLICATE_IDENTITY reconnect loops).
 */

const sessions = new Map()

export function sessionKey(spaceId, roomId, userId) {
  return `${spaceId || 'space'}::${roomId || 'room'}::${userId || 'user'}`
}

export function acquireSession(key) {
  let s = sessions.get(key)
  if (!s) {
    s = {
      key,
      room: null,
      audioTrack: null,
      connectPromise: null,
      joinedAt: Date.now(),
      refCount: 0,
      releaseTimer: null,
    }
    sessions.set(key, s)
  }
  if (s.releaseTimer) {
    clearTimeout(s.releaseTimer)
    s.releaseTimer = null
  }
  s.refCount += 1
  return s
}

export function releaseSession(key, { delayMs = 700, onDispose } = {}) {
  const s = sessions.get(key)
  if (!s) return
  s.refCount = Math.max(0, s.refCount - 1)
  if (s.refCount > 0) return

  if (s.releaseTimer) clearTimeout(s.releaseTimer)
  s.releaseTimer = setTimeout(() => {
    const cur = sessions.get(key)
    if (!cur || cur.refCount > 0) return
    try { onDispose?.(cur) } catch {}
    try { cur.audioTrack?.stop() } catch {}
    try { cur.room?.disconnect(true) } catch {}
    cur.audioTrack = null
    cur.room = null
    cur.connectPromise = null
    sessions.delete(key)
  }, delayMs)
}

export function disposeSessionNow(key) {
  const s = sessions.get(key)
  if (!s) return
  if (s.releaseTimer) clearTimeout(s.releaseTimer)
  s.refCount = 0
  try { s.audioTrack?.stop() } catch {}
  try { s.room?.disconnect(true) } catch {}
  s.audioTrack = null
  s.room = null
  s.connectPromise = null
  sessions.delete(key)
}

export function getSession(key) {
  return sessions.get(key) || null
}
