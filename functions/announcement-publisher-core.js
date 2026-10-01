const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/

function requireSafeId(value, field = 'id') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    const error = new Error(`${field} inválido.`)
    error.code = 'invalid-argument'
    throw error
  }
  return value
}

function deterministicAnnouncementMessageId(scheduleId) {
  return `scheduled_announce_${requireSafeId(scheduleId, 'scheduleId')}`
}

function clonePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return JSON.parse(JSON.stringify(value))
}

function plainText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function announcementPreviewText(announce) {
  return plainText(announce.title || announce.body || announce.bodyHtml || 'Anúncio').slice(0, 140) || 'Anúncio'
}

function buildScheduledAnnouncementPublication({
  scheduleId,
  schedule,
  payloadOverride = null,
  publisherId,
  now = Date.now(),
}) {
  requireSafeId(scheduleId, 'scheduleId')
  requireSafeId(publisherId, 'publisherId')
  const stored = clonePlainObject(schedule?.announce)
  const edited = payloadOverride && typeof payloadOverride === 'object'
    ? clonePlainObject(payloadOverride)
    : null
  const announce = { ...(edited || stored), scheduledFor: null }
  const text = announcementPreviewText(announce)
  const messageId = deterministicAnnouncementMessageId(scheduleId)
  return {
    messageId,
    message: {
      id: messageId,
      kind: 'announce',
      text,
      author: String(announce.authorName || 'sistema').slice(0, 64),
      authorId: publisherId,
      authorPhoto: String(announce.authorPhoto || '').slice(0, 2000),
      ts: Number(now),
      createdAt: Number(now),
      createdBy: publisherId,
      scheduleId,
      announce,
    },
    roomPatch: {
      lastMessageAt: Number(now),
      lastMessageId: messageId,
      lastMessagePreview: text,
      lastAuthorId: publisherId,
      lastAuthorName: String(announce.authorName || 'Anúncio').slice(0, 64),
    },
    schedulePatch: {
      status: 'published',
      publishedAt: Number(now),
      publishedBy: publisherId,
      publishedMessageId: messageId,
    },
  }
}

function resolvePublicationState(schedule, scheduleId) {
  const messageId = deterministicAnnouncementMessageId(scheduleId)
  if (schedule?.status === 'published') {
    return {
      publish: false,
      idempotent: true,
      messageId: schedule.publishedMessageId || messageId,
    }
  }
  if (schedule?.status !== 'scheduled' && schedule?.status !== 'publishing') {
    const error = new Error('Este anúncio já não está agendado.')
    error.code = 'failed-precondition'
    throw error
  }
  return { publish: true, idempotent: false, messageId }
}

async function publishAnnouncementAtomically({
  runTransaction,
  scheduleId,
  publisherId,
  payloadOverride = null,
  now = Date.now(),
}) {
  if (typeof runTransaction !== 'function') throw new TypeError('runTransaction é obrigatório.')
  return runTransaction(async ({ getSchedule, writePublication }) => {
    const schedule = await getSchedule()
    if (!schedule) {
      const error = new Error('Agendamento não encontrado.')
      error.code = 'not-found'
      throw error
    }
    const state = resolvePublicationState(schedule, scheduleId)
    if (!state.publish) return { ok: true, ...state }
    const publication = buildScheduledAnnouncementPublication({
      scheduleId,
      schedule,
      payloadOverride,
      publisherId,
      now,
    })
    await writePublication(publication)
    return { ok: true, idempotent: false, messageId: publication.messageId }
  })
}

module.exports = {
  SAFE_ID,
  announcementPreviewText,
  buildScheduledAnnouncementPublication,
  deterministicAnnouncementMessageId,
  publishAnnouncementAtomically,
  requireSafeId,
  resolvePublicationState,
}
