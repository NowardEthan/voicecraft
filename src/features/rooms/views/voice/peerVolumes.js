/**
 * Per-participant playback volume (local only).
 * 100 = full relative to master output; 0 = mute that person for you.
 */
const STORAGE_KEY = 'vc:peerVolumes'

export const PEER_VOLUME_DEFAULT = 100
export const PEER_VOLUME_MAX = 100

export function clampPeerVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return PEER_VOLUME_DEFAULT
  return Math.max(0, Math.min(PEER_VOLUME_MAX, Math.round(n)))
}

export function loadPeerVolumes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out = {}
    for (const [id, vol] of Object.entries(parsed)) {
      if (!id) continue
      out[id] = clampPeerVolume(vol)
    }
    return out
  } catch {
    return {}
  }
}

export function savePeerVolumes(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map || {}))
  } catch {}
}

export function peerVolumeMultiplier(map, userId) {
  if (!userId) return 1
  return clampPeerVolume(map?.[userId] ?? PEER_VOLUME_DEFAULT) / 100
}