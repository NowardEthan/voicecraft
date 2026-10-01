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
import {
  outboxEventType, transitionOutboxCanceled, transitionOutboxFailed, transitionOutboxInFlight,
  transitionOutboxPermanentFailed, transitionOutboxRetry,
} from './outboxState.js'

const OUTBOX_STORE = 'outbox'
const listeners = new Set()

function emit(type, item = null, id = item?.id || null) {
  const event = { type, id, item }
  for (const listener of [...listeners]) {
    try { listener(event) } catch (err) { console.warn('[outbox] listener failed:', err) }
  }
}

/** Subscribe to durable outbox transitions. Safe for multiple mounted rooms. */
export function subscribe(listener) {
  if (typeof listener !== 'function') return () => {}
  listeners.add(listener)
  return () => listeners.delete(listener)
}

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
  emit('enqueued', item)
  console.info('[outbox] Enqueued message:', id, roomKey)
  return id
}

export async function updateMessagePayload(id, payload) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  item.payload = payload || {}
  item.updatedAt = Date.now()
  await put(OUTBOX_STORE, item)
  emit('payload-updated', item)
  return item
}

export async function markInFlight(id) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  const next = transitionOutboxInFlight(item)
  await put(OUTBOX_STORE, next)
  emit(outboxEventType(next), next)
  console.info('[outbox] In-flight attempt #', item.attempts + 1, id)
  return next
}

export async function markSent(id) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  await deleteFromIDB(OUTBOX_STORE, id)
  emit('sent', item, id)
  console.info('[outbox] Message delivered successfully:', id)
}

export async function markFailedAttempt(id, error) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  const next = transitionOutboxFailed(item, error)
  if (next.status === 'permanent-failed') {
    console.error('[outbox] Permanent failure reached:', id, 'attempts=', next.attempts)
  } else {
    console.warn('[outbox] Attempt failed, next attempt at:', next.nextAttemptAt, id, next.lastError)
  }
  await put(OUTBOX_STORE, next)
  emit(outboxEventType(next), next)
  return next
}

export async function markPermanentFailed(id, error) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  const next = transitionOutboxPermanentFailed(item, error)
  await put(OUTBOX_STORE, next)
  emit(outboxEventType(next), next)
  console.error('[outbox] Permanent failure reached:', id)
  return next
}

export async function resetForRetry(id) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (!item) return null
  const next = transitionOutboxRetry(item)
  await put(OUTBOX_STORE, next)
  emit(outboxEventType(next), next)
  console.info('[outbox] Reset for retry:', id)
  return next
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
    (m.status === 'pending' || m.status === 'in-flight') &&
    (m.status === 'in-flight' || m.nextAttemptAt === null || m.nextAttemptAt <= now)
  )
}

export async function deleteItem(id) {
  await ensureStore()
  const item = await get(OUTBOX_STORE, id)
  if (item) {
    // Persist a tombstone before deleting. If IndexedDB deletion fails or the
    // renderer exits between operations, getDueNow() still cannot resend it.
    const canceledItem = transitionOutboxCanceled(item)
    await put(OUTBOX_STORE, canceledItem)
    emit('canceled', canceledItem, id)
    try {
      await deleteFromIDB(OUTBOX_STORE, id)
    } catch (err) {
      console.warn('[outbox] Canceled tombstone retained:', id, err)
      return canceledItem
    }
    console.info('[outbox] Deleted item:', id)
    return canceledItem
  }
  await deleteFromIDB(OUTBOX_STORE, id)
  return null
}

// Re-export for direct usage if needed
export { deleteItem as rawDeleteItem }
