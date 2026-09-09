/**
 * detectGpu — identifies the user's GPU, then returns a *cleaned-up* name.
 *
 * Strategy: WebGPU first (structured), WebGL fallback (always works), generic
 * last resort. The first one with real info wins.
 *
 * After getting the raw vendor/renderer strings, we run them through
 * `cleanGpuName` which strips the noisy parts:
 *   - ANGLE wrapper info ("ANGLE (NVIDIA, ...)" → just "...", "NVIDIA GeForce RTX 4050 ...")
 *   - Device IDs ("(0x0000028F)")
 *   - Driver versions ("Direct3D11 vs_5_0 ps_5_0")
 *   - macOS Metal suffix
 *
 * Returns: { supported, source, info: { vendor, device, architecture, description }, error }
 */
export async function detectGpu() {
  // 1. WebGPU
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter()
      if (adapter && adapter.info) {
        const { vendor, architecture, device, description } = adapter.info
        if (vendor || device || description) {
          return ok('webgpu', vendor, device, description, architecture)
        }
      }
    } catch {}
  }

  // 2. WebGL — always available
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
        return ok('webgl', rawVendor, rawRenderer)
      }
    }
  } catch {}

  // 3. Generic — Chromium always has some GPU available
  return ok('chromium', '', 'GPU disponível')

  function ok(source, rawVendor, rawDevice, rawDescription, architecture) {
    const vendor = cleanVendor(rawVendor)
    const device = cleanDevice(rawDevice, vendor)
    return {
      supported: true,
      source,
      info: {
        vendor,
        device,
        architecture: architecture || '',
        description: rawDescription || '',
      },
      error: null,
    }
  }
}

// Strip the WebGL ANGLE wrapper noise: "Google Inc. (NVIDIA)" → "NVIDIA"
function cleanVendor(raw) {
  if (!raw) return 'desconhecido'
  const m = raw.match(/\(([^)]+)\)/)
  if (m) return m[1]   // vendor inside parens is more useful
  return raw
}

// Pull the human-readable GPU name out of the ANGLE blob.
//   "ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU (0x0000028F) Direct3D11 vs_5_0 ps_5_0, D3D11)"
//   "Apple M1 Pro"                                                          ← macOS Metal
//   "Intel(R) UHD Graphics 620 (0x5912)"                                   ← generic
function cleanDevice(raw, vendor) {
  if (!raw) return vendor === 'desconhecido' ? 'desconhecido' : 'GPU'

  // ANGLE wrapper: "ANGLE (<renderer-name> (0x...) <backend> ...)"
  let m = raw.match(/ANGLE\s*\((.*?)\s*\(/i)
  if (m) {
    const inside = m[1]
    // Drop the leading vendor segment if it duplicates (e.g. "NVIDIA, NVIDIA GeForce...")
    const parts = inside.split(',').map(s => s.trim())
    return parts.length > 1 ? parts.slice(1).join(', ').trim() : parts[0]
  }

  // Generic: "Vendor(R) GPU Model (0xID)"
  m = raw.match(/\([^)]*\)\s*\([^)]*\)/)
  if (m) return raw.replace(m[0], '').trim()

  // Apple Silicon style: "Apple M1 Pro" — already clean
  return raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim().replace(/\s+/g, ' ')
}
