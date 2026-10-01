/**
 * Firebase helpers for Chan.
 *
 * TEMPORARY TEST MODE: Chan is unlimited and writes directly to the caller's
 * own RTDB slots. The premium UI still awaits these writes before confirming.
 *
 * FUTURE QUOTA ROLLOUT (COORDINATED SECURITY CHANGE REQUIRED): set
 * VITE_CHAN_DAILY_QUOTA_ENABLED=true ONLY in the same release that deploys
 * grantChan/removeChan AND publishes RTDB rules that deny every client write
 * to vc_room_likes. Enabling only this client flag does not secure the quota;
 * old clients could still write directly while permissive rules are deployed.
 */
import { getDatabase, ref, onValue, update } from 'firebase/database'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { firebaseApp } from './app'

export const CHAN_DAILY_QUOTA_ENABLED = import.meta.env.VITE_CHAN_DAILY_QUOTA_ENABLED === 'true'

function getDb() {
  return getDatabase(firebaseApp)
}

function getCallable(name) {
  return httpsCallable(getFunctions(firebaseApp), name)
}

function isLikedValue(value) {
  return value === true || value === 1 || value === 'true'
}

function chanPayload(spaceId, roomId, msgIds) {
  const messageIds = [...new Set((msgIds || []).map(String).filter(Boolean))]
  if (!spaceId || !roomId || !messageIds.length) {
    throw new Error('Mensagem inv\u00e1lida para Chan.')
  }
  return {
    spaceId,
    roomId,
    // useChat orders aliases with the canonical Firestore id first.
    messageId: messageIds[0],
    messageIds,
  }
}

async function writeOwnChanSlots(payload, userId, value) {
  if (!userId) throw new Error('Entre na sua conta para usar um Chan.')
  const updates = {}
  for (const messageId of payload.messageIds) {
    updates[`vc_room_likes/${payload.spaceId}/${payload.roomId}/${messageId}/${userId}`] = value
  }
  // A single root update keeps canonical and legacy aliases synchronized.
  await update(ref(getDb()), updates)
}

/** Subscribe to all Chan slots in a room. */
export function listenRoomLikes(spaceId, roomId, onChange) {
  if (!spaceId || !roomId) return () => {}
  const roomRef = ref(getDb(), `vc_room_likes/${spaceId}/${roomId}`)
  const handler = (snapshot) => {
    const value = snapshot.val() || {}
    const map = {}
    Object.keys(value).forEach((messageId) => {
      const users = value[messageId]
      if (users && typeof users === 'object') {
        map[messageId] = Object.keys(users).filter((uid) => isLikedValue(users[uid]))
      }
    })
    onChange(map)
  }
  const unsubscribe = onValue(
    roomRef,
    handler,
    (error) => { console.warn('[chan] listen', error) },
  )
  return () => {
    try { unsubscribe() } catch { /* ignore */ }
  }
}

export async function likeMessageKeys(spaceId, roomId, msgIds, userId) {
  const payload = chanPayload(spaceId, roomId, msgIds)
  if (CHAN_DAILY_QUOTA_ENABLED) {
    const result = await getCallable('grantChan')(payload)
    return result.data
  }
  await writeOwnChanSlots(payload, userId, true)
  return {
    success: true,
    status: 'success',
    granted: true,
    mode: 'unlimited-direct',
    messageId: payload.messageId,
    messageIds: payload.messageIds,
  }
}

export async function unlikeMessageKeys(spaceId, roomId, msgIds, userId) {
  const payload = chanPayload(spaceId, roomId, msgIds)
  if (CHAN_DAILY_QUOTA_ENABLED) {
    const result = await getCallable('removeChan')(payload)
    return result.data
  }
  await writeOwnChanSlots(payload, userId, null)
  return {
    success: true,
    status: 'removed',
    removed: true,
    mode: 'unlimited-direct',
    messageId: payload.messageId,
    messageIds: payload.messageIds,
  }
}

export async function likeMessage(spaceId, roomId, msgId, userId) {
  return likeMessageKeys(spaceId, roomId, [msgId], userId)
}

export async function unlikeMessage(spaceId, roomId, msgId, userId) {
  return unlikeMessageKeys(spaceId, roomId, [msgId], userId)
}
