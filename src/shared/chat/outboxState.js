export const MAX_OUTBOX_ATTEMPTS = 5
export const OUTBOX_BASE_DELAY_MS = 1000
export const OUTBOX_CAP_DELAY_MS = 16000
export const OUTBOX_JITTER_MS = 500

export function outboxEventType(item) {
  if (item?.status === 'permanent-failed') return 'permanent-failed'
  if (item?.status === 'pending' && Number(item?.attempts) > 0) return 'failed'
  if (item?.status === 'pending') return 'retrying'
  if (item?.status === 'in-flight') return 'sending'
  if (item?.status === 'canceled') return 'canceled'
  return item?.status || null
}

export function transitionOutboxInFlight(item, now = Date.now()) {
  return item ? { ...item, status: 'in-flight', lastAttemptAt: now } : null
}

export function transitionOutboxFailed(item, error, {
  now = Date.now(),
  random = Math.random(),
  maxAttempts = MAX_OUTBOX_ATTEMPTS,
} = {}) {
  if (!item) return null
  const attempts = (item.attempts || 0) + 1
  const permanent = attempts >= maxAttempts
  const delay = Math.min(OUTBOX_CAP_DELAY_MS, OUTBOX_BASE_DELAY_MS * Math.pow(2, attempts))
    + Math.floor(random * OUTBOX_JITTER_MS)
  return {
    ...item,
    attempts,
    lastError: error?.message || String(error || 'unknown'),
    lastAttemptAt: now,
    status: permanent ? 'permanent-failed' : 'pending',
    nextAttemptAt: permanent ? null : now + delay,
  }
}

export function transitionOutboxPermanentFailed(item, error) {
  if (!item) return null
  return {
    ...item,
    status: 'permanent-failed',
    lastError: error?.message || String(error || 'unknown'),
    nextAttemptAt: null,
    attempts: Math.max(item.attempts || 0, MAX_OUTBOX_ATTEMPTS),
  }
}

export function transitionOutboxRetry(item, now = Date.now()) {
  if (!item) return null
  return {
    ...item,
    attempts: 0,
    status: 'pending',
    nextAttemptAt: now,
    lastError: null,
    lastAttemptAt: null,
  }
}

export function transitionOutboxCanceled(item, now = Date.now()) {
  return item ? { ...item, status: 'canceled', nextAttemptAt: null, canceledAt: now } : null
}

/** Coalesce concurrent work for one outbox id into the same promise. */
export function runOutboxTaskOnce(inFlight, id, taskFactory) {
  const existing = inFlight.get(id)
  if (existing) return existing
  const task = Promise.resolve().then(taskFactory).finally(() => {
    if (inFlight.get(id) === task) inFlight.delete(id)
  })
  inFlight.set(id, task)
  return task
}
