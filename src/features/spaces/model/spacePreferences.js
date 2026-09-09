/**
 * SpacePreferences — per-user, per-space toggles for visibility
 * (público/privado for the user) and notifications.
 *
 * These are NOT shared with other users — each person decides for
 * themselves how a Space should behave on their client. The server
 * doesn't know about them. Persisted in localStorage.
 */
const VISIBILITY_PREFIX = 'voicecraft:spaceVisibility:'
const NOTIFY_PREFIX     = 'voicecraft:spaceNotify:'

export function getVisibility(spaceId) {
  // Default: 'public' — show in the Spaces rail, accept join by link.
  return readPref(VISIBILITY_PREFIX, spaceId, 'public')
}

export function setVisibility(spaceId, value) {
  return writePref(VISIBILITY_PREFIX, spaceId, value)
}

export function getNotify(spaceId) {
  // Default: notifications on.
  return readPref(NOTIFY_PREFIX, spaceId, 'on')
}

export function setNotify(spaceId, value) {
  return writePref(NOTIFY_PREFIX, spaceId, value)
}

export function isSpaceVisible(spaceId) {
  return getVisibility(spaceId) !== 'private'
}

export function isSpaceNotifyOn(spaceId) {
  return getNotify(spaceId) !== 'off'
}

const LEFT_KEY = 'voicecraft:leftSpaces'

function readLeftSet() {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(LEFT_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function writeLeftSet(set) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LEFT_KEY, JSON.stringify([...set]))
  } catch {}
}

export function markSpaceLeft(spaceId) {
  if (!spaceId) return
  const set = readLeftSet()
  set.add(spaceId)
  writeLeftSet(set)
}

export function markSpaceJoined(spaceId) {
  if (!spaceId) return
  const set = readLeftSet()
  if (!set.has(spaceId)) return
  set.delete(spaceId)
  writeLeftSet(set)
}

export function hasLeftSpace(spaceId) {
  return !!spaceId && readLeftSet().has(spaceId)
}

/**
 * Rail entry. An explicit leave always wins until the user rejoins —
 * otherwise a leftover `joined: true` in memory keeps the Space visible
 * until the next hello-ack / refresh.
 */
export function isSpaceInRail(space, currentSpaceId) {
  if (!space?.id) return false
  if (hasLeftSpace(space.id)) return space.id === currentSpaceId
  if (space.joined === false) return false
  if (space.id === currentSpaceId) return true
  if (space.joined === true) return true
  return isSpaceVisible(space.id)
}

/** Apply the server's membership flags onto the local leave set. */
export function syncMembershipFromServer(spaces = []) {
  for (const space of spaces) {
    if (!space?.id) continue
    if (space.joined === true) markSpaceJoined(space.id)
    else if (space.joined === false) markSpaceLeft(space.id)
  }
}

function readPref(prefix, id, fallback) {
  if (!id || typeof window === 'undefined') return fallback
  try {
    const v = window.localStorage.getItem(prefix + id)
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

function writePref(prefix, id, value) {
  if (!id || typeof window === 'undefined') return false
  try {
    window.localStorage.setItem(prefix + id, value)
    return true
  } catch {
    return false
  }
}
