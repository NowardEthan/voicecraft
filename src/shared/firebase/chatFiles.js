import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from './app'

const SAFE_NAME = /[^\w.\- ()[\]]+/g

const EXT_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
}

function guessContentType(file) {
  if (file?.type) return file.type
  const name = String(file?.name || '')
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : ''
  return EXT_MIME[ext] || 'application/octet-stream'
}

export async function uploadChatFile(spaceId, roomId, file) {
  if (!spaceId || !roomId || !file) return null
  const raw = String(file.name || 'arquivo').slice(0, 80)
  const safeName = raw.replace(SAFE_NAME, '_') || 'arquivo'
  const path = `voicecraft/chat/${spaceId}/${roomId}/${Date.now()}-${safeName}`
  const fileRef = ref(storage, path)
  const contentType = guessContentType(file)
  await uploadBytes(fileRef, file, {
    contentType,
    customMetadata: { uploaderId: auth.currentUser?.uid || '' },
  })
  return getDownloadURL(fileRef)
}
