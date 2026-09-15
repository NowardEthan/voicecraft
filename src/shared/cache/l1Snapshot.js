/**
 * l1Snapshot — Voice (L1) cache for last-known UI state.
 *
 * Goal: render the AppShell immediately on warm start with the user's last
 * Space/room/drafts without waiting for Firebase signaling.
 *
 * Storage:
 *   key:   voicecraft:l1:<uid>
 *   value: JSON { schemaVersion, uid, updatedAt, lastSpaceId, lastSpaceSnapshot,
 *                   lastRoomId, lastRoomSnapshot, drafts, messages }
 *
 * Capacity:
 *   - Max ~150KB serialized. If exceeded, evict `messages` (preserve last*).
 *   - Max 20 messages per channel projected to lightweight shape.
 *
 * Write strategy:
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

const MESSAGE_PROJECTION_KEYS = [
  'id', 'authorId', 'authorName', 'authorAvatar', 'text', 'createdAt', 'status',
]

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

function evictForQuota(snap) {
  // Strip messages to fit under quota while preserving last* and drafts.
  const trimmed = { ...snap, messages: {} }
  return trimmed
}

const pendingTimers = new Map() // uid -> timeout id
const pendingPayloads = new Map() // uid -> snapshot

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

function writeNow(uid, payload) {
  const key = storageKey(uid)
  if (!key) return
  let snap = projectSnapshot({ ...payload, uid })
  if (!snap) return
  let serialized = serializeSafe(snap)
  if (!serialized) return
  if (serialized.length > MAX_BYTES) {
    snap = evictForQuota(snap)
    serialized = serializeSafe(snap) || ''
  }
  try {
    localStorage.setItem(key, serialized)
  } catch {
    /* quota exceeded — drop silently */
  }
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

export function writeL1Snapshot(uid, payload) {
  if (!uid) return
  pendingPayloads.set(uid, payload)
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

let beforeUnloadRegistered = false
function registerBeforeUnload() {
  if (beforeUnloadRegistered || typeof window === 'undefined') return
  beforeUnloadRegistered = true
  window.addEventListener('beforeunload', () => {
    for (const [uid, payload] of pendingPayloads.entries()) {
      pendingTimers.delete(uid)
      writeNow(uid, payload)
    }
    pendingPayloads.clear()
  })
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
