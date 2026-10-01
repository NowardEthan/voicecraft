/**
 * Voice Cloud Functions — scheduled chat autopurge and authoritative Chan policy.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { publishAnnouncementAtomically, requireSafeId } = require('./announcement-publisher-core')
const { getDatabase } = require('firebase-admin/database')
const { CHAN_TIME_ZONE, chanDayWindow, sameChanTarget } = require('./chan-policy')

initializeApp()
const db = getFirestore()
const realtimeDb = getDatabase()

const SPACES = 'vc_spaces'
const USERS = 'vc_users'
const PAGE = 200
const MAX_PER_ROOM = 2000
const MAX_CHAN_MESSAGE_IDS = 4
const SAFE_FIREBASE_ID = /^[A-Za-z0-9_-]{1,128}$/

function normalizeAutopurge(raw) {
  if (!raw || typeof raw !== 'object') {
    return { enabled: false, everyHours: 24, olderThanHours: 72, roomIds: 'all' }
  }
  const everyHours = Math.min(168, Math.max(1, Number(raw.everyHours) || 24))
  const olderThanHours = Math.min(720, Math.max(1, Number(raw.olderThanHours) || 72))
  const roomIds = raw.roomIds === 'all' || raw.roomIds == null
    ? 'all'
    : Array.isArray(raw.roomIds)
      ? raw.roomIds.map(String).filter(Boolean).slice(0, 64)
      : 'all'
  return {
    enabled: !!raw.enabled,
    everyHours,
    olderThanHours,
    roomIds,
  }
}

function requireAuth(request) {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Entre na sua conta para usar um Chan.')
  return uid
}

function requireFirebaseId(value, field) {
  if (typeof value !== 'string' || !SAFE_FIREBASE_ID.test(value)) {
    throw new HttpsError('invalid-argument', `${field} inválido.`, { field })
  }
  return value
}

function parseChanInput(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const spaceId = requireFirebaseId(data.spaceId, 'spaceId')
  const roomId = requireFirebaseId(data.roomId, 'roomId')
  const messageId = requireFirebaseId(data.messageId, 'messageId')
  const supplied = Array.isArray(data.messageIds) ? data.messageIds : []
  if (supplied.length > MAX_CHAN_MESSAGE_IDS) {
    throw new HttpsError('invalid-argument', 'Muitos IDs de mensagem.', { field: 'messageIds' })
  }
  const messageIds = [...new Set([messageId, ...supplied.map((id) => requireFirebaseId(id, 'messageIds'))])]
  return { spaceId, roomId, messageId, messageIds }
}

async function requireMemberAndMessage(uid, input) {
  const spaceRef = db.collection(SPACES).doc(input.spaceId)
  const memberRef = spaceRef.collection('members').doc(uid)
  const messages = spaceRef.collection('rooms').doc(input.roomId).collection('messages')
  const [memberSnap, ...directSnaps] = await Promise.all([
    memberRef.get(),
    ...input.messageIds.map((id) => messages.doc(id).get()),
  ])
  if (!memberSnap.exists) {
    throw new HttpsError('permission-denied', 'Você não participa deste Space.')
  }

  let messageSnap = directSnaps.find((snap) => snap.exists)
  if (!messageSnap) {
    const lookup = await messages.where('id', 'in', input.messageIds.slice(0, 10)).limit(2).get()
    if (!lookup.empty) messageSnap = lookup.docs[0]
  }
  if (!messageSnap?.exists) {
    throw new HttpsError('not-found', 'Mensagem não encontrada.')
  }

  const storedId = messageSnap.data()?.id
  const knownIds = [...new Set([
    messageSnap.id,
    ...(typeof storedId === 'string' && SAFE_FIREBASE_ID.test(storedId) ? [storedId] : []),
  ])]
  if (!input.messageIds.every((id) => knownIds.includes(id))) {
    throw new HttpsError('invalid-argument', 'Os IDs informados não pertencem à mesma mensagem.', {
      field: 'messageIds',
    })
  }
  return { firestoreId: messageSnap.id, messageIds: knownIds }
}

function chanTarget(input, resolved) {
  return {
    spaceId: input.spaceId,
    roomId: input.roomId,
    messageId: resolved.firestoreId,
  }
}

async function writeChanSlots(input, resolved, uid, value) {
  const updates = {}
  for (const messageId of resolved.messageIds) {
    updates[`vc_room_likes/${input.spaceId}/${input.roomId}/${messageId}/${uid}`] = value
  }
  await realtimeDb.ref().update(updates)
}

exports.grantChan = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = parseChanInput(request.data)
  const resolved = await requireMemberAndMessage(uid, input)
  const { day, nextResetAt } = chanDayWindow()
  const target = chanTarget(input, resolved)
  const ledgerRef = db.collection(USERS).doc(uid).collection('chan_ledgers').doc(day)

  const transactionResult = await db.runTransaction(async (transaction) => {
    const ledgerSnap = await transaction.get(ledgerRef)
    if (ledgerSnap.exists) {
      const prior = ledgerSnap.data() || {}
      if (!sameChanTarget(prior.target, target)) {
        throw new HttpsError('resource-exhausted', 'Seu Chan de hoje já foi usado.', {
          day,
          nextResetAt,
          consumedAt: prior.consumedAt?.toDate?.().toISOString?.() || null,
        })
      }
      return { idempotent: true, consumedAt: prior.consumedAt || null }
    }

    const consumedAt = Timestamp.now()
    transaction.create(ledgerRef, {
      day,
      target,
      consumedAt,
    })
    return { idempotent: false, consumedAt }
  })

  // Admin RTDB writes bypass client rules. Retrying the same target repairs a
  // prior partial failure without consuming another daily allowance.
  await writeChanSlots(input, resolved, uid, true)
  return {
    success: true,
    status: 'success',
    granted: true,
    idempotent: transactionResult.idempotent,
    day,
    nextResetAt,
    messageId: resolved.firestoreId,
    messageIds: resolved.messageIds,
  }
})

exports.removeChan = onCall(async (request) => {
  const uid = requireAuth(request)
  const input = parseChanInput(request.data)
  const resolved = await requireMemberAndMessage(uid, input)

  // Deliberately do not read, delete, or revert chan_ledgers: removing a Chan
  // never refunds the account's global daily allowance.
  await writeChanSlots(input, resolved, uid, null)
  const { day, nextResetAt } = chanDayWindow()
  return {
    success: true,
    status: 'removed',
    removed: true,
    day,
    nextResetAt,
    messageId: resolved.firestoreId,
    messageIds: resolved.messageIds,
  }
})

function parseAnnouncementPublishInput(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  let spaceId
  let roomId
  let scheduleId
  try {
    spaceId = requireSafeId(data.spaceId, 'spaceId')
    roomId = requireSafeId(data.roomId, 'roomId')
    scheduleId = requireSafeId(data.scheduleId, 'scheduleId')
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message)
  }
  const payloadOverride = data.payloadOverride && typeof data.payloadOverride === 'object'
    && !Array.isArray(data.payloadOverride)
    ? data.payloadOverride
    : null
  return { spaceId, roomId, scheduleId, payloadOverride }
}

function canModerateSpace(uid, space, member) {
  return space?.createdBy === uid || member?.perms?.mod_chat === true
}

async function publishScheduledAnnouncementCore({
  spaceId,
  roomId,
  scheduleId,
  publisherId,
  payloadOverride = null,
  requireModerator = false,
  now = Date.now(),
}) {
  const spaceRef = db.collection(SPACES).doc(spaceId)
  const roomRef = spaceRef.collection('rooms').doc(roomId)
  const scheduleRef = roomRef.collection('scheduled_announcements').doc(scheduleId)
  const messageRef = roomRef.collection('messages').doc(`scheduled_announce_${scheduleId}`)

  return publishAnnouncementAtomically({
    scheduleId,
    publisherId,
    payloadOverride,
    now,
    runTransaction: (operation) => db.runTransaction(async (transaction) => operation({
      getSchedule: async () => {
        const refs = [spaceRef, roomRef, scheduleRef]
        if (requireModerator) refs.splice(1, 0, spaceRef.collection('members').doc(publisherId))
        const snaps = await transaction.getAll(...refs)
        const spaceSnap = snaps[0]
        const memberSnap = requireModerator ? snaps[1] : null
        const roomSnap = snaps[requireModerator ? 2 : 1]
        const scheduleSnap = snaps[requireModerator ? 3 : 2]
        if (!spaceSnap.exists || !roomSnap.exists) {
          throw new HttpsError('not-found', 'Space ou sala não encontrados.')
        }
        if (requireModerator && !canModerateSpace(
          publisherId,
          spaceSnap.data() || {},
          memberSnap?.exists ? memberSnap.data() || {} : null,
        )) {
          throw new HttpsError('permission-denied', 'É necessário poder moderar o chat.')
        }
        return scheduleSnap.exists ? scheduleSnap.data() || {} : null
      },
      writePublication: async (publication) => {
        transaction.set(messageRef, publication.message)
        transaction.set(roomRef, publication.roomPatch, { merge: true })
        transaction.set(scheduleRef, publication.schedulePatch, { merge: true })
      },
    })),
  })
}

exports.publishScheduledAnnouncement = onCall(async (request) => {
  const publisherId = requireAuth(request)
  const input = parseAnnouncementPublishInput(request.data)
  try {
    return await publishScheduledAnnouncementCore({
      ...input,
      publisherId,
      requireModerator: true,
    })
  } catch (error) {
    if (error instanceof HttpsError) throw error
    throw new HttpsError(error.code || 'internal', error.message || 'Falha ao publicar anúncio.')
  }
})

/** Server-side primary publisher; client execution is only an explicit fallback. */
exports.scheduledAnnouncementPublisher = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: CHAN_TIME_ZONE,
    retryCount: 2,
  },
  async () => {
    const dueSnap = await db.collectionGroup('scheduled_announcements')
      .where('status', '==', 'scheduled')
      .limit(200)
      .get()
    const now = Date.now()
    let published = 0
    for (const scheduleDoc of dueSnap.docs) {
      const schedule = scheduleDoc.data() || {}
      if (Number(schedule.publishAt || schedule.announce?.scheduledFor || 0) > now) continue
      const roomRef = scheduleDoc.ref.parent.parent
      const spaceRef = roomRef?.parent?.parent
      if (!roomRef || !spaceRef) continue
      try {
        const result = await publishScheduledAnnouncementCore({
          spaceId: spaceRef.id,
          roomId: roomRef.id,
          scheduleId: scheduleDoc.id,
          publisherId: String(schedule.createdBy || spaceRef.id),
          now,
        })
        if (!result.idempotent) published += 1
      } catch (error) {
        console.warn('[scheduledAnnouncementPublisher] publication failed', scheduleDoc.ref.path, error)
      }
    }
    console.log('[scheduledAnnouncementPublisher] done', { scanned: dueSnap.size, published })
    return null
  },
)
async function hardDeleteOldMessages(spaceId, roomId, olderThanMs) {
  const col = db.collection(SPACES).doc(spaceId).collection('rooms').doc(roomId).collection('messages')
  const cutoff = Date.now() - olderThanMs
  let purged = 0

  while (purged < MAX_PER_ROOM) {
    const snap = await col.orderBy('ts', 'asc').limit(PAGE).get()
    if (snap.empty) break

    const batch = db.batch()
    let ops = 0
    let hitNewer = false
    for (const d of snap.docs) {
      if (purged + ops >= MAX_PER_ROOM) break
      const data = d.data() || {}
      const ts = Number(data.ts || 0)
      if (ts >= cutoff) {
        hitNewer = true
        continue
      }
      batch.delete(d.ref)
      ops += 1
    }
    if (ops > 0) {
      await batch.commit()
      purged += ops
    }
    if (ops === 0) break
    if (hitNewer && ops === 0) break
  }
  return purged
}

async function listTextRoomIds(spaceId, roomIdsCfg) {
  if (Array.isArray(roomIdsCfg) && roomIdsCfg.length) return roomIdsCfg
  const roomsSnap = await db.collection(SPACES).doc(spaceId).collection('rooms').get()
  return roomsSnap.docs
    .filter((d) => {
      const data = d.data() || {}
      const type = data.type || (data.purpose === 'voice' ? 'voice' : 'text')
      return type !== 'voice'
    })
    .map((d) => d.id)
}

/** Runs hourly and purges old chat messages for configured Spaces. */
exports.scheduledChatAutopurge = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: CHAN_TIME_ZONE,
    retryCount: 1,
  },
  async () => {
    const spacesSnap = await db
      .collection(SPACES)
      .where('chatAutomation.autopurge.enabled', '==', true)
      .get()

    let total = 0
    for (const spaceDoc of spacesSnap.docs) {
      const spaceId = spaceDoc.id
      const data = spaceDoc.data() || {}
      const autopurge = normalizeAutopurge(data.chatAutomation?.autopurge)
      if (!autopurge.enabled) continue

      const lastRunAt = Number(data.chatAutomation?.autopurge?.lastRunAt || 0)
      const minIntervalMs = autopurge.everyHours * 60 * 60 * 1000
      if (lastRunAt && Date.now() - lastRunAt < minIntervalMs * 0.9) continue

      const olderThanMs = autopurge.olderThanHours * 60 * 60 * 1000
      const roomIds = await listTextRoomIds(spaceId, autopurge.roomIds)
      let spacePurged = 0
      for (const roomId of roomIds) {
        try {
          spacePurged += await hardDeleteOldMessages(spaceId, roomId, olderThanMs)
        } catch (err) {
          console.warn('[scheduledChatAutopurge] room failed', spaceId, roomId, err)
        }
      }
      total += spacePurged

      try {
        await spaceDoc.ref.set(
          {
            chatAutomation: {
              autopurge: {
                ...autopurge,
                lastRunAt: Date.now(),
                lastPurged: spacePurged,
              },
            },
          },
          { merge: true },
        )
      } catch (err) {
        console.warn('[scheduledChatAutopurge] stamp lastRunAt failed', spaceId, err)
      }
    }

    console.log('[scheduledChatAutopurge] done', { spaces: spacesSnap.size, purged: total })
    return null
  },
)