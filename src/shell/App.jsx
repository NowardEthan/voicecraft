/**
 * App — thin auth gate. Heavy signed-in UI lives in AppShell (lazy).
 * After sign-in, BootGate warms the first paint before revealing the shell.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { GoogleAuthBridge, LoginScreen, useAuth } from '../features/auth'
import { BrandLoader } from '../shared/ui/BrandMark'
import { UpdateToast } from '../features/settings'
import { runBootBootstrap, warmBootBrand } from '../shared/media/bootBootstrap'
import { markBootReveal } from '../shared/motion/Appear'
import TitleBar from './TitleBar'
import BootSplash from './BootSplash'
import PerfHud from '../shared/perf/PerfHud'

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
      <div className="flex-1 min-h-0 min-w-0 relative vc-app-bg-decor">
        {children}
        <UpdateToast />
        <PerfHud />
      </div>
    </div>
  )
}

/**
 * Holds BootSplash until critical home assets are warm, then reveals AppShell.
 * Shell mounts under the splash near the end so the fade shows finished UI.
 */
function BootGate({ account }) {
  const [booting, setBooting] = useState(true)
  const [shellReady, setShellReady] = useState(false)
  const [phase, setPhase] = useState('portal')

  useEffect(() => {
    warmBootBrand()
    let cancelled = false
    ;(async () => {
      try {
        await runBootBootstrap((next) => {
          if (!cancelled && next) setPhase(next)
        })
      } catch (err) {
        console.warn('[boot]', err)
      }
      if (cancelled) return
      setPhase('ready')
      setShellReady(true)
      // Let "Tudo pronto" breathe, then crossfade into the shell.
      await new Promise((r) => setTimeout(r, 280))
      if (!cancelled) {
        markBootReveal()
        setBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [account?.uid])

  return (
    <div className="absolute inset-0">
      {shellReady && (
        <Suspense fallback={null}>
          <AppShell account={account} />
        </Suspense>
      )}
      <AnimatePresence>
        {booting && <BootSplash key="boot" phase={phase} />}
      </AnimatePresence>
    </div>
  )
}

function App() {
  const bridge = isGoogleBridge()
  const { ready, user, signedIn } = useAuth()

  useEffect(() => {
    warmBootBrand()
  }, [])

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
      <BootGate account={user} />
    </AppFrame>
  )
}

export default App
