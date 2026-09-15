/**
 * App — thin auth gate. Heavy signed-in UI lives in AppShell (lazy).
 * After sign-in, BootGate warms the first paint before revealing the shell.
 */
import { lazy, Suspense, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { GoogleAuthBridge, LoginScreen, useAuth } from '../features/auth'
import { BrandLoader } from '../shared/ui/BrandMark'
import { UpdateToast } from '../features/settings'
import { runFastBoot, schedulePostShellBootstrap } from '../shared/media/fastBoot'
import { warmBootBrand } from '../shared/media/bootBootstrap'
import { markBootReveal } from '../shared/motion/Appear'
import { readL1Snapshot, clearL1Snapshot } from '../shared/cache/l1Snapshot'
import TitleBar from './TitleBar'
import BootSplash from './BootSplash'
import PerfHud from '../shared/perf/PerfHud'

const AppShell = lazy(() => import('./AppShell'))

function AuthSplash() {
  return (
    <div className="h-full w-full" style={{ backgroundColor: '#071225' }}>
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
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#071225' }}>
      <TitleBar />
      <div className="flex-1 min-h-0 min-w-0 relative vc-app-bg-decor">
        {children}
        <UpdateToast />
        <PerfHud />
      </div>
    </div>
  )
}

function recordVoiceMeasures() {
  try {
    if (typeof performance === 'undefined' || !performance.measure || !performance.getEntriesByName) return
    const hasMark = (name) => performance.getEntriesByName(name, 'mark').length > 0
    if (hasMark('voice:renderer-start') && hasMark('voice:first-shell-paint')) {
      try {
        performance.measure('voice:renderer-to-shell', {
          start: 'voice:renderer-start',
          end: 'voice:first-shell-paint',
        })
      } catch {}
    }
    if (hasMark('voice:process-start') && hasMark('voice:ready')) {
      try {
        performance.measure('voice:process-to-ready', {
          start: 'voice:process-start',
          end: 'voice:ready',
        })
      } catch {}
    }
    if (hasMark('voice:first-shell-paint') && hasMark('voice:ready')) {
      try {
        performance.measure('voice:shell-to-ready', {
          start: 'voice:first-shell-paint',
          end: 'voice:ready',
        })
      } catch {}
    }
  } catch {}
}

/**
 * Bifurcated boot gate (Fase 2):
 *  - With valid L1 snapshot for the current uid → render shell straight away.
 *    runFastBoot() still runs in parallel but does not gate first paint.
 *  - Without snapshot (cold start / first boot) → splash until warm completes.
 */
function BootGate({ account }) {
  const uid = account?.uid || null
  const initialCache = uid ? readL1Snapshot(uid) : null
  const hasCache = !!initialCache && initialCache.uid === uid

  const [booting, setBooting] = useState(!hasCache)
  const [shellReady, setShellReady] = useState(hasCache)
  const [phase, setPhase] = useState(hasCache ? 'ready' : 'warm')

  // Defense-in-depth: clear stale snapshot if uid mismatches.
  useEffect(() => {
    if (uid && initialCache && initialCache.uid !== uid) {
      clearL1Snapshot(initialCache.uid)
    }
  }, [uid])

  useEffect(() => {
    if (hasCache) {
      // Telemetria: shell painted from cache immediately.
      try {
        if (typeof performance !== 'undefined' && performance.mark) {
          performance.mark('voice:first-shell-paint')
          performance.mark('voice:ready')
        }
      } catch {}
      recordVoiceMeasures()
    }

    warmBootBrand()
    let cancelled = false
    let disposePost = () => {}
    ;(async () => {
      try {
        await runFastBoot()
      } catch (err) {
        console.warn('[fastBoot]', err)
      }
      if (cancelled) return
      if (!hasCache) {
        setPhase('ready')
        setShellReady(true)
        try {
          if (typeof performance !== 'undefined' && performance.mark) {
            performance.mark('voice:first-shell-paint')
          }
        } catch {}
      }
      // Schedule the heavy work after the shell paints.
      disposePost = schedulePostShellBootstrap()
      if (!cancelled) {
        markBootReveal()
        try {
          if (typeof performance !== 'undefined' && performance.mark) {
            performance.mark('voice:ready')
          }
        } catch {}
        recordVoiceMeasures()
        setBooting(false)
      }
    })()
    return () => {
      cancelled = true
      disposePost()
    }
  }, [uid, hasCache])

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
