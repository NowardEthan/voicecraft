/**
 * Firebase RTDB helpers for message reactions.
 *
 * Hierarchy:
 *   vc_msg_reactions/
 *     {spaceId}/
 *       {roomId}/
 *         {msgId}/
 *           {emoji}/                # emoji literal (ex: "👍")
 *             {userId}: true        # userId reagiu com esse emoji
 *
 * Design:
 *   - Cada reação é uma chave única (spaceId, roomId, msgId, emoji, userId).
 *   - Toggle = `set(true)` para curtir / `remove()` para descurtir.
 *   - Count por emoji = Object.keys(reacao).length.
 */
import { getDatabase, ref, set, remove, onValue, off } from 'firebase/database'
import { firebaseApp } from './app'

function getDb() {
  return getDatabase(firebaseApp)
}

/** Subscribe a todas as reações da sala. Callback recebe
 *  { [msgId]: { [emoji]: [userId, userId, ...] } }                  */
export function listenRoomReactions(spaceId, roomId, onChange) {
  if (!spaceId || !roomId) return () => {}
  const r = ref(getDb(), `vc_msg_reactions/${spaceId}/${roomId}`)
  const handler = (snap) => {
    const val = snap.val() || {}
    const map = {}
    Object.keys(val).forEach((msgId) => {
      const byEmoji = val[msgId]
      if (!byEmoji || typeof byEmoji !== 'object') return
      const inner = {}
      Object.keys(byEmoji).forEach((emoji) => {
        const likers = byEmoji[emoji]
        if (likers && typeof likers === 'object') {
          inner[emoji] = Object.keys(likers).filter((uid) => likers[uid] === true)
        }
      })
      if (Object.keys(inner).length) map[msgId] = inner
    })
    onChange(map)
  }
  onValue(
    r,
    handler,
    (err) => { console.warn('[reactions] listen', err) },
  )
  return () => {
    try { off(r, 'value', handler) } catch { /* ignore */ }
  }
}

/** Reagir com um emoji — idempotente. */
export async function reactToMessage(spaceId, roomId, msgId, emoji, userId) {
  if (!spaceId || !roomId || !msgId || !emoji || !userId) return
  await set(ref(getDb(), `vc_msg_reactions/${spaceId}/${roomId}/${msgId}/${emoji}/${userId}`), true)
}

/** Remover reação — idempotente. */
export async function unreactToMessage(spaceId, roomId, msgId, emoji, userId) {
  if (!spaceId || !roomId || !msgId || !emoji || !userId) return
  await remove(ref(getDb(), `vc_msg_reactions/${spaceId}/${roomId}/${msgId}/${emoji}/${userId}`))
}
