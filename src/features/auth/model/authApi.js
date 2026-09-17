/**
 * Voice account — Google + e-mail/senha on the Luna Firebase project.
 */
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../../../shared/firebase/app'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

export function isSignedIn(user) {
  return !!user && !user.isAnonymous
}

export function authErrorMessage(err) {
  const code = err?.code || ''
  switch (code) {
    case 'auth/invalid-email':
      return 'Digite um e-mail válido.'
    case 'auth/missing-password':
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.'
    case 'auth/email-already-in-use':
      return 'Este e-mail já tem uma conta. Entre ou recupere a senha.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Espere um pouco e tente de novo.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login cancelado.'
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.'
    case 'auth/timeout':
      return 'O login no navegador expirou. Tente de novo.'
    case 'auth/operation-not-allowed':
      return 'Este método de entrada ainda não está ativo no Firebase.'
    case 'auth/unauthorized-domain':
      return 'Este domínio não está autorizado no Firebase Auth.'
    case 'auth/network-request-failed':
      return 'Sem conexão. Confira a internet e tente de novo.'
    default:
      return err?.message || 'Não foi possível entrar. Tente de novo.'
  }
}

async function applyPersistence(keepSignedIn) {
  await setPersistence(
    auth,
    keepSignedIn ? browserLocalPersistence : browserSessionPersistence,
  )
}

function nameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'você'
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40)
}

export async function signInWithEmail({ email, password, keepSignedIn = true }) {
  await applyPersistence(keepSignedIn)
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
  return cred.user
}

export async function createAccountWithEmail({ email, password, keepSignedIn = true }) {
  await applyPersistence(keepSignedIn)
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
  const displayName = nameFromEmail(email)
  try { await updateProfile(cred.user, { displayName }) } catch { /* optional */ }
  return cred.user
}

function hasSystemBrowserAuth() {
  return typeof window !== 'undefined' && typeof window.electronAPI?.startGoogleAuth === 'function'
}

async function signInWithGoogleViaSystemBrowser() {
  await window.electronAPI.startGoogleAuth()
  return new Promise((resolve, reject) => {
    let settled = false
    let off = () => {}
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      off()
      window.electronAPI.cancelGoogleAuth?.()
      fn(value)
    }
    off = window.electronAPI.onGoogleAuthResult((payload) => {
      if (payload?.error) {
        finish(reject, Object.assign(new Error(payload.error), { code: payload.code || 'auth/internal-error' }))
        return
      }
      if (!payload?.idToken) {
        finish(reject, Object.assign(new Error('Login cancelado.'), { code: 'auth/popup-closed-by-user' }))
        return
      }
      signInWithCredential(auth, GoogleAuthProvider.credential(payload.idToken))
        .then((cred) => finish(resolve, cred.user))
        .catch((err) => finish(reject, err))
    })
    const timer = setTimeout(() => {
      finish(reject, Object.assign(new Error('O login no navegador expirou.'), { code: 'auth/timeout' }))
    }, 3 * 60 * 1000)
  })
}

export async function signInWithGoogle({ keepSignedIn = true } = {}) {
  await applyPersistence(keepSignedIn)
  if (hasSystemBrowserAuth()) {
    return signInWithGoogleViaSystemBrowser()
  }
  const cred = await signInWithPopup(auth, googleProvider)
  return cred.user
}

export function usesSystemBrowserGoogle() {
  return hasSystemBrowserAuth()
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim())
}

export async function signOutAccount() {
  await signOut(auth)
}
