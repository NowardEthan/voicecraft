const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildScheduledAnnouncementPublication,
  deterministicAnnouncementMessageId,
  publishAnnouncementAtomically,
  resolvePublicationState,
} = require('../announcement-publisher-core')

test('message id is deterministic, bounded and schedule-specific', () => {
  const first = deterministicAnnouncementMessageId('schedule_123')
  assert.equal(first, deterministicAnnouncementMessageId('schedule_123'))
  assert.notEqual(first, deterministicAnnouncementMessageId('schedule_124'))
  assert.equal(first, 'scheduled_announce_schedule_123')
})

test('manual publication preserves the edited payload through the shared core', () => {
  const publication = buildScheduledAnnouncementPublication({
    scheduleId: 'schedule_edit',
    schedule: { announce: { title: 'Antigo', body: 'Persistido', custom: { keep: true } } },
    payloadOverride: {
      title: 'Editado agora',
      bodyHtml: '<b>Corpo atual</b>',
      authorName: 'Redação',
      custom: { edited: true },
      scheduledFor: 123,
    },
    publisherId: 'moderator_1',
    now: 456,
  })
  assert.equal(publication.message.text, 'Editado agora')
  assert.deepEqual(publication.message.announce.custom, { edited: true })
  assert.equal(publication.message.announce.scheduledFor, null)
  assert.equal(publication.message.authorId, 'moderator_1')
  assert.equal(publication.schedulePatch.publishedMessageId, publication.messageId)
})

test('retry/race resolution is idempotent after the first transaction wins', () => {
  const pending = { status: 'scheduled', announce: { title: 'Uma vez' } }
  const first = resolvePublicationState(pending, 'race_schedule')
  assert.equal(first.publish, true)

  const published = {
    ...pending,
    status: 'published',
    publishedMessageId: first.messageId,
  }
  const retryA = resolvePublicationState(published, 'race_schedule')
  const retryB = resolvePublicationState(published, 'race_schedule')
  assert.deepEqual(retryA, retryB)
  assert.equal(retryA.publish, false)
  assert.equal(retryA.idempotent, true)
  assert.equal(retryA.messageId, first.messageId)
})


test('concurrent publications commit exactly once and retries are idempotent', async () => {
  let schedule = { status: 'scheduled', announce: { title: 'Uma vez' } }
  let writes = 0
  let lock = Promise.resolve()
  const runTransaction = (operation) => {
    const previous = lock
    let release
    lock = new Promise((resolve) => { release = resolve })
    return previous.then(async () => {
      try {
        return await operation({
          getSchedule: async () => ({ ...schedule }),
          writePublication: async (publication) => {
            writes += 1
            schedule = { ...schedule, ...publication.schedulePatch }
          },
        })
      } finally {
        release()
      }
    })
  }
  const input = { runTransaction, scheduleId: 'race_real', publisherId: 'moderator_1', now: 789 }
  const [first, second] = await Promise.all([
    publishAnnouncementAtomically(input),
    publishAnnouncementAtomically(input),
  ])
  assert.equal(writes, 1)
  assert.deepEqual(new Set([first.idempotent, second.idempotent]), new Set([false, true]))
  assert.equal(first.messageId, second.messageId)
})
