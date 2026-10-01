import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const firestoreRules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8')
const storageRules = await readFile(new URL('../../storage.rules', import.meta.url), 'utf8')

test('Firestore chat rules preserve immutable message identity and require membership', () => {
  assert.ok(firestoreRules.includes('function chatMessageIdentityUnchanged()'))
  for (const field of ["'id'", "'authorId'", "'kind'", "'ts'", "'replyToId'", "'threadRootId'"]) {
    assert.ok(firestoreRules.includes(field), `missing immutable identity field ${field}`)
  }
  assert.ok(firestoreRules.includes('allow read: if canAccessRoom(spaceId, roomId);'))
  assert.ok(firestoreRules.includes('request.resource.data.authorId == request.auth.uid'))
})

test('Storage chat rules and client policy share the strict 25 MiB boundary', () => {
  const strictBoundary = 'request.resource.size < 25 * 1024 * 1024'
  assert.equal(storageRules.split(strictBoundary).length - 1, 2)
  assert.ok(storageRules.includes("request.resource.metadata.get('uploaderId', '') == request.auth.uid"))
  assert.ok(storageRules.includes('roomExists(spaceId, roomId)'))
})