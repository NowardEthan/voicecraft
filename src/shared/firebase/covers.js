import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from './app'

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(',')
  const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/jpeg'
  const bytes = atob(b64 || '')
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  return new Blob([buf], { type: mime })
}

export async function uploadSpaceCover(spaceId, cover) {
  if (!spaceId || !cover) return null
  if (typeof cover === 'string' && /^https?:\/\//.test(cover)) return cover
  if (typeof cover !== 'string' || !cover.startsWith('data:image/')) return null
  const blob = dataUrlToBlob(cover)
  const path = `voicecraft/covers/${spaceId}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' })
  return getDownloadURL(fileRef)
}

export async function deleteSpaceCover(spaceId) {
  if (!spaceId) return
  try {
    await deleteObject(ref(storage, `voicecraft/covers/${spaceId}`))
  } catch {
    // already gone
  }
}

export async function uploadRoomCover(spaceId, roomId, cover) {
  if (!spaceId || !roomId || !cover) return null
  if (typeof cover === 'string' && /^https?:\/\//.test(cover)) return cover
  if (typeof cover !== 'string' || !cover.startsWith('data:image/')) return null
  const blob = dataUrlToBlob(cover)
  const path = `voicecraft/room-covers/${spaceId}/${roomId}`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' })
  return getDownloadURL(fileRef)
}

export async function deleteRoomCover(spaceId, roomId) {
  if (!spaceId || !roomId) return
  try {
    await deleteObject(ref(storage, `voicecraft/room-covers/${spaceId}/${roomId}`))
  } catch {
    // already gone
  }
}

export function uploadProfileCover(uid, cover) {
  return uploadSpaceCover(`profile-${uid}`, cover)
}

export function deleteProfileCover(uid) {
  return deleteSpaceCover(`profile-${uid}`)
}
