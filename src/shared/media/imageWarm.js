/**
 * imageWarm — silent decode cache with LRU budget.
 * Goal: by the time UI needs a cover, the bitmap is already in memory
 * so paint is instant (no flick, no reveal animation).
 */
import { resolvePerfProfile } from '../perf/perfProfile'

const cache = new Map() // url -> { status, promise } — insertion order = LRU

function maxEntries() {
  try {
    const mode = typeof window !== 'undefined'
      ? (window.__vcPerfMode || 'auto')
      : 'auto'
    return resolvePerfProfile(mode).budgets.imageWarmMax || 48
  } catch {
    return 48
  }
}

function touch(url) {
  const hit = cache.get(url)
  if (!hit) return
  cache.delete(url)
  cache.set(url, hit)
}

function evictIfNeeded() {
  const max = maxEntries()
  while (cache.size > max) {
    const oldest = cache.keys().next().value
    if (oldest == null) break
    cache.delete(oldest)
  }
}

/** Call when perfMode / tier changes so eviction uses new budget. */
export function setImageWarmPerfMode(mode) {
  if (typeof window !== 'undefined') {
    window.__vcPerfMode = mode || 'auto'
  }
  evictIfNeeded()
}

function isWarmable(url) {
  return typeof url === 'string'
    && url.length > 0
    && (url.startsWith('http') || url.startsWith('data:image/') || url.startsWith('blob:'))
}

export function isImageWarm(url) {
  if (!isWarmable(url)) return false
  const hit = cache.get(url)
  if (hit?.status === 'ready') {
    touch(url)
    return true
  }
  return false
}

export function warmImage(url) {
  if (!isWarmable(url)) return Promise.resolve(false)
  const hit = cache.get(url)
  if (hit?.status === 'ready') {
    touch(url)
    return Promise.resolve(true)
  }
  if (hit?.promise) {
    touch(url)
    return hit.promise
  }

  const entry = { status: 'loading', promise: null }
  const promise = new Promise((resolve) => {
    const img = new Image()
    // Do NOT set crossOrigin — Firebase Storage often lacks CORS for
    // localhost, and anonymous mode makes onload fail even when <img> works.
    const finish = (ok) => {
      entry.status = ok ? 'ready' : 'error'
      resolve(ok)
    }
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(() => finish(true)).catch(() => finish(true))
      } else {
        finish(true)
      }
    }
    img.onerror = () => finish(false)
    img.src = url
  })
  entry.promise = promise
  cache.set(url, entry)
  evictIfNeeded()
  return promise
}

export async function warmImages(urls, { concurrency = 4 } = {}) {
  const list = [...new Set((urls || []).filter(isWarmable))]
  if (!list.length) return []
  const results = []
  let i = 0
  async function worker() {
    while (i < list.length) {
      const idx = i++
      results[idx] = await warmImage(list[idx])
      // Yield so boot / titlebar stay responsive under decode load.
      if (idx % 2 === 1) {
        await new Promise((r) => setTimeout(r, 0))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()))
  return results
}

export function collectCoverUrls(items = []) {
  const out = []
  for (const item of items || []) {
    if (!item) continue
    if (typeof item === 'string') {
      out.push(item)
      continue
    }
    for (const c of [item.cover, item.photo, item.photoURL, item.icon, item.src, item.banner, item.iconImage]) {
      if (isWarmable(c)) out.push(c)
    }
  }
  return [...new Set(out)]
}

/** Covers / banners / attachments from chat messages (announce, lobby, media). */
export function collectMessageMediaUrls(messages = []) {
  const out = []
  const push = (c) => { if (isWarmable(c)) out.push(c) }
  const pushObj = (obj) => {
    if (!obj || typeof obj !== 'object') return
    for (const c of [
      obj.cover, obj.banner, obj.iconImage, obj.authorPhoto,
      obj.memberPhoto, obj.photoURL, obj.photo, obj.src, obj.url,
    ]) push(c)
  }

  for (const m of messages || []) {
    if (!m || m.deleted) continue
    pushObj(m.announce)
    pushObj(m.lobby)
    pushObj(m.lobbyEvent)
    pushObj(m.lobbyEvent?.config)
    pushObj(m.lobby?.config)
    push(m.banner)
    push(m.cover)
    push(m.authorPhoto)
    push(m.photoURL)
    const atts = [
      ...(Array.isArray(m.attachments) ? m.attachments : []),
      ...(m.attachment ? [m.attachment] : []),
    ]
    for (const a of atts) {
      push(a?.url || a?.src || a?.dataUrl || a?.downloadURL)
    }
  }
  return [...new Set(out)]
}

export function imageWarmSize() {
  return cache.size
}
