/**
 * l1Snapshot — Voice (L1) cache for last-known UI state.
 *
 * Goal: render the AppShell immediately on warm start with the user's last
 * Spaces/room/drafts without waiting for Firebase signaling.
 *
 * Storage:
 *   key:   voicecraft:l1:<uid>
 *   value: JSON { schemaVersion, uid, updatedAt, spaces, lastSpaceId,
 *                 lastSpaceSnapshot, lastRoomId, lastRoomSnapshot, drafts, messages }
 *
 * Capacity:
 *   - Max ~150KB serialized. Eviction order: messages → inline Space images
 *     → half of the Space list (repeat). drafts and last* are preserved.
 *   - Max 20 messages per channel, max 40 Spaces, lightweight shapes.
 *
 * Write strategy:
 *   - writeL1Snapshot(uid, patch) MERGES the patch into what is stored.
 *     The Composer writes `drafts` synchronously straight into the same key,
 *     so the stored drafts always win unless the patch sets `drafts` itself.
 *   - Debounced 3000ms via setTimeout.
 *   - Flush on `beforeunload` (browser/Electron renderer).
 *   - Manual flush() for transitions (Space/room switch, logout).
 *
 * Partitioning:
 *   - Strict per-uid. clearL1Snapshot(uid) removes the key entirely.
 *   - readL1Snapshot returns null when uid is missing/empty or schema is stale.
 */
import { useCallback, useEffect, useRef } from 'react'

export const SCHEMA_VERSION = 1
const STORAGE_PREFIX = 'voicecraft:l1:'
const DEBOUNCE_MS = 3000
const MAX_BYTES = 150 * 1024 // 150 KB
const MAX_MESSAGES_PER_CHANNEL = 20

const MAX_SPACES = 40
const MAX_SPACE_EVENTS = 8
// Inline data: images above this size are dropped from the cached Space list
// (server covers are normally https URLs; huge data URLs would blow the quota).
const MAX_INLINE_IMAGE = 16 * 1024

const MESSAGE_PROJECTION_KEYS = [
  'id', 'authorId', 'authorName', 'authorAvatar', 'text', 'createdAt', 'status',
]

const SPACE_PROJECTION_KEYS = [
  'id', 'name', 'description', 'slogan', 'icon', 'color', 'cover', 'coverFit',
  'memberCount', 'roomCount', 'joined',
]

function isInline(value) {
  return typeof value === 'string' && value.startsWith('data:')
}

function isOversizedInline(value) {
  return isInline(value) && value.length > MAX_INLINE_IMAGE
}

function projectSpace(space) {
  if (!space || typeof space !== 'object' || !space.id) return null
  const out = {}
  for (const k of SPACE_PROJECTION_KEYS) {
    if (space[k] !== undefined) out[k] = space[k]
  }
  if (isOversizedInline(out.cover)) out.cover = null
  if (isOversizedInline(out.icon)) delete out.icon
  out.events = Array.isArray(space.events) ? space.events.slice(0, MAX_SPACE_EVENTS) : []
  return out
}

function stripInlineImages(space) {
  const out = { ...space }
  if (isInline(out.cover)) out.cover = null
  if (isInline(out.icon)) delete out.icon
  return out
}

function storageKey(uid) {
  if (!uid || typeof uid !== 'string') return null
  return `${STORAGE_PREFIX}${uid}`
}

function projectMessage(msg) {
  if (!msg || typeof msg !== 'object') return null
  const out = {}
  for (const k of MESSAGE_PROJECTION_KEYS) {
    if (msg[k] !== undefined) out[k] = msg[k]
  }
  // Map alternative timestamp/author keys for compatibility.
  if (out.createdAt === undefined && msg.ts !== undefined) out.createdAt = msg.ts
  if (out.authorId === undefined && msg.author?.id !== undefined) out.authorId = msg.author.id
  if (out.authorName === undefined && msg.author?.name !== undefined) out.authorName = msg.author.name
  if (out.authorAvatar === undefined && msg.author?.avatar !== undefined) out.authorAvatar = msg.author.avatar
  if (out.text === undefined && msg.body !== undefined) out.text = msg.body
  return out
}

function projectSnapshot(input) {
  if (!input || typeof input !== 'object') return null
  const snap = {
    schemaVersion: SCHEMA_VERSION,
    uid: input.uid,
    updatedAt: typeof input.updatedAt === 'number' ? input.updatedAt : Date.now(),
    spaces: Array.isArray(input.spaces)
      ? input.spaces.slice(0, MAX_SPACES).map(projectSpace).filter(Boolean)
      : [],
    lastSpaceId: input.lastSpaceId ?? null,
    lastSpaceSnapshot: input.lastSpaceSnapshot ?? null,
    lastRoomId: input.lastRoomId ?? null,
    lastRoomSnapshot: input.lastRoomSnapshot ?? null,
    drafts: input.drafts && typeof input.drafts === 'object' ? { ...input.drafts } : {},
    messages: {},
  }
  if (input.messages && typeof input.messages === 'object') {
    for (const [channelKey, list] of Object.entries(input.messages)) {
      if (!Array.isArray(list)) continue
      const projected = list
        .slice(-MAX_MESSAGES_PER_CHANNEL)
        .map(projectMessage)
        .filter(Boolean)
      snap.messages[channelKey] = projected
    }
  }
  return snap
}

function serializeSafe(snap) {
  try {
    return JSON.stringify(snap)
  } catch {
    return null
  }
}

/** Serialize under MAX_BYTES, evicting progressively. Returns null if impossible. */
function serializeWithinQuota(snap) {
  let s = snap
  let out = serializeSafe(s)
  if (!out) return null
  if (out.length <= MAX_BYTES) return out

  s = { ...s, messages: {} }
  out = serializeSafe(s) || ''
  if (out.length <= MAX_BYTES) return out

  s = { ...s, spaces: s.spaces.map(stripInlineImages) }
  out = serializeSafe(s) || ''
  while (out.length > MAX_BYTES && s.spaces.length > 0) {
    s = { ...s, spaces: s.spaces.slice(0, Math.floor(s.spaces.length / 2)) }
    out = serializeSafe(s) || ''
  }
  return out.length <= MAX_BYTES ? out : null
}

/** Raw stored object for this uid (no schema cleanup side effects). */
function readStored(key, uid) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    if (parsed.uid && parsed.uid !== uid) return {}
    return parsed
  } catch {
    return {}
  }
}

const pendingTimers = new Map() // uid -> timeout id
const pendingPayloads = new Map() // uid -> merged patch

function scheduleFlush(uid) {
  if (typeof window === 'undefined') return
  if (pendingTimers.has(uid)) clearTimeout(pendingTimers.get(uid))
  const t = setTimeout(() => {
    pendingTimers.delete(uid)
    const payload = pendingPayloads.get(uid)
    pendingPayloads.delete(uid)
    if (payload) writeNow(uid, payload)
  }, DEBOUNCE_MS)
  pendingTimers.set(uid, t)
}

function writeNow(uid, patch) {
  const key = storageKey(uid)
  if (!key) return
  const existing = readStored(key, uid)
  const merged = { ...existing, ...patch, uid, updatedAt: Date.now() }
  // Drafts are owned by the Composer (written synchronously, same key).
  if (patch.drafts === undefined) merged.drafts = existing.drafts
  const snap = projectSnapshot(merged)
  if (!snap) return
  const serialized = serializeWithinQuota(snap)
  if (!serialized) return
  try {
    localStorage.setItem(key, serialized)
  } catch {
    /* quota exceeded — drop silently */
  }
}

let beforeUnloadRegistered = false
function registerBeforeUnload() {
  if (beforeUnloadRegistered || typeof window === 'undefined') return
  beforeUnloadRegistered = true
  window.addEventListener('beforeunload', () => {
    for (const [uid, payload] of pendingPayloads.entries()) {
      const t = pendingTimers.get(uid)
      if (t) clearTimeout(t)
      pendingTimers.delete(uid)
      writeNow(uid, payload)
    }
    pendingPayloads.clear()
  })
}

/* ---------- Public API ---------- */

export function readL1Snapshot(uid) {
  if (typeof window === 'undefined') return null
  const key = storageKey(uid)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      try { localStorage.removeItem(key) } catch {}
      return null
    }
    if (parsed.uid && uid && parsed.uid !== uid) {
      // Defense-in-depth: never serve a snapshot belonging to a different uid.
      return null
    }
    return parsed
  } catch {
    try { localStorage.removeItem(key) } catch {}
    return null
  }
}

/** Last known Space list for this uid (synchronous, [] when absent). */
export function readL1Spaces(uid) {
  const snap = readL1Snapshot(uid)
  return Array.isArray(snap?.spaces) ? snap.spaces : []
}

/** Merge `patch` into the stored snapshot (debounced). */
export function writeL1Snapshot(uid, patch) {
  if (!uid || !patch || typeof patch !== 'object') return
  pendingPayloads.set(uid, { ...(pendingPayloads.get(uid) || {}), ...patch })
  registerBeforeUnload()
  scheduleFlush(uid)
}

export function flushL1Snapshot(uid) {
  if (!uid) return
  if (pendingTimers.has(uid)) {
    clearTimeout(pendingTimers.get(uid))
    pendingTimers.delete(uid)
  }
  const payload = pendingPayloads.get(uid)
  if (payload) {
    pendingPayloads.delete(uid)
    writeNow(uid, payload)
  }
}

export function clearL1Snapshot(uid) {
  if (!uid) return
  if (pendingTimers.has(uid)) {
    clearTimeout(pendingTimers.get(uid))
    pendingTimers.delete(uid)
  }
  pendingPayloads.delete(uid)
  const key = storageKey(uid)
  if (key) {
    try { localStorage.removeItem(key) } catch {}
  }
}

export function useL1Snapshot(uid) {
  const snapshot = readL1Snapshot(uid)
  const uidRef = useRef(uid)
  uidRef.current = uid

  useEffect(() => {
    registerBeforeUnload()
  }, [])

  const write = useCallback((payload) => {
    writeL1Snapshot(uidRef.current, payload)
  }, [])

  const flush = useCallback(() => {
    flushL1Snapshot(uidRef.current)
  }, [])

  const clear = useCallback(() => {
    clearL1Snapshot(uidRef.current)
  }, [])

  return { snapshot, write, flush, clear }
}
