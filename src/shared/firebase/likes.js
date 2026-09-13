/**
 * Firebase RTDB helpers for message likes ("super like").
 *
 * Hierarchy:
 *   vc_room_likes/
 *     {spaceId}/
 *       {roomId}/
 *         {msgId}/
 *           {userId}: true
 *
 * Design notes:
 *   - Like é binário (true = curtiu). Unset = não curtiu.
 *   - Cada curtida é unicamente endereçada por (spaceId, roomId, msgId,
 *     userId), então o escopo é "por mensagem" independente da sala
 *     atual.
 *   - Rules: somente o próprio user pode escrever no próprio slot,
 *     qualquer autenticado pode ler (definido em database.rules.json).
 */
import { getDatabase, ref, set, remove, onValue } from 'firebase/database'
import { firebaseApp } from './app'

function getDb() {
  return getDatabase(firebaseApp)
}

function isLikedValue(v) {
  return v === true || v === 1 || v === 'true'
}

/** Subscribe a todos os likes de uma sala. O callback recebe
 *  { [msgId]: [userId, userId, ...] } — estrutura achatada pra
 *  facilitar o merge com `msg.likes` local.
 *
 *  Retorna função de cleanup.                                          */
export function listenRoomLikes(spaceId, roomId, onChange) {
  if (!spaceId || !roomId) return () => {}
  const r = ref(getDb(), `vc_room_likes/${spaceId}/${roomId}`)
  const handler = (snap) => {
    const val = snap.val() || {}
    const map = {}
    Object.keys(val).forEach((msgId) => {
      const likers = val[msgId]
      if (likers && typeof likers === 'object') {
        map[msgId] = Object.keys(likers).filter((uid) => isLikedValue(likers[uid]))
      }
    })
    onChange(map)
  }
  const unsub = onValue(
    r,
    handler,
    (err) => { console.warn('[likes] listen', err) },
  )
  return () => {
    try { unsub() } catch { /* ignore */ }
  }
}

/** Curtir — idempotente (true sobrescreve true). */
export async function likeMessage(spaceId, roomId, msgId, userId) {
  if (!spaceId || !roomId || !msgId || !userId) return
  await set(ref(getDb(), `vc_room_likes/${spaceId}/${roomId}/${msgId}/${userId}`), true)
}

/** Descurtir — idempotente (remove() em chave inexistente é no-op). */
export async function unlikeMessage(spaceId, roomId, msgId, userId) {
  if (!spaceId || !roomId || !msgId || !userId) return
  await remove(ref(getDb(), `vc_room_likes/${spaceId}/${roomId}/${msgId}/${userId}`))
}

/**
 * Persist like under every known message id (client id + firestore doc id).
 * Prevents Electron/browser divergence when ids differ.
 */
export async function likeMessageKeys(spaceId, roomId, msgIds, userId) {
  const ids = [...new Set((msgIds || []).filter(Boolean))]
  await Promise.all(ids.map((id) => likeMessage(spaceId, roomId, id, userId)))
}

export async function unlikeMessageKeys(spaceId, roomId, msgIds, userId) {
  const ids = [...new Set((msgIds || []).filter(Boolean))]
  await Promise.all(ids.map((id) => unlikeMessage(spaceId, roomId, id, userId)))
}
