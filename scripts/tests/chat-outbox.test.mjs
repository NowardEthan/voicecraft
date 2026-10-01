import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_OUTBOX_ATTEMPTS,
  outboxEventType,
  runOutboxTaskOnce,
  transitionOutboxCanceled,
  transitionOutboxFailed,
  transitionOutboxInFlight,
  transitionOutboxRetry,
} from '../../src/shared/chat/outboxState.js'

const pendingItem = { id: 'm1', status: 'pending', attempts: 0, nextAttemptAt: 0 }

test('outbox transitions expose sending, failed, and retrying events', () => {
  const sending = transitionOutboxInFlight(pendingItem, 100)
  const failed = transitionOutboxFailed(sending, new Error('offline'), { now: 200, random: 0 })
  const retrying = transitionOutboxRetry(failed, 300)

  assert.equal(outboxEventType(sending), 'sending')
  assert.equal(outboxEventType(failed), 'failed')
  assert.equal(failed.attempts, 1)
  assert.equal(failed.nextAttemptAt, 2_200)
  assert.equal(outboxEventType(retrying), 'retrying')
  assert.equal(retrying.attempts, 0)
  assert.equal(retrying.nextAttemptAt, 300)
  assert.equal(retrying.lastError, null)
})

test('outbox failure becomes permanent at the attempt limit', () => {
  const item = { ...pendingItem, attempts: MAX_OUTBOX_ATTEMPTS - 1 }
  const failed = transitionOutboxFailed(item, 'still offline', { now: 500, random: 0 })

  assert.equal(failed.status, 'permanent-failed')
  assert.equal(failed.nextAttemptAt, null)
  assert.equal(outboxEventType(failed), 'permanent-failed')
})

test('cancel transition creates a non-due tombstone without mutating the source', () => {
  const canceled = transitionOutboxCanceled(pendingItem, 777)

  assert.deepEqual(canceled, { ...pendingItem, status: 'canceled', nextAttemptAt: null, canceledAt: 777 })
  assert.equal(outboxEventType(canceled), 'canceled')
  assert.equal(pendingItem.status, 'pending')
  assert.equal(pendingItem.nextAttemptAt, 0)
})

test('concurrent retry work for one id is idempotently coalesced', async () => {
  const inFlight = new Map()
  let calls = 0
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const run = () => runOutboxTaskOnce(inFlight, 'm1', async () => {
    calls += 1
    await gate
    return 'sent'
  })

  const first = run()
  const second = run()
  assert.equal(first, second)
  assert.equal(calls, 0)
  await Promise.resolve()
  assert.equal(calls, 1)
  release()
  assert.equal(await first, 'sent')
  assert.equal(await second, 'sent')
  assert.equal(inFlight.has('m1'), false)
})