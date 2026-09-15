/**
 * fastBoot — minimal first-paint gate.
 *
 * Goal: reveal the AppShell as quickly as possible. We only:
 *  1. Pre-warm the AppShell chunk.
 *  2. Pre-warm the critical route chunks (home / explore / voice / text / people).
 *  3. Warm the brand assets (icon, logo).
 *  4. Resolve the perf profile.
 *
 * No network (signaling), no Spaces hydration, no friends, no image decoding.
 * That work moves to postShellBootstrap, which runs AFTER the shell mounts.
 *
 * Targets:
 *  - Floor: ~150ms (already cached).
 *  - Typical: ~300-600ms (cold cache).
 *  - Hard cap: 4s — anything past that is a bug.
 */
import { APP_CHUNKS } from './useAppWarmup'
import { warmImage } from './imageWarm'
import { runWhenIdle } from './idlePreload'
import { resolvePerfProfile } from '../perf/perfProfile'

const MAX_MS = 4_000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0))
    } else {
      setTimeout(resolve, 0)
    }
  })
}

async function resolvePerfMode() {
  try {
    if (typeof window !== 'undefined' && window.electronAPI?.getSettings) {
      const raw = await window.electronAPI.getSettings()
      if (raw?.perfMode) return raw.perfMode
    }
  } catch { /* fall through */ }
  try {
    if (typeof localStorage !== 'undefined') {
      const s = JSON.parse(localStorage.getItem('voicecraft:settings') || '{}')
      if (s?.perfMode) return s.perfMode
    }
  } catch { /* ignore */ }
  return 'auto'
}

export async function runFastBoot() {
  const started = Date.now()
  const base = import.meta.env.BASE_URL || '/'

  // Brand assets — fire and forget, never block.
  warmImage(`${base}brand/voice/voice-icon-primary.png`)
  warmImage(`${base}brand/voice/voice-symbol-white.png`)
  warmImage(`${base}logo.png`)

  // Perf profile — cheap, but await so callers can use it.
  const perfMode = await resolvePerfMode()
  const profile = resolvePerfProfile(perfMode)

  // Pre-warm the shell + critical routes in parallel.
  const criticalChunks = [
    () => import('../../shell/AppShell'),
    APP_CHUNKS.homeExplore,
    APP_CHUNKS.voice,
    APP_CHUNKS.text,
    APP_CHUNKS.people,
  ].filter(Boolean)

  const chunkPromises = criticalChunks.map((fn) =>
    Promise.resolve()
      .then(() => fn())
      .catch(() => null)
  )

  // Race against the hard cap.
  const hardCap = sleep(MAX_MS)

  await Promise.race([Promise.all(chunkPromises), hardCap])
  await yieldToMain()

  const elapsed = Date.now() - started
  return {
    ok: true,
    elapsedMs: elapsed,
    perfMode,
    perfTier: profile.tier,
  }
}

/**
 * postShellBootstrap — kicks off heavier work AFTER the shell has painted.
 * Uses idle callbacks so it never blocks user interaction.
 */
export function schedulePostShellBootstrap() {
  if (typeof window === 'undefined') return () => {}

  return runWhenIdle(() => {
    // Lazy-import to avoid pulling these into the boot chunk.
    import('./bootBootstrap').then(({ runBootBootstrap }) => {
      runBootBootstrap().catch(() => { /* fail-open */ })
    }).catch(() => { /* ignore */ })
  }, { timeout: 1500 })
}
