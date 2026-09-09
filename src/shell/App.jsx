/**
 * App — thin auth gate. Heavy signed-in UI lives in AppShell (lazy).
 */
import { lazy, Suspense } from 'react'
import { GoogleAuthBridge, LoginScreen, useAuth } from '../features/auth'

const AppShell = lazy(() => import('./AppShell'))

function AuthSplash() {
  return (
    <div className="h-screen w-screen bg-[#07080c] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-accent animate-spin" />
        <span className="text-[12px] text-muted">carregando…</span>
      </div>
    </div>
  )
}

function isGoogleBridge() {
  if (typeof window === 'undefined') return false
  const mode = new URLSearchParams(window.location.search).get('vcAuth')
  return mode === 'google' || mode === 'done'
}

function App() {
  const bridge = isGoogleBridge()
  const { ready, user, signedIn } = useAuth()
  if (bridge) return <GoogleAuthBridge />
  if (!ready) return <AuthSplash />
  if (!signedIn) return <LoginScreen />
  return (
    <Suspense fallback={<AuthSplash />}>
      <AppShell account={user} />
    </Suspense>
  )
}

export default App
