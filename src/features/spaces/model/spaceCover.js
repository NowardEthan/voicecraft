/**
 * Space cover — per-user override of the Space's cover image.
 *
 * Two flavors of cover exist in the app:
 *   1. `space.cover` — server-pushed, shared with everyone. Set via the
 *      initial createSpace / updateSpace payload. Lives in the joined
 *      space object.
 *   2. `spaceCover` (this module) — purely local. Lets each user pick a
 *      different mood for the same Space without overwriting the shared
 *      value. Wins over `space.cover` in the UI when set.
 *
 * Storage: localStorage['voicecraft:spaceCover:<spaceId>'] = dataURL.
 * Incoming files may be any resolution; we downscale to a wallpaper
 * so the theme stays light (~500KB / 1280x720).
 */
const STORAGE_PREFIX = 'voicecraft:spaceCover:'
const MAX_INPUT_BYTES = 50 * 1024 * 1024
const MAX_STORE_BYTES = 500 * 1024
const WALLPAPER_MAX_W = 1280
const WALLPAPER_MAX_H = 720
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** Drop local cover dataURLs that exceed the new soft cap (legacy bloat). */
export function purgeHugeLocalCovers(maxBytes = MAX_STORE_BYTES) {
  if (typeof window === 'undefined') return 0
  let removed = 0
  try {
    const keys = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      const val = window.localStorage.getItem(key)
      if (typeof val === 'string' && val.length > maxBytes) {
        window.localStorage.removeItem(key)
        removed += 1
      }
    }
  } catch { /* ignore */ }
  return removed
}

export function getSpaceCover(spaceId) {
  if (!spaceId || typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + spaceId) || null
  } catch {
    return null
  }
}

export function setSpaceCover(spaceId, dataUrl) {
  if (!spaceId || typeof window === 'undefined') return false
  try {
    if (dataUrl == null) {
      window.localStorage.removeItem(STORAGE_PREFIX + spaceId)
    } else {
      window.localStorage.setItem(STORAGE_PREFIX + spaceId, dataUrl)
    }
    return true
  } catch (err) {
    console.warn('setSpaceCover failed:', err)
    return false
  }
}

export function clearSpaceCover(spaceId) {
  return setSpaceCover(spaceId, null)
}

/**
 * Effective Space wallpaper. Shared server cover wins. A leftover
 * local data-URL is only a fallback for Spaces created before covers
 * were persisted on the signaling server.
 */
export function resolveSpaceCover(space) {
  if (!space) return null
  if (typeof space.cover === 'string' && space.cover.startsWith('data:image/')) return space.cover
  if (typeof space.cover === 'string' && /^https?:\/\//.test(space.cover)) return space.cover
  const local = space.id ? getSpaceCover(space.id) : null
  if (typeof local === 'string' && local.startsWith('data:image/')) return local
  return null
}

/** Focal point (0–100) + zoom for framing the wallpaper in any banner size. */
export const DEFAULT_COVER_FIT = { x: 50, y: 50, zoom: 1 }
export const COVER_ZOOM_MIN = 1
export const COVER_ZOOM_MAX = 2.5

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function asNumber(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function normalizeCoverFit(fit) {
  if (!fit || typeof fit !== 'object') return { ...DEFAULT_COVER_FIT }
  return {
    x: Math.round(clamp(asNumber(fit.x, 50), 0, 100) * 10) / 10,
    y: Math.round(clamp(asNumber(fit.y, 50), 0, 100) * 10) / 10,
    zoom: Math.round(clamp(asNumber(fit.zoom, 1), COVER_ZOOM_MIN, COVER_ZOOM_MAX) * 100) / 100,
  }
}

export function resolveSpaceCoverFit(space) {
  return normalizeCoverFit(space?.coverFit)
}

export function isDefaultCoverFit(fit) {
  const current = normalizeCoverFit(fit)
  return current.x === 50 && current.y === 50 && current.zoom === 1
}

export function coverImageStyle(fit) {
  const { x, y, zoom } = normalizeCoverFit(fit)
  // object-cover + focal point; scale from the same origin so framing
  // stays consistent across containers that share the same aspect-ratio.
  return {
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${x}% ${y}%`,
    willChange: zoom === 1 ? undefined : 'transform',
  }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Nenhum arquivo selecionado'))
    if (!ALLOWED_TYPES.has(file.type)) {
      return reject(new Error('Formato não suportado. Use JPG, PNG, WebP ou GIF.'))
    }
    if (file.size > MAX_INPUT_BYTES) {
      return reject(new Error('Arquivo grande demais para ler. Tente outra imagem.'))
    }
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        resolve(await compressCover(reader.result))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Falha ao ler a imagem'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem'))
    img.src = dataUrl
  })
}

function canvasToJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * Fit any source image into a wallpaper. Dimensions are free on input;
 * we only shrink so the theme stays light enough to persist.
 */
export async function compressCover(dataUrl) {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, WALLPAPER_MAX_W / img.width, WALLPAPER_MAX_H / img.height)
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#0d0e12'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  let quality = 0.82
  let out = canvasToJpeg(canvas, quality)
  while (out.length > MAX_STORE_BYTES && quality > 0.4) {
    quality -= 0.08
    out = canvasToJpeg(canvas, quality)
  }
  if (out.length > MAX_STORE_BYTES) {
    throw new Error('Não deu para compactar esta imagem. Tente outra.')
  }
  return out
}
