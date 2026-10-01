import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MAX_TEXT_CHARS,
  MAX_TEXT_UTF8_BYTES,
  isAttachmentSizeAllowed,
  roomOperationKey,
  validateComposerText,
} from '../../src/features/chat/composerPolicy.js'
import {
  ROOM_SUBMIT_RECOVERY_ERROR,
  beginRoomSubmit,
  settleRoomSubmit,
  takeRoomRecovery,
} from '../../src/features/chat/roomSubmitState.js'

const MIB_25 = 25 * 1024 * 1024

test('attachment policy accepts one byte below 25 MiB and rejects exactly 25 MiB', () => {
  assert.equal(isAttachmentSizeAllowed(MIB_25 - 1, MIB_25), true)
  assert.equal(isAttachmentSizeAllowed(MIB_25, MIB_25), false)
})

test('text policy enforces the maximum JavaScript character count', () => {
  assert.equal(validateComposerText('a'.repeat(MAX_TEXT_CHARS)).valid, true)
  const over = validateComposerText('a'.repeat(MAX_TEXT_CHARS + 1))
  assert.equal(over.valid, false)
  assert.equal(over.charCount, MAX_TEXT_CHARS + 1)
})

test('text policy independently enforces UTF-8 bytes', () => {
  const atLimit = validateComposerText('€'.repeat(MAX_TEXT_UTF8_BYTES / 3))
  const overLimit = validateComposerText(`${'€'.repeat(MAX_TEXT_UTF8_BYTES / 3)}a`)

  assert.equal(atLimit.charCount < MAX_TEXT_CHARS, false)
  assert.equal(atLimit.byteCount, MAX_TEXT_UTF8_BYTES)
  assert.equal(atLimit.valid, false, 'the production character limit still applies at this byte boundary')
  const byteOnly = validateComposerText('€'.repeat(2_731), { maxChars: 10_000 })
  assert.equal(byteOnly.charCount, 2_731)
  assert.equal(byteOnly.byteCount, 8_193)
  assert.equal(byteOnly.valid, true)
  assert.equal(overLimit.byteCount, MAX_TEXT_UTF8_BYTES + 1)
  assert.equal(overLimit.valid, false)
})

test('UTF-8 byte validation rejects a byte overflow below the character maximum', () => {
  const text = '😀'.repeat(6_145)
  const result = validateComposerText(text)

  assert.equal(result.charCount, 12_290)
  assert.equal(result.byteCount, 24_580)
  assert.equal(result.valid, false)
  const byteLimited = validateComposerText('😀'.repeat(6_145), { maxChars: 20_000 })
  assert.equal(byteLimited.byteCount > MAX_TEXT_UTF8_BYTES, true)
  assert.equal(byteLimited.valid, false)
})

test('failed submit recovery stays scoped to its origin room', () => {
  const pending = new Map()
  const recovery = new Map()
  const roomA = roomOperationKey('user', 'space', 'room-a')
  const roomB = roomOperationKey('user', 'space', 'room-b')
  const snapshot = { text: 'draft A', attachments: [{ name: 'a.txt' }], mentionIds: ['u2'] }

  beginRoomSubmit(pending, recovery, roomA, 1, snapshot)
  const settled = settleRoomSubmit(pending, recovery, roomA, 1, false)

  assert.equal(settled.recovery.error, ROOM_SUBMIT_RECOVERY_ERROR)
  assert.equal(takeRoomRecovery(pending, recovery, roomB), null)
  assert.deepEqual(takeRoomRecovery(pending, recovery, roomA), { ...snapshot, operationId: 1, error: ROOM_SUBMIT_RECOVERY_ERROR })
  assert.equal(takeRoomRecovery(pending, recovery, roomA), null)
})

test('stale async completion cannot clear a newer room operation', () => {
  const pending = new Map()
  const recovery = new Map()
  const room = roomOperationKey('user', 'space', 'room')

  beginRoomSubmit(pending, recovery, room, 1, { text: 'old' })
  beginRoomSubmit(pending, recovery, room, 2, { text: 'new' })
  const stale = settleRoomSubmit(pending, recovery, room, 1, false)

  assert.deepEqual(stale, { ownsPending: false, recovery: null })
  assert.equal(pending.get(room), 2)
  assert.equal(takeRoomRecovery(pending, recovery, room), null)
  settleRoomSubmit(pending, recovery, room, 2, true)
  assert.equal(pending.has(room), false)
  assert.equal(recovery.has(room), false)
})