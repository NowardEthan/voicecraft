import test from 'node:test'
import assert from 'node:assert/strict'

import { buildConversationRows, computeMessageWindow } from '../../src/components/views/chatTimeline.js'
import { actionIdOf, resolveMessageIdentity } from '../../src/features/chat/messageIdentity.js'

const messageRows = (rows) => rows.filter((row) => row.kind === 'msg')

test('same-author messages cannot group across local midnight', () => {
  const beforeMidnight = new Date(2026, 8, 29, 23, 59, 59, 900).getTime()
  const afterMidnight = new Date(2026, 8, 30, 0, 0, 0, 100).getTime()
  const rows = buildConversationRows([
    { id: 'before', authorId: 'author', ts: beforeMidnight, text: 'before' },
    { id: 'after', authorId: 'author', ts: afterMidnight, text: 'after' },
  ], { groupBreakMs: 60_000 })

  assert.deepEqual(messageRows(rows).map((row) => row.items.map((item) => item.id)), [['before'], ['after']])
  assert.equal(rows.filter((row) => row.kind === 'day').length, 2)
})

test('same-author messages cannot group across the unread boundary', () => {
  const base = new Date(2026, 8, 29, 12, 0, 0).getTime()
  const rows = buildConversationRows([
    { id: 'read', authorId: 'author', ts: base, text: 'read' },
    { id: 'unread', authorId: 'author', ts: base + 1_000, text: 'unread' },
  ], { lastReadTs: base, groupBreakMs: 60_000 })

  assert.deepEqual(messageRows(rows).map((row) => row.items.map((item) => item.id)), [['read'], ['unread']])
  assert.equal(rows.filter((row) => row.kind === 'unread').length, 1)
})

test('old jump targets remain inside a bounded message window', () => {
  const messages = Array.from({ length: 1_000 }, (_, index) => ({ id: `m-${index}`, ts: index }))
  const result = computeMessageWindow(messages, 80, { anchorId: 'm-12' })

  assert.equal(result.items.length, 80)
  assert.equal(result.start, 0)
  assert.equal(result.end, 80)
  assert.ok(result.items.some((message) => message.id === 'm-12'))
})

test('message window clamps explicit starts without exceeding its limit', () => {
  const messages = Array.from({ length: 200 }, (_, index) => ({ id: `m-${index}` }))
  const result = computeMessageWindow(messages, 50, { start: 999 })

  assert.equal(result.start, 150)
  assert.equal(result.end, 200)
  assert.equal(result.items.length, 50)
})

test('action identity prefers local id while persistence prefers firestoreId', () => {
  const message = { id: 'local-id', firestoreId: 'firestore-id' }
  assert.equal(actionIdOf(message), 'local-id')
  assert.deepEqual(resolveMessageIdentity(message, 'fallback'), {
    actionId: 'local-id',
    outboxId: 'local-id',
    persistenceId: 'firestore-id',
    aliases: ['local-id', 'firestore-id', 'fallback'],
  })
})

test('action identity falls back to firestoreId and then caller id', () => {
  assert.equal(actionIdOf({ firestoreId: 'firestore-only' }), 'firestore-only')
  assert.deepEqual(resolveMessageIdentity(null, 'fallback-id'), {
    actionId: 'fallback-id',
    outboxId: 'fallback-id',
    persistenceId: 'fallback-id',
    aliases: ['fallback-id'],
  })
})