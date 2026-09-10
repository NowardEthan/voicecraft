/**
 * detectGpu — identifies the user's GPU with a cleaned-up display name.
 *
 * Order: Electron Chromium GPU info → WebGL unmasked renderer → WebGPU.
 * WebGPU alone often only exposes vendor ("nvidia") with an empty device,
 * which previously rendered as the useless label "GPU".
 */
export async function detectGpu() {
  const candidates = []

  // 1. Electron — Chromium's real GPU feature info (best on desktop)
  if (typeof window !== 'undefined' && window.electronAPI?.getGpuInfo) {
    try {
      const res = await window.electronAPI.getGpuInfo()
      if (res?.ok && res.info) {
        const parsed = fromElectronGpuInfo(res.info)
        if (parsed) candidates.push(parsed)
      }
    } catch {}
  }

  // 2. WebGL — ANGLE unmasked renderer (usually the full marketing name)
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      let rawVendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '') : ''
      let rawRenderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : ''
      if (!rawVendor) rawVendor = String(gl.getParameter(gl.VENDOR) || '')
      if (!rawRenderer) rawRenderer = String(gl.getParameter(gl.RENDERER) || '')
      if (rawVendor || rawRenderer) {
        candidates.push(ok('webgl', rawVendor, rawRenderer))
      }
    }
  } catch {}

  // 3. WebGPU — structured, but often incomplete on Chromium
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter()
      const info = adapter?.info || (await adapter?.requestAdapterInfo?.())
      if (info) {
        const { vendor, architecture, device, description } = info
        if (vendor || device || description) {
          candidates.push(ok('webgpu', vendor, device || description, description, architecture))
        }
      }
    } catch {}
  }

  const best = candidates.find((c) => isUsefulDevice(c.info?.device)) || candidates[0]
  if (best) {
    if (!isUsefulDevice(best.info.device)) {
      best.info.device = [best.info.vendor, best.info.description]
        .filter((s) => s && isUsefulDevice(s) && s.toLowerCase() !== 'desconhecido')
        .join(' ') || 'GPU detectada'
    }
    return best
  }

  return ok('chromium', '', 'GPU disponível')
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
  // PCI vendor IDs commonly seen in Chromium GPUInfo
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

/**
 * Pull a human-readable GPU name out of ANGLE / WebGL blobs.
 *   "ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU (0x0000028F) Direct3D11 vs_5_0 ps_5_0, D3D11)"
 *   → "NVIDIA GeForce RTX 4050 Laptop GPU"
 */
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

  // "NVIDIA, NVIDIA GeForce …" leftovers
  if (vendor && vendor !== 'desconhecido') {
    const re = new RegExp(`^${escapeRe(vendor)}\\s*,\\s*`, 'i')
    s = s.replace(re, '')
    const re2 = new RegExp(`^${escapeRe(vendor)}\\s+`, 'i')
    // Keep "NVIDIA GeForce …" — only strip duplicated "NVIDIA NVIDIA"
    if (/^(nvidia|amd|intel)\s+\1\b/i.test(`${vendor} ${s}`)) {
      s = s.replace(re2, '')
    }
  }

  return s.trim()
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
