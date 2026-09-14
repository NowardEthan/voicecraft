/**
 * detectGpu — fast label for settings. Never block the UI/main process.
 *
 * Order: cache → WebGL (sync, usually enough) → Electron basic IPC → skip WebGPU.
 */
let cached = null
let inflight = null

function detectWebGlQuick() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { powerPreference: 'high-performance' })
      || canvas.getContext('webgl', { powerPreference: 'high-performance' })
    if (!gl) return null
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    let rawVendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '') : ''
    let rawRenderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : ''
    if (!rawVendor) rawVendor = String(gl.getParameter(gl.VENDOR) || '')
    if (!rawRenderer) rawRenderer = String(gl.getParameter(gl.RENDERER) || '')
    // Drop GL context ASAP
    const lose = gl.getExtension('WEBGL_lose_context')
    lose?.loseContext?.()
    if (!rawVendor && !rawRenderer) return null
    return ok('webgl', rawVendor, rawRenderer)
  } catch {
    return null
  }
}

export async function detectGpu() {
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    const candidates = []

    const webgl = detectWebGlQuick()
    if (webgl) candidates.push(webgl)

    // Electron IPC — timed; never wait forever for 'complete'.
    if (typeof window !== 'undefined' && window.electronAPI?.getGpuInfo) {
      try {
        const res = await Promise.race([
          window.electronAPI.getGpuInfo(),
          new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
        ])
        if (res?.ok && res.info) {
          const parsed = fromElectronGpuInfo(res.info)
          if (parsed) candidates.push(parsed)
        }
      } catch { /* ignore */ }
    }

    const best = candidates.find((c) => isUsefulDevice(c.info?.device)) || candidates[0]
    if (best) {
      if (!isUsefulDevice(best.info.device)) {
        best.info.device = [best.info.vendor, best.info.description]
          .filter((s) => s && isUsefulDevice(s) && s.toLowerCase() !== 'desconhecido')
          .join(' ') || 'GPU detectada'
      }
      cached = best
      return best
    }

    cached = ok('chromium', '', 'GPU disponível')
    return cached
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

function fromElectronGpuInfo(info) {
  const aux = info?.auxAttributes || {}
  const rawRenderer = String(aux.glRenderer || aux.gl_renderer || '')
  const rawVendor = String(aux.glVendor || aux.gl_vendor || '')
  if (rawRenderer || rawVendor) {
    return ok('electron', rawVendor, rawRenderer)
  }

  const devices = Array.isArray(info?.gpuDevice) ? info.gpuDevice : []
  const active = devices.find((d) => d?.active) || devices[0]
  if (!active) return null

  const vendor = vendorIdToName(active.vendorId) || String(active.vendorString || '').trim()
  const device = String(active.deviceString || '').trim()
  if (!vendor && !device) return null
  return ok('electron', vendor, device || vendor)
}

function vendorIdToName(id) {
  const n = Number(id)
  if (!n) return ''
  const map = {
    0x10de: 'NVIDIA',
    0x1002: 'AMD',
    0x8086: 'Intel',
    0x106b: 'Apple',
    0x1414: 'Microsoft',
  }
  return map[n] || ''
}

function isUsefulDevice(name) {
  if (!name || typeof name !== 'string') return false
  const n = name.trim().toLowerCase()
  return !!n
    && n !== 'gpu'
    && n !== 'gpu disponível'
    && n !== 'gpu detectada'
    && n !== 'desconhecido'
    && n !== 'unknown'
}

function ok(source, rawVendor, rawDevice, rawDescription, architecture) {
  const vendor = cleanVendor(rawVendor)
  const device = cleanDevice(rawDevice, vendor)
  return {
    supported: true,
    source,
    info: {
      vendor,
      device: device || (isUsefulDevice(vendor) ? vendor : ''),
      architecture: architecture || '',
      description: rawDescription || '',
    },
    error: null,
  }
}

function cleanVendor(raw) {
  if (!raw) return 'desconhecido'
  const m = String(raw).match(/\(([^)]+)\)/)
  if (m) return m[1].trim()
  return String(raw).trim()
}

function cleanDevice(raw, vendor) {
  if (!raw) return ''
  let s = String(raw).trim()

  const angle = s.match(/^ANGLE\s*\((.+)\)$/i)
  if (angle) {
    const parts = angle[1].split(',').map((p) => p.trim()).filter(Boolean)
    let deviceParts = parts.slice(1)
    if (
      deviceParts.length > 1
      && /^(D3D\d*|OpenGL|Vulkan|Metal|SwiftShader)/i.test(deviceParts[deviceParts.length - 1])
    ) {
      deviceParts = deviceParts.slice(0, -1)
    }
    s = (deviceParts.join(', ') || parts[0] || s).trim()
  }

  s = s
    .replace(/\(\s*0x[0-9a-fA-F]+\s*\)/g, '')
    .replace(/Direct3D[\w.\s]*/gi, '')
    .replace(/\bvs_\d+_\d+\b/gi, '')
    .replace(/\bps_\d+_\d+\b/gi, '')
    .replace(/\bD3D\d*\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,\s]+$/g, '')

  if (vendor && vendor !== 'desconhecido') {
    const re = new RegExp(`^${escapeRe(vendor)}\\s*,\\s*`, 'i')
    s = s.replace(re, '')
    const re2 = new RegExp(`^${escapeRe(vendor)}\\s+`, 'i')
    if (/^(nvidia|amd|intel)\s+\1\b/i.test(`${vendor} ${s}`)) {
      s = s.replace(re2, '')
    }
  }

  return s.trim()
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
