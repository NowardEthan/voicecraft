/**
 * chatOutbox — persistent outbox for in-flight messages.
 *
 * Stores pending / in-flight / permanent-failed chat mutations in
 * IndexedDB so they survive a renderer reload, app crash, or network
 * outage. Blobs (attachments) are stored natively via structured clone.
 *
 * Schema version: 1 (item.kind: 'message')
 *
 * Public API (per C3):
 *   - enqueueMessage(uid, roomKey, payload)
 *   - markInFlight(id)
 *   - markSent(id)
 *   - markFailedAttempt(id, error)
 *   - markPermanentFailed(id, error)
 *   - resetForRetry(id)
 *   - getAll(uid)
 *   - getDueNow(uid)
 *   - deleteItem(id)
 */
import { openDB, declareStore, upgradeStore, getAll as idbGetAll, get, put, deleteItem as deleteFromIDB } from '../cache/idb'

const OUTBOX_STORE = 'outbox'
const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 1000
const CAP_DELAY_MS = 16000
const JITTER_MS = 500

// Declare the outbox store at module load time so the IndexedDB upgrade
// creates it before any reads happen.
declareStore(OUTBOX_STORE, { keyPath: 'id' })

let readyPromise = null
async function ensureStore() {
  if (!readyPromise) {
    readyPromise = upgradeStore(OUTBOX_STORE, { keyPath: 'id' })
  }
  return readyPromise
}

function genId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {}
  // Fallback (extremely rare): RFC4122 v4-ish.
  const rnd = (n) => {
    let s = ''
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16)
    return s
  }
  return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rnd(3)}-${rnd(12)}`
}

function computeDelay(attempts) {
  const exp = BASE_DELAY_MS * Math.pow(2, attempts)
  const capped = Math.min(CAP_DELAY_MS, exp)
  const jitter = Math.floor(Math.random() * JITTER_MS)
  return capped + jitter
}

export async function enqueueMessage(uid, roomKey, messageId, payload) {
  if (!uid || !roomKey) throw new Error('enqueueMessage requires uid and roomKey')
  await ensureStore()
  const id = messageId || genId()
  const item = {
    id,
    uid,
    roomKey,
    kind: 'message',
    payload: payload || {},
    createdAt: Date.now(),
    attempts: 0,
    lastAttemptAt: null,
    nextAttemptAt: Date.now(),
    status: 'pending',
    lastError: null,
  }
  await put(OUTBOX_STORE, item)
  console.info('[outbox] Enqueued message:', id, roomKey)
  return id
}

export async function markInFlight(id) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  item.status = 'in-flight'
  item.lastAttemptAt = Date.now()
  await put(OUTBOX_STORE, item)
  console.info('[outbox] In-flight attempt #', item.attempts + 1, id)
  return item
}

export async function markSent(id) {
  await ensureStore()
  await deleteFromIDB(OUTBOX_STORE, id)
  console.info('[outbox] Message delivered successfully:', id)
}

export async function markFailedAttempt(id, error) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  item.attempts = (item.attempts || 0) + 1
  item.lastError = error?.message || String(error || 'unknown')
  item.lastAttemptAt = Date.now()
  if (item.attempts >= MAX_ATTEMPTS) {
    item.status = 'permanent-failed'
    item.nextAttemptAt = null
    console.error('[outbox] Permanent failure reached:', id, 'attempts=', item.attempts)
  } else {
    const delay = computeDelay(item.attempts)
    item.status = 'pending'
    item.nextAttemptAt = Date.now() + delay
    console.warn('[outbox] Attempt failed, next attempt at:', item.nextAttemptAt, id, item.lastError)
  }
  await put(OUTBOX_STORE, item)
  return item
}

export async function markPermanentFailed(id, error) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  item.status = 'permanent-failed'
  item.lastError = error?.message || String(error || 'unknown')
  item.nextAttemptAt = null
  item.attempts = Math.max(item.attempts || 0, MAX_ATTEMPTS)
  await put(OUTBOX_STORE, item)
  console.error('[outbox] Permanent failure reached:', id)
  return item
}

export async function resetForRetry(id) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  item.attempts = 0
  item.status = 'pending'
  item.nextAttemptAt = Date.now()
  item.lastError = null
  item.lastAttemptAt = null
  await put(OUTBOX_STORE, item)
  console.info('[outbox] Reset for retry:', id)
  return item
}

export async function getAll(uid) {
  await ensureStore()
  const items = await idbGetAll(OUTBOX_STORE)
  return uid ? items.filter((m) => m.uid === uid) : items
}

export async function getDueNow(uid) {
  const now = Date.now()
  const items = await getAll(uid)
  return items.filter((m) =>
    (m.status === 'pending') &&
    (m.nextAttemptAt === null || m.nextAttemptAt <= now)
  )
}

export async function deleteItem(id) {
  await ensureStore()
  await deleteFromIDB(OUTBOX_STORE, id)
  console.info('[outbox] Deleted item:', id)
}

// Re-export for direct usage if needed
export { deleteItem as rawDeleteItem }
