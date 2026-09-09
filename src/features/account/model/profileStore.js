import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { updateProfile } from 'firebase/auth'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { deleteProfileCover, uploadProfileCover } from '../../../shared/firebase/covers'
import { auth, db, storage, VC } from '../../../shared/firebase/app'
import { appendActivity, normalizeProfile, profilePayload } from './profile'

function userRef(uid) {
  return doc(db, VC.users, uid)
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(',')
  const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/jpeg'
  const bytes = atob(b64 || '')
  const buf = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i)
  return new Blob([buf], { type: mime })
}

export async function loadProfile(uid, authUser) {
  if (!uid) return normalizeProfile('', {}, authUser)
  const snap = await getDoc(userRef(uid))
  return normalizeProfile(uid, snap.exists() ? snap.data() : {}, authUser)
}

export async function saveProfile(uid, profile, { activity } = {}) {
  if (!uid) throw new Error('Sem usuário.')
  const payload = profilePayload(profile)
  if (activity) payload.activity = appendActivity(payload.activity, activity)
  const snap = await getDoc(userRef(uid))
  const createdAt = Number(snap.data()?.createdAt) || payload.createdAt || Date.now()
  payload.createdAt = createdAt
  await setDoc(userRef(uid), {
    ...payload,
    cover: payload.cover || null,
    email: auth.currentUser?.email || payload.email || null,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  if (auth.currentUser) {
    try {
      await updateProfile(auth.currentUser, {
        displayName: payload.displayName,
        photoURL: payload.photoURL || null,
      })
    } catch { /* optional */ }
  }
  return normalizeProfile(uid, payload, auth.currentUser)
}

export async function uploadAvatar(uid, dataUrl) {
  if (!uid || !dataUrl?.startsWith('data:image/')) return null
  const blob = dataUrlToBlob(dataUrl)
  const fileRef = ref(storage, `voicecraft/avatars/${uid}`)
  await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' })
  return getDownloadURL(fileRef)
}

export async function persistProfileCover(uid, cover, coverFit) {
  if (!uid) return { cover: '', coverFit: null }
  if (!cover) {
    await deleteProfileCover(uid)
    return { cover: '', coverFit: null }
  }
  const url = await uploadProfileCover(uid, cover)
  return { cover: url || '', coverFit }
}
