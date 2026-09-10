/**
 * App — thin auth gate. Heavy signed-in UI lives in AppShell (lazy).
 */
import { lazy, Suspense } from 'react'
import { GoogleAuthBridge, LoginScreen, useAuth } from '../features/auth'
import { BrandLoader } from '../shared/ui/BrandMark'
import { UpdateToast } from '../features/settings'
import TitleBar from './TitleBar'

const AppShell = lazy(() => import('./AppShell'))

function AuthSplash() {
  return (
    <div className="h-full w-full bg-[#07080c]">
      <BrandLoader size={72} fill label="carregando…" />
    </div>
  )
}

function isGoogleBridge() {
  if (typeof window === 'undefined') return false
  const mode = new URLSearchParams(window.location.search).get('vcAuth')
  return mode === 'google' || mode === 'done'
}

function AppFrame({ children }) {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#07080c]">
      <TitleBar />
      <div className="flex-1 min-h-0 min-w-0 relative">
        {children}
        <UpdateToast />
      </div>
    </div>
  )
}

function App() {
  const bridge = isGoogleBridge()
  const { ready, user, signedIn } = useAuth()
  if (bridge) {
    return (
      <AppFrame>
        <GoogleAuthBridge />
      </AppFrame>
    )
  }
  if (!ready) {
    return (
      <AppFrame>
        <AuthSplash />
      </AppFrame>
    )
  }
  if (!signedIn) {
    return (
      <AppFrame>
        <LoginScreen />
      </AppFrame>
    )
  }
  return (
    <AppFrame>
      <Suspense fallback={<AuthSplash />}>
        <AppShell account={user} />
      </Suspense>
    </AppFrame>
  )
}

export default App
