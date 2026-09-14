/**
 * hardwareProbe — lightweight capability snapshot for perf profiling.
 * Safe to call often; GPU label is cached via detectGpu.
 */
import { detectGpu } from '../../utils/gpu'

let cachedProbe = null
let probeInflight = null

function readDeviceMemoryGb() {
  if (typeof navigator === 'undefined') return null
  const n = Number(navigator.deviceMemory)
  return Number.isFinite(n) && n > 0 ? n : null
}

function readCores() {
  if (typeof navigator === 'undefined') return 4
  const n = Number(navigator.hardwareConcurrency)
  return Number.isFinite(n) && n > 0 ? n : 4
}

/**
 * Sync-ish tip without waiting on GPU IPC. Used for early boot budgets.
 */
export function peekHardwareHint() {
  const cores = readCores()
  const ramGb = readDeviceMemoryGb()
  let score = 0
  if (cores >= 12) score += 2
  else if (cores >= 8) score += 1
  if (ramGb != null) {
    if (ramGb >= 16) score += 2
    else if (ramGb >= 8) score += 1
  } else {
    score += 1 // unknown — assume mid
  }
  const tier = score >= 3 ? 'high' : score >= 2 ? 'mid' : 'low'
  return { cores, ramGb, tierHint: tier, score }
}

export async function probeHardware({ force = false } = {}) {
  if (cachedProbe && !force) return cachedProbe
  if (probeInflight && !force) return probeInflight

  probeInflight = (async () => {
    const cores = readCores()
    const ramGb = readDeviceMemoryGb()
    let gpu = null
    try {
      gpu = await detectGpu()
    } catch {
      gpu = null
    }

    let gpuFeatureStatus = null
    let processMemory = null
    if (typeof window !== 'undefined' && window.electronAPI?.getPerfSnapshot) {
      try {
        const snap = await window.electronAPI.getPerfSnapshot()
        if (snap?.ok) {
          gpuFeatureStatus = snap.gpuFeatureStatus || null
          processMemory = snap.memory || null
        }
      } catch { /* ignore */ }
    }

    const deviceLabel = gpu?.info?.device || ''
    const vendorLabel = gpu?.info?.vendor || ''
    const blob = `${deviceLabel} ${vendorLabel}`.toLowerCase()
    const dedicatedGpu = /geforce|rtx|radeon|nvidia|quadro|arc\s|rx\s\d/.test(blob)
      && !/microsoft basic|swiftshader|llvmpipe|software/.test(blob)

    let score = 0
    if (cores >= 12) score += 2
    else if (cores >= 8) score += 1
    if (ramGb != null) {
      if (ramGb >= 16) score += 2
      else if (ramGb >= 8) score += 1
    } else score += 1
    if (dedicatedGpu) score += 2
    else if (deviceLabel && deviceLabel !== 'GPU disponível') score += 1

    const autoTier = score >= 4 ? 'high' : score >= 2 ? 'mid' : 'low'

    cachedProbe = {
      cores,
      ramGb,
      dedicatedGpu,
      gpu,
      gpuFeatureStatus,
      processMemory,
      autoTier,
      probedAt: Date.now(),
    }
    return cachedProbe
  })()

  try {
    return await probeInflight
  } finally {
    probeInflight = null
  }
}

export function getCachedHardwareProbe() {
  return cachedProbe
}
