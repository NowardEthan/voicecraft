/**
 * outboxDispatcher — singleton that drains the chat outbox.
 *
 * - Listens for `online` events for immediate flush.
 * - Polls every 5s for items with nextAttemptAt <= now.
 * - Calls an injected sender (set via `setSender` from useChat.js)
 *   so we don't create circular imports and so the dispatcher can be
 *   exercised in isolation.
 */

import {
  enqueueMessage, markInFlight, markSent, markFailedAttempt,
  resetForRetry, getDueNow, getAll, deleteItem,
} from './chatOutbox'
import { openDB } from '../cache/idb'
import { runOutboxTaskOnce } from './outboxState.js'

const POLL_MS = 5_000

let sender = null
let pollHandle = null
let onlineHandler = null
let booted = false
const inFlight = new Map() // id -> active dispatch promise (per-id idempotency)
const canceled = new Set() // blocks stale due-list and in-flight continuations
let activeUid = null

const senderRegistrations = new Map()
let senderSequence = 0

export function setSender(fn) {
  if (typeof fn !== 'function') return () => {}
  const token = ++senderSequence
  senderRegistrations.set(token, fn)
  sender = fn
  return () => {
    senderRegistrations.delete(token)
    if (sender !== fn) return
    const remaining = [...senderRegistrations.values()]
    sender = remaining[remaining.length - 1] || null
  }
}

export function isCanceled(id) {
  return !!id && canceled.has(id)
}

export async function cancel(id) {
  if (!id) return false
  canceled.add(id)
  await deleteItem(id)
  const running = inFlight.get(id)
  if (running) await running.catch(() => {})
  // The record is gone and any active continuation has stopped. A stale due
  // snapshot can no longer dispatch it because markInFlight will find nothing.
  canceled.delete(id)
  return true
}

export function setActiveUid(uid) {
  activeUid = uid || null
}

function dispatchOne(uid, id) {
  if (canceled.has(id)) return Promise.resolve()
  if (inFlight.has(id)) return inFlight.get(id)
  if (!sender) {
    console.warn('[outbox] No sender registered; skipping dispatch for', id)
    return Promise.resolve()
  }
  const activeSender = sender
  return runOutboxTaskOnce(inFlight, id, async () => {
    const item = await markInFlight(id)
    if (!item || canceled.has(id)) return
    try {
      await activeSender(item)
      if (!canceled.has(id)) await markSent(id)
    } catch (err) {
      if (!canceled.has(id)) await markFailedAttempt(id, err)
    }
  })
}

async function flushDue() {
  if (!activeUid) return
  const due = await getDueNow(activeUid)
  if (!due.length) return
  // Run sequentially to avoid Firebase quota spikes during reconnect storms.
  for (const item of due) {
    // Re-check that we still want to dispatch (nextAttemptAt might've moved).
    if (inFlight.has(item.id) || canceled.has(item.id)) continue
    if (Date.now() < (item.nextAttemptAt || 0)) continue
    // eslint-disable-next-line no-await-in-loop
    await dispatchOne(activeUid, item.id)
  }
}

export async function flush(uid) {
  const targetUid = uid || activeUid
  if (!targetUid) return
  const due = await getDueNow(targetUid)
  for (const item of due) {
    if (inFlight.has(item.id) || canceled.has(item.id)) continue
    // eslint-disable-next-line no-await-in-loop
    await dispatchOne(targetUid, item.id)
  }
}

export async function retryNow(id) {
  if (!activeUid) return null
  canceled.delete(id)
  const item = await resetForRetry(id)
  if (!item) throw new Error('Mensagem nao encontrada na fila de envio')
  await dispatchOne(activeUid, id)
  return id
}

export async function pendingForUid(uid) {
  const items = await getAll(uid)
  return items
}

export function start() {
  if (booted) return
  if (typeof window === 'undefined') return
  booted = true
  onlineHandler = () => { void flush() }
  window.addEventListener('online', onlineHandler)
  pollHandle = setInterval(() => { void flushDue() }, POLL_MS)
  // Eagerly open the DB so the outbox store is guaranteed to exist
  // before the first read attempt (avoids NotFoundError spam in console).
  openDB().catch((err) => console.warn('[outbox] failed to open db:', err))
  console.info('[outbox] Dispatcher started (poll=', POLL_MS, 'ms)')
}

export function stop() {
  if (!booted) return
  booted = false
  if (typeof window !== 'undefined' && onlineHandler) {
    window.removeEventListener('online', onlineHandler)
    onlineHandler = null
  }
  if (pollHandle) {
    clearInterval(pollHandle)
    pollHandle = null
  }
  console.info('[outbox] Dispatcher stopped')
}

// Re-export helper for callers that need to enqueue without importing the whole outbox.
export { enqueueMessage }
