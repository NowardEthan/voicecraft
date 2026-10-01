import { htmlToPlainText, normalizeAnnounce } from '../announceSchema.js'

export const ANNOUNCEMENT_PERSISTENCE_ACTIONS = Object.freeze({
  CREATE_PUBLISHED: 'create-published',
  CREATE_SCHEDULED: 'create-scheduled',
  UPDATE_PUBLISHED: 'update-published',
  UPDATE_SCHEDULED: 'update-scheduled',
  PUBLISH_SCHEDULED_NOW: 'publish-scheduled-now',
})

/** Convert visual editor state into one explicit persistence operation. */
export function buildAnnouncementPersistencePlan({
  draft,
  scheduleOn = false,
  editingMessageId = null,
  scheduledId = null,
}) {
  const scheduledFor = !editingMessageId && scheduleOn ? draft?.scheduledFor : null
  const payload = normalizeAnnounce({
    ...draft,
    body: draft?.body || htmlToPlainText(draft?.bodyHtml),
    scheduledFor,
  })

  let action = ANNOUNCEMENT_PERSISTENCE_ACTIONS.CREATE_PUBLISHED
  if (scheduledId) {
    action = payload.scheduledFor
      ? ANNOUNCEMENT_PERSISTENCE_ACTIONS.UPDATE_SCHEDULED
      : ANNOUNCEMENT_PERSISTENCE_ACTIONS.PUBLISH_SCHEDULED_NOW
  } else if (editingMessageId) {
    action = ANNOUNCEMENT_PERSISTENCE_ACTIONS.UPDATE_PUBLISHED
  } else if (payload.scheduledFor) {
    action = ANNOUNCEMENT_PERSISTENCE_ACTIONS.CREATE_SCHEDULED
  }

  return Object.freeze({ action, payload, editingMessageId, scheduledId })
}

/** Execute a persistence plan without coupling the visual draft to Firestore calls. */
export async function persistAnnouncementPlan({ signaling, roomId, plan }) {
  switch (plan.action) {
    case ANNOUNCEMENT_PERSISTENCE_ACTIONS.UPDATE_SCHEDULED:
      return signaling.updateScheduledAnnouncement(roomId, plan.scheduledId, plan.payload)
    case ANNOUNCEMENT_PERSISTENCE_ACTIONS.PUBLISH_SCHEDULED_NOW:
      return signaling.publishScheduledAnnouncementNow(roomId, plan.scheduledId, plan.payload)
    case ANNOUNCEMENT_PERSISTENCE_ACTIONS.UPDATE_PUBLISHED:
      return signaling.updateChatAnnouncement(roomId, plan.editingMessageId, plan.payload)
    case ANNOUNCEMENT_PERSISTENCE_ACTIONS.CREATE_SCHEDULED:
      return signaling.scheduleChatAnnouncement(roomId, plan.payload)
    case ANNOUNCEMENT_PERSISTENCE_ACTIONS.CREATE_PUBLISHED:
      return signaling.sendChatAnnouncement(roomId, plan.payload)
    default:
      throw new Error('Operação de anúncio inválida')
  }
}
