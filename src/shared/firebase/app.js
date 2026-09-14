/**
 * Firebase app for VoiceCraft.
 * Uses the Luna project (luna-8787d) — collections are prefixed `vc_`
 * so they never collide with Luna documents.
 */
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBEXXPAwMmGJyc6Ng-NJbDqvzqwOgsdUlM',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'luna-8787d.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'luna-8787d',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'luna-8787d.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1068126871324',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1068126871324:web:78027c48452ccb193564d9',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-XB6GPENYZL',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
    || 'https://luna-8787d-default-rtdb.firebaseio.com',
}

const app = getApps()[0] || initializeApp(firebaseConfig)

export const firebaseApp = app
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

export const VC = {
  users: 'vc_users',
  spaces: 'vc_spaces',
  userTags: 'vc_user_tags',
  config: 'vc_config',
  friendRequests: 'vc_friend_requests',
}
