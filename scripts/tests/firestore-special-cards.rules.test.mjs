import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

const PROJECT_ID = 'voicecraft-special-cards-rules'
const SPACE = 'space_rules'
const RULES_ROOM = 'rules_room'
const CHAT_ROOM = 'chat_room'
let env

const paths = {
  space: () => `vc_spaces/${SPACE}`,
  member: (uid) => `vc_spaces/${SPACE}/members/${uid}`,
  room: (roomId) => `vc_spaces/${SPACE}/rooms/${roomId}`,
  message: (roomId, id) => `vc_spaces/${SPACE}/rooms/${roomId}/messages/${id}`,
  schedule: (id) => `vc_spaces/${SPACE}/rooms/${CHAT_ROOM}/scheduled_announcements/${id}`,
}

function dbFor(uid) {
  return env.authenticatedContext(uid, { email: `${uid}@test.local` }).firestore()
}

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, paths.space()), {
      createdBy: 'creator',
      memberIds: ['creator', 'moderator', 'member'],
      rulesRoomId: RULES_ROOM,
      rulesVersion: 3,
      rulesLock: true,
    })
    await setDoc(doc(db, paths.room(RULES_ROOM)), {
      type: 'text',
      chatLocked: false,
      rules: { enabled: true, version: 3, lockSpace: true },
    })
    await setDoc(doc(db, paths.room(CHAT_ROOM)), { type: 'text', chatLocked: false })
    await setDoc(doc(db, paths.member('creator')), { perms: {}, rulesAcceptedVersion: 0 })
    await setDoc(doc(db, paths.member('moderator')), { perms: { mod_chat: true }, rulesAcceptedVersion: 0 })
    await setDoc(doc(db, paths.member('member')), { perms: {}, rulesAcceptedVersion: 0 })
    await setDoc(doc(db, paths.message(RULES_ROOM, 'rules_card')), {
      id: 'rules_card', authorId: 'creator', kind: 'announce', text: 'Leia', ts: 1, announce: { title: 'Regras' },
    })
    await setDoc(doc(db, paths.message(CHAT_ROOM, 'legacy_card')), {
      authorId: 'legacy', announce: { title: 'Legado sem shape moderno' },
    })
  })
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  })
})
beforeEach(async () => { await env.clearFirestore(); await seed() })
after(async () => { await env?.cleanup() })

test('rules room stays readable while ordinary rooms require current acceptance', async () => {
  const member = dbFor('member')
  await assertSucceeds(getDoc(doc(member, paths.message(RULES_ROOM, 'rules_card'))))
  await assertFails(getDoc(doc(member, paths.message(CHAT_ROOM, 'legacy_card'))))
  await assertSucceeds(updateDoc(doc(member, paths.member('member')), {
    rulesAcceptedAt: Date.now(), rulesAcceptedVersion: 3,
  }))
  await assertSucceeds(getDoc(doc(member, paths.message(CHAT_ROOM, 'legacy_card'))))
})

test('moderator and creator bypass acceptance, ordinary members do not', async () => {
  await assertSucceeds(getDoc(doc(dbFor('moderator'), paths.message(CHAT_ROOM, 'legacy_card'))))
  await assertSucceeds(getDoc(doc(dbFor('creator'), paths.message(CHAT_ROOM, 'legacy_card'))))
  await assertFails(updateDoc(doc(dbFor('member'), paths.member('member')), {
    rulesAcceptedAt: Date.now(), rulesAcceptedVersion: 4,
  }))
})

test('members cannot forge special kinds or payloads', async () => {
  const member = dbFor('member')
  await updateDoc(doc(member, paths.member('member')), { rulesAcceptedAt: Date.now(), rulesAcceptedVersion: 3 })
  for (const [id, payload] of [
    ['fake_announce', { kind: 'announce', announce: { title: 'Fake' } }],
    ['fake_lobby', { kind: 'lobby_event', lobbyEvent: { type: 'join' } }],
    ['hidden_announce', { announce: { title: 'Fake' } }],
  ]) {
    await assertFails(setDoc(doc(member, paths.message(CHAT_ROOM, id)), {
      id, authorId: 'member', text: 'forjado', ts: Date.now(), ...payload,
    }))
  }
})

test('moderator and creator can create structurally valid special cards', async () => {
  await assertSucceeds(setDoc(doc(dbFor('moderator'), paths.message(CHAT_ROOM, 'mod_announce')), {
    id: 'mod_announce', kind: 'announce', authorId: 'moderator', createdBy: 'moderator', text: 'Aviso', ts: 2, announce: { title: 'Aviso' },
  }))
  await assertSucceeds(setDoc(doc(dbFor('creator'), paths.message(CHAT_ROOM, 'creator_lobby')), {
    id: 'creator_lobby', kind: 'lobby_event', authorId: 'creator', createdBy: 'creator', text: 'Entrou', ts: 3, lobbyEvent: { type: 'join', userId: 'member' },
  }))
  await assertFails(setDoc(doc(dbFor('moderator'), paths.message(CHAT_ROOM, 'bad_identity')), {
    id: 'different', kind: 'announce', authorId: 'moderator', text: 'Inválido', ts: 4, announce: {},
  }))
})

test('policy activation and room selection must be updated atomically', async () => {
  const moderator = dbFor('moderator')
  await assertFails(updateDoc(doc(moderator, paths.space()), {
    rulesRoomId: CHAT_ROOM, rulesVersion: 4, rulesLock: true,
  }))
  const batch = writeBatch(moderator)
  batch.update(doc(moderator, paths.room(RULES_ROOM)), { rules: { enabled: false, version: 3, lockSpace: true } })
  batch.update(doc(moderator, paths.room(CHAT_ROOM)), { rules: { enabled: true, version: 4, lockSpace: true } })
  batch.update(doc(moderator, paths.space()), { rulesRoomId: CHAT_ROOM, rulesVersion: 4, rulesLock: true })
  await assertSucceeds(batch.commit())
})

async function publishFallback(db, scheduleId) {
  const messageId = `scheduled_announce_${scheduleId}`
  return runTransaction(db, async (transaction) => {
    const scheduleRef = doc(db, paths.schedule(scheduleId))
    const snapshot = await transaction.get(scheduleRef)
    const schedule = snapshot.data()
    if (schedule.status === 'published') return { idempotent: true, messageId: schedule.publishedMessageId }
    const now = Date.now()
    transaction.set(doc(db, paths.message(CHAT_ROOM, messageId)), {
      id: messageId, kind: 'announce', authorId: 'moderator', createdBy: 'moderator', scheduleId,
      text: schedule.announce.title, ts: now, announce: { ...schedule.announce, scheduledFor: null },
    })
    transaction.update(scheduleRef, {
      status: 'published', publishedAt: now, publishedBy: 'moderator', publishedMessageId: messageId,
    })
    return { idempotent: false, messageId }
  })
}

test('scheduled publication race creates one deterministic message and retries idempotently', async () => {
  const moderator = dbFor('moderator')
  const scheduleId = 'schedule_race'
  await setDoc(doc(moderator, paths.schedule(scheduleId)), {
    id: scheduleId, spaceId: SPACE, roomId: CHAT_ROOM, createdBy: 'moderator', createdAt: 1,
    publishAt: 2, status: 'scheduled', announce: { title: 'Uma vez' },
  })
  const results = await Promise.all([publishFallback(moderator, scheduleId), publishFallback(moderator, scheduleId)])
  assert.equal(results.filter((result) => !result.idempotent).length, 1)
  assert.equal(results[0].messageId, results[1].messageId)
  const message = await getDoc(doc(moderator, paths.message(CHAT_ROOM, results[0].messageId)))
  assert.equal(message.data().text, 'Uma vez')
})
