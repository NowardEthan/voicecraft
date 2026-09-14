/**
 * Prefetch + short-lived cache for LiveKit join tokens.
 * Hover / imminent join can mint the token before getUserMedia finishes.
 */
const cache = new Map() // key -> { promise, at, token, url }
const TTL_MS = 45_000

function cacheKey({ spaceId, roomId, identity }) {
  return `${spaceId || ''}:${roomId || ''}:${identity || ''}`
}

async function fetchToken(payload) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.livekit : null
  if (!api?.getToken) {
    throw new Error('LiveKit só está disponível no app Electron.')
  }
  const res = await api.getToken(payload)
  if (!res?.ok) throw new Error(res?.error || 'Falha ao obter token LiveKit')
  return res
}

export function prefetchLiveKitToken(payload) {
  if (!payload?.roomId || !payload?.identity) return Promise.resolve(null)
  const key = cacheKey(payload)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise

  const promise = fetchToken(payload)
    .then((res) => {
      cache.set(key, { promise, at: Date.now(), token: res.token, url: res.url })
      return res
    })
    .catch((err) => {
      cache.delete(key)
      throw err
    })
  cache.set(key, { promise, at: Date.now() })
  return promise
}

export function getLiveKitToken(payload) {
  return prefetchLiveKitToken(payload)
}

export function warmLiveKitClient() {
  return import('livekit-client').catch(() => null)
}
