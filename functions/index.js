/**
 * VoiceCraft Cloud Functions — scheduled chat autopurge.
 *
 * Soft-deletes messages older than chatAutomation.autopurge.olderThanHours
 * for Spaces with autopurge.enabled.
 */
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

initializeApp()
const db = getFirestore()

const SPACES = 'vc_spaces'
const PAGE = 200
const MAX_PER_ROOM = 2000

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
    // Restart from head after deletes; stop when nothing older remains.
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

/**
 * Runs hourly. For each Space with autopurge on, soft-deletes old messages.
 * everyHours is honored via lastRunAt on the automation doc to avoid over-running.
 */
exports.scheduledChatAutopurge = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'America/Sao_Paulo',
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
      if (lastRunAt && Date.now() - lastRunAt < minIntervalMs * 0.9) {
        continue
      }

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
