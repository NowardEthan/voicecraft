import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { CHAN_TIME_ZONE, chanDayWindow, sameChanTarget } = require('../../functions/chan-policy.js')
const functionsSource = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8')
const firestoreRules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8')
const databaseRules = JSON.parse(await readFile(new URL('../../database.rules.json', import.meta.url), 'utf8'))
const likesSource = await readFile(new URL('../../src/shared/firebase/likes.js', import.meta.url), 'utf8')

test('Chan day follows America/Sao_Paulo and resets at local midnight', () => {
  assert.equal(CHAN_TIME_ZONE, 'America/Sao_Paulo')
  assert.deepEqual(chanDayWindow(new Date('2026-09-30T02:59:59.000Z')), {
    day: '2026-09-29',
    nextResetAt: '2026-09-30T03:00:00.000Z',
  })
  assert.deepEqual(chanDayWindow(new Date('2026-09-30T03:00:00.000Z')), {
    day: '2026-09-30',
    nextResetAt: '2026-10-01T03:00:00.000Z',
  })
})

test('Chan target identity is global across spaces and rooms', () => {
  const target = { spaceId: 'space_a', roomId: 'room_a', messageId: 'msg_a' }
  assert.equal(sameChanTarget(target, { ...target }), true)
  assert.equal(sameChanTarget(target, { ...target, roomId: 'room_b' }), false)
  assert.equal(sameChanTarget(target, { ...target, messageId: 'msg_b' }), false)
})

test('grant callable uses a per-account daily transaction ledger and exposes reset metadata', () => {
  assert.match(functionsSource, /exports\.grantChan = onCall/)
  assert.match(functionsSource, /collection\(USERS\)\.doc\(uid\)\.collection\('chan_ledgers'\)\.doc\(day\)/)
  assert.match(functionsSource, /db\.runTransaction/)
  assert.match(functionsSource, /transaction\.create\(ledgerRef/)
  assert.match(functionsSource, /new HttpsError\('resource-exhausted'/)
  assert.match(functionsSource, /nextResetAt/)
  assert.match(functionsSource, /sameChanTarget\(prior\.target, target\)/)
})

test('future quota callables preserve authoritative membership, message, and Admin writes', () => {
  assert.match(functionsSource, /collection\('members'\)\.doc\(uid\)/)
  assert.match(functionsSource, /collection\('messages'\)/)
  assert.match(functionsSource, /Mensagem .* encontrada/)
  assert.match(functionsSource, /getDatabase\(\)/)
  assert.match(functionsSource, /realtimeDb\.ref\(\)\.update\(updates\)/)
})

test('temporary mode is unlimited and defaults to direct atomic RTDB alias writes', () => {
  assert.match(likesSource, /VITE_CHAN_DAILY_QUOTA_ENABLED === 'true'/)
  assert.match(likesSource, /await update\(ref\(getDb\(\)\), updates\)/)
  assert.match(likesSource, /mode: 'unlimited-direct'/)
  assert.match(likesSource, /getCallable\('grantChan'\)/)
  assert.match(likesSource, /getCallable\('removeChan'\)/)
  assert.match(likesSource, /COORDINATED SECURITY CHANGE REQUIRED/)
  assert.match(likesSource, /Enabling only this client flag does not secure the quota/)
})

test('temporary RTDB rules allow only own Chan slots and preserve reaction rules', () => {
  const likesRule = databaseRules.rules.vc_room_likes.$spaceId.$roomId.$msgId.$uid
  assert.equal(likesRule['.write'], 'auth != null && auth.uid == $uid')
  assert.equal(likesRule['.validate'], 'newData.val() === true')
  const reactionRule = databaseRules.rules.vc_msg_reactions.$spaceId.$roomId.$msgId.$emoji.$uid
  assert.equal(reactionRule['.write'], 'auth != null && auth.uid == $uid')
  assert.equal(reactionRule['.validate'], 'newData.val() === true')
})

test('future server ledger remains client-inaccessible', () => {
  assert.match(firestoreRules, /match \/chan_ledgers\/{day}/)
  assert.match(firestoreRules, /match \/chan_ledgers\/{day} \{[\s\S]*allow read, write: if false;/)
})

test('remove callable never refunds or deletes the daily ledger', () => {
  const removeBody = functionsSource.split('exports.removeChan = onCall')[1].split('function parseAnnouncementPublishInput')[0]
  assert.match(removeBody, /writeChanSlots\(input, resolved, uid, null\)/)
  assert.doesNotMatch(removeBody, /ledgerRef/)
  assert.doesNotMatch(removeBody, /transaction\.(delete|set|update)/)
})
