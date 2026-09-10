/**
 * Runs in the system browser (opened by Electron).
 * Completes Google in this tab once, then posts the id token back to the app.
 * Never uses signInWithRedirect — that was bouncing back into a loop.
 */
import { useEffect, useState } from 'react'
import { getRedirectResult, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '../../../shared/firebase/app'
import { BrandAppIcon, BrandLoader } from '../../../shared/ui/BrandMark'
import { Check } from 'lucide-react'

const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

const DONE_KEY = 'vcAuthDone'
const CB_KEY = 'vcAuthCb'

let started = false

function callbackUrl() {
  const params = new URLSearchParams(window.location.search)
  const cb = params.get('cb') || sessionStorage.getItem(CB_KEY) || ''
  if (cb) sessionStorage.setItem(CB_KEY, cb)
  return cb
}

async function postResult(cb, payload) {
  if (!cb) return
  try {
    await fetch(cb, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    const q = new URL(cb)
    if (payload.idToken) q.searchParams.set('idToken', payload.idToken)
    if (payload.error) q.searchParams.set('error', payload.error)
    if (payload.code) q.searchParams.set('code', payload.code)
    window.location.replace(q.toString())
  }
}

function markDone() {
  sessionStorage.setItem(DONE_KEY, '1')
  sessionStorage.removeItem(CB_KEY)
  const next = new URL(window.location.href)
  next.searchParams.set('vcAuth', 'done')
  next.searchParams.delete('cb')
  window.history.replaceState({}, '', next)
}

export default function GoogleAuthBridge() {
  const params = new URLSearchParams(window.location.search)
  const alreadyDone = params.get('vcAuth') === 'done' || sessionStorage.getItem(DONE_KEY) === '1'
  const [state, setState] = useState(alreadyDone ? 'done' : 'working')
  const [detail, setDetail] = useState(alreadyDone ? 'Pode fechar esta aba e voltar ao VoiceCraft.' : 'Abrindo o Google…')

  const complete = async (userCred) => {
    const cred = GoogleAuthProvider.credentialFromResult(userCred)
    const idToken = cred?.idToken
    if (!idToken) throw new Error('O Google não devolveu o token.')
    setDetail('Enviando para o VoiceCraft…')
    await postResult(callbackUrl(), { idToken })
    markDone()
    setState('done')
    setDetail('Pode fechar esta aba e voltar ao VoiceCraft.')
  }

  const startGoogle = async () => {
    setState('working')
    setDetail('Abra a janela do Google para entrar.')
    try {
      const leftover = await getRedirectResult(auth)
      if (leftover?.user) {
        await complete(leftover)
        return
      }
      const result = await signInWithPopup(auth, googleProvider)
      await complete(result)
    } catch (err) {
      if (err?.code === 'auth/popup-blocked') {
        setState('ready')
        setDetail('O navegador bloqueou a janela. Clique no botão para continuar.')
        return
      }
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        setState('ready')
        setDetail('Janela fechada. Clique para tentar de novo.')
        return
      }
      const message = err?.message || 'Não foi possível entrar com o Google.'
      await postResult(callbackUrl(), { error: message, code: err?.code || '' })
      setState('error')
      setDetail(message)
    }
  }

  useEffect(() => {
    if (alreadyDone || started) return
    started = true
    startGoogle()
  }, [alreadyDone])

  return (
    <div className="h-full w-full bg-[#07080c] text-strong flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-[24px] border border-white/[0.08] bg-[#14161c]/90 px-6 py-8 text-center">
        {state === 'working' ? (
          <BrandLoader size={56} showLabel={false} className="mb-4" />
        ) : (
          <div className="relative mx-auto mb-4 w-14 h-14">
            <BrandAppIcon size={56} decorative className="drop-shadow-[0_0_16px_var(--space-accent-glow-24)]" />
            {state === 'done' && (
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-accent text-on-accent flex items-center justify-center ring-2 ring-[#14161c]">
                <Check size={14} strokeWidth={2.5} />
              </span>
            )}
          </div>
        )}
        <h1 className="text-[18px] font-semibold tracking-tight">
          {state === 'done' ? 'Conta conectada' : state === 'error' ? 'Algo deu errado' : 'Entrar com Google'}
        </h1>
        <p className="text-[13px] text-muted mt-2 leading-relaxed">{detail}</p>
        {(state === 'ready' || state === 'error') && (
          <button
            type="button"
            onClick={startGoogle}
            className="mt-5 h-11 px-5 rounded-full bg-accent text-on-accent text-[13.5px] font-semibold"
          >
            Continuar com Google
          </button>
        )}
      </div>
    </div>
  )
}
