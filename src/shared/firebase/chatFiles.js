import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './app'

const SAFE_NAME = /[^\w.\- ()[\]]+/g

export async function uploadChatFile(spaceId, roomId, file) {
  if (!spaceId || !roomId || !file) return null
  const raw = String(file.name || 'arquivo').slice(0, 80)
  const safeName = raw.replace(SAFE_NAME, '_') || 'arquivo'
  const path = `voicecraft/chat/${spaceId}/${roomId}/${Date.now()}-${safeName}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, file, {
    contentType: file.type || 'application/octet-stream',
  })
  return getDownloadURL(fileRef)
}
