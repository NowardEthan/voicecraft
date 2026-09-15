/**
 * chatPrefetch — idempotent prefetch for the last 20 messages of a room.
 *
 * Reads the cached history that useChat already persists under
 * `voicecraft:chat:<roomKey>` (MAX_PERSISTED = 500). If the room is already
 * warm in memory or storage, this is a no-op so it can be safely called on
 * onPointerDown for every channel row without spamming fetches.
 */
const CHAT_STORAGE_PREFIX = 'voicecraft:chat:'
const MAX_PREFETCH = 20

const inFlight = new Set()
const warmed = new Set() // roomKey already loaded

function roomKey(spaceId, roomId) {
  if (!spaceId || !roomId) return null
  return `${spaceId}:${roomId}`
}

function storageKey(roomKey) {
  return `${CHAT_STORAGE_PREFIX}${roomKey}`
}

export function isRoomWarmed(spaceId, roomId) {
  const key = roomKey(spaceId, roomId)
  if (!key) return false
  return warmed.has(key)
}

/**
 * Returns up to `MAX_PREFETCH` recent messages from local cache, or null.
 * Idempotent: marks the room as warmed once called.
 */
export function prefetchRoomMessages(spaceId, roomId) {
  if (typeof window === 'undefined') return null
  const key = roomKey(spaceId, roomId)
  if (!key) return null
  if (inFlight.has(key) || warmed.has(key)) return null
  inFlight.add(key)
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) {
      warmed.add(key)
      return null
    }
    let parsed
    try { parsed = JSON.parse(raw) } catch { warmed.add(key); return null }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      warmed.add(key)
      return null
    }
    const slice = parsed.slice(-MAX_PREFETCH)
    warmed.add(key)
    return slice
  } finally {
    inFlight.delete(key)
  }
}

/**
 * Mark a room as warmed externally (e.g., when useChat actually loads it).
 * Prevents redundant prefetches on subsequent pointerdowns.
 */
export function markRoomWarmed(spaceId, roomId) {
  const key = roomKey(spaceId, roomId)
  if (key) warmed.add(key)
}

export function clearPrefetchCache() {
  warmed.clear()
  inFlight.clear()
}
