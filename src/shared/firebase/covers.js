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

export async function uploadAnnounceCover(spaceId, roomId, cover) {
  return uploadAnnounceAsset(spaceId, roomId, cover, 'cover')
}

/** Upload announce cover / icon / author avatar (data URL → Storage URL). */
export async function uploadAnnounceAsset(spaceId, roomId, dataUrl, kind = 'asset') {
  if (!spaceId || !roomId || !dataUrl) return null
  if (typeof dataUrl === 'string' && /^https?:\/\//.test(dataUrl)) return dataUrl
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null
  const blob = dataUrlToBlob(dataUrl)
  const safeKind = String(kind || 'asset').replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'asset'
  // Use chat/ path — already allowed by deployed storage.rules (announce-assets may not be).
  const path = `voicecraft/chat/${spaceId}/${roomId}/announce-${safeKind}-${Date.now()}.jpg`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' })
  return getDownloadURL(fileRef)
}

export async function uploadSpaceIcon(spaceId, icon) {
  if (!spaceId || !icon) return null
  if (typeof icon === 'string' && /^https?:\/\//.test(icon)) return icon
  if (typeof icon !== 'string' || !icon.startsWith('data:image/')) return null
  const blob = dataUrlToBlob(icon)
  const path = `voicecraft/avatars/space-${spaceId}.jpg`
  const fileRef = ref(storage, path)
  await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' })
  return getDownloadURL(fileRef)
}

export async function deleteSpaceIcon(spaceId) {
  if (!spaceId) return
  try {
    await deleteObject(ref(storage, `voicecraft/avatars/space-${spaceId}.jpg`))
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
