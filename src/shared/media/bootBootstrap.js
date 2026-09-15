/**
 * bootBootstrap — runs in idle AFTER the AppShell paints.
 *
 * Responsibilities:
 *   - Connect signaling & receive first Spaces.
 *   - Hydrate public Spaces.
 *   - Hydrate friend graph + profiles.
 *   - Warm covers/avatars in waves.
 *   - Kick the full icon pack.
 *
 * Never blocks the UI. Designed to fail-open (empty arrays on timeout).
 */
import { auth } from '../firebase/app'
import { getSharedSignaling } from '../connection/useSignaling'
import { resolveSpaceCover } from '../../features/spaces/model/spaceCover'
import { ensureFullSpaceIcons } from '../../features/spaces'
import { warmImages, warmImage, isImageWarm, setImageWarmPerfMode } from './imageWarm'
import { warmImport } from './idlePreload'
import { ensurePublicSpaces } from './usePublicSpacesCache'
import { seedFriendsGraph, seedProfiles } from './profileCache'
import { resolvePerfProfile } from '../perf/perfProfile'

const MAX_MS = 12_000

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

function raceTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    sleep(ms).then(() => fallback),
  ])
}

function waitFirstSpaces(sig, timeoutMs = 4000) {
  if (!sig?.onSpaceChanged) return Promise.resolve([])
  if (Array.isArray(sig._spacesList)) return Promise.resolve(sig._spacesList)
  return new Promise((resolve) => {
    let done = false
    const finish = (spaces) => {
      if (done) return
      done = true
      try { off?.() } catch { /* ignore */ }
      clearTimeout(timer)
      resolve(Array.isArray(spaces) ? spaces : [])
    }
    const off = sig.onSpaceChanged((info) => {
      if (info?.spaces !== undefined) finish(info.spaces)
    })
    const timer = setTimeout(() => finish(sig._spacesList || []), timeoutMs)
  })
}

function waitFriendsHydrated(sig, timeoutMs = 4000) {
  if (!sig?.listenFriendRequests || !sig.userId) {
    return Promise.resolve({ friends: [], incoming: [], outgoing: [] })
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = (payload) => {
      if (settled) return
      settled = true
      try { off?.() } catch { /* ignore */ }
      clearTimeout(timer)
      resolve(payload || { friends: [], incoming: [], outgoing: [] })
    }
    const off = sig.listenFriendRequests((next) => finish(next))
    const timer = setTimeout(
      () => finish({ friends: [], incoming: [], outgoing: [] }),
      timeoutMs,
    )
  })
}

function collectEssentialUrls(spaces, publicSpaces, friendProfiles, urlCap = 40) {
  const urls = []
  const spaceCap = Math.min(24, Math.max(8, Math.floor(urlCap * 0.6)))
  const friendCap = Math.min(16, Math.max(4, urlCap - spaceCap))
  for (const s of [...(spaces || []), ...(publicSpaces || [])].slice(0, spaceCap)) {
    const cover = resolveSpaceCover(s)
    if (cover) urls.push(cover)
    if (typeof s?.icon === 'string' && (s.icon.startsWith('http') || s.icon.startsWith('data:image/'))) {
      urls.push(s.icon)
    }
  }
  for (const p of (friendProfiles || []).slice(0, friendCap)) {
    if (p?.photoURL) urls.push(p.photoURL)
    if (p?.cover) urls.push(p.cover)
  }
  const user = auth.currentUser
  if (user?.photoURL) urls.push(user.photoURL)
  return [...new Set(urls)].slice(0, urlCap)
}

async function warmUntilHot(urls, { budgetMs = 6_000, concurrency = 3 } = {}) {
  const list = (urls || []).filter(Boolean)
  if (!list.length) return { warmed: 0, total: 0 }
  const started = Date.now()
  while (Date.now() - started < budgetMs) {
    const cold = list.filter((u) => !isImageWarm(u))
    if (cold.length === 0) break
    const batch = cold.slice(0, 8)
    await warmImages(batch, { concurrency })
    await yieldToMain()
    if (Date.now() - started > budgetMs) break
  }
  return {
    warmed: list.filter((u) => isImageWarm(u)).length,
    total: list.length,
  }
}

async function hydrateFriendProfiles(sig, graph) {
  if (!sig?.getUserProfile) return []
  const ids = new Set()
  for (const list of [graph?.friends, graph?.incoming, graph?.outgoing]) {
    for (const r of list || []) {
      if (r?.otherUserId) ids.add(r.otherUserId)
    }
  }
  const all = [...ids].slice(0, 16)
  const profiles = []
  for (let i = 0; i < all.length; i += 4) {
    const chunk = all.slice(i, i + 4)
    const part = await Promise.all(chunk.map(async (uid) => {
      try {
        return await sig.getUserProfile(uid, { fresh: true })
      } catch {
        try { return await sig.getUserProfile(uid) } catch { return null }
      }
    }))
    profiles.push(...part.filter(Boolean))
    await yieldToMain()
  }
  return profiles
}

/**
 * Run after the AppShell mounts. Yields constantly so UI stays snappy.
 * No `MIN_MS` — finishes the moment work is done.
 */
export async function runBootBootstrap(onPhase) {
  const report = (phase) => {
    try { onPhase?.(phase) } catch { /* ignore */ }
  }
  const started = Date.now()
  const hardCap = sleep(MAX_MS)

  const work = (async () => {
    let urls = []
    let friendsGraph = { friends: [], incoming: [], outgoing: [] }
    let spaces = []

    let perfMode = 'auto'
    try {
      if (typeof localStorage !== 'undefined') {
        const s = JSON.parse(localStorage.getItem('voicecraft:settings') || '{}')
        if (s?.perfMode) perfMode = s.perfMode
      }
    } catch { /* ignore */ }
    const profile = resolvePerfProfile(perfMode)
    setImageWarmPerfMode(perfMode)
    const { warmConcurrency, bootBudgetMs, bootUrlCap } = profile.budgets

    report('link')
    const sig = getSharedSignaling()
    const spacesP = waitFirstSpaces(sig, 4000)

    try {
      if (sig?.connect) {
        const p = sig.connect()
        if (p && typeof p.then === 'function') {
          await raceTimeout(p, 4000, null)
        }
      }
    } catch { /* fail-open */ }
    await yieldToMain()

    report('realms')
    spaces = await spacesP
    await yieldToMain()

    report('constellations')
    const publicSpaces = await raceTimeout(ensurePublicSpaces(''), 4000, [])
    await yieldToMain()

    report('companions')
    friendsGraph = await waitFriendsHydrated(sig, 4000)
    seedFriendsGraph(friendsGraph)
    const friendProfiles = await hydrateFriendProfiles(sig, friendsGraph)
    seedProfiles(friendProfiles)
    await yieldToMain()

    report('tapestries')
    urls = collectEssentialUrls(spaces, publicSpaces, friendProfiles, bootUrlCap)
    await warmUntilHot(urls, { budgetMs: bootBudgetMs, concurrency: warmConcurrency })
    await yieldToMain()

    report('sigils')
    ensureFullSpaceIcons().catch(() => {})
    await yieldToMain()

    return {
      ok: true,
      spaceCount: (spaces || []).length,
      friendCount: (friendsGraph?.friends || []).length,
      warmed: urls.filter((u) => isImageWarm(u)).length,
      totalUrls: urls.length,
      perfTier: profile.tier,
    }
  })()

  const result = await Promise.race([
    work,
    hardCap.then(() => ({ ok: true, timedOut: true })),
  ])
  report('ready')
  return result
}

export function warmBootBrand() {
  const base = import.meta.env.BASE_URL || '/'
  warmImage(`${base}brand/voice/voice-icon-primary.png`)
  warmImage(`${base}brand/voice/voice-symbol-white.png`)
}

// Copy kept here for legacy callers (BootSplash). Kept the old whimsical phases
// because BootSplash only listens to "ready" in the new fast path.
export const BOOT_PHASE_COPY = {
  portal: 'Acendendo as lanternas…',
  link: 'Entrelaçando o fio com o éter…',
  realms: 'Despertando os seus Spaces…',
  constellations: 'Mapeando constelações públicas…',
  companions: 'Chamando amigos das estrelas…',
  tapestries: 'Polindo capas e tapeçarias…',
  chambers: 'Aquecendo salas de voz e prosa…',
  sigils: 'Gravando sigilos e ícones…',
  doors: 'Abrindo as portas do Voice…',
  ready: 'Tudo pronto. Entre.',
}
