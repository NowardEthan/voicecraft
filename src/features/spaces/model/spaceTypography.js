/**
 * Space typography — built-in stacks + custom uploaded fonts.
 */
export const BUILTIN_FONTS = [
  {
    id: 'default',
    label: 'Padrão',
    family: 'Inter, ui-sans-serif, system-ui, sans-serif',
    builtin: true,
  },
  {
    id: 'serif',
    label: 'Serif',
    family: 'Georgia, "Times New Roman", Times, serif',
    builtin: true,
  },
  {
    id: 'mono',
    label: 'Mono',
    family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    builtin: true,
  },
  {
    id: 'script',
    label: 'Script',
    family: '"Segoe Script", "Apple Chancery", "Comic Sans MS", cursive',
    builtin: true,
  },
  {
    id: 'display',
    label: 'Display',
    family: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
    builtin: true,
  },
]

export const TYPO_FIELDS = ['name', 'description', 'slogan']

const DEFAULT_TYPOGRAPHY = {
  name: { fontId: 'default' },
  description: { fontId: 'default' },
  slogan: { fontId: 'script' },
}

export function normalizeTypography(raw) {
  const out = { ...DEFAULT_TYPOGRAPHY }
  if (!raw || typeof raw !== 'object') return out
  for (const field of TYPO_FIELDS) {
    const id = raw[field]?.fontId
    if (typeof id === 'string' && id.trim()) {
      out[field] = { fontId: id.trim().slice(0, 64) }
    }
  }
  return out
}

export function normalizeSpaceFonts(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = String(item.id || '').slice(0, 64)
    const url = String(item.url || '')
    const family = String(item.family || item.label || 'Custom').slice(0, 64)
    if (!id || !url || seen.has(id)) continue
    if (!/^https?:\/\//.test(url)) continue
    seen.add(id)
    out.push({
      id,
      family,
      label: String(item.label || family).slice(0, 40),
      url,
      path: typeof item.path === 'string' ? item.path.slice(0, 200) : null,
      format: String(item.format || guessFormat(url)).slice(0, 16),
      createdAt: item.createdAt || null,
      createdBy: item.createdBy || null,
    })
  }
  return out
}

function guessFormat(url) {
  const lower = String(url).toLowerCase()
  if (lower.includes('.woff2')) return 'woff2'
  if (lower.includes('.woff')) return 'woff'
  if (lower.includes('.otf')) return 'opentype'
  if (lower.includes('.ttf')) return 'truetype'
  return 'truetype'
}

export function fontCatalog(customFonts = []) {
  const custom = normalizeSpaceFonts(customFonts).map((f) => ({
    id: f.id,
    label: f.label || f.family,
    family: `"${f.family.replace(/"/g, '')}", sans-serif`,
    builtin: false,
    url: f.url,
    format: f.format,
  }))
  return [...BUILTIN_FONTS, ...custom]
}

export function resolveFontFamily(fontId, customFonts = []) {
  const catalog = fontCatalog(customFonts)
  const hit = catalog.find((f) => f.id === fontId)
  return hit?.family || BUILTIN_FONTS[0].family
}

export function fieldFontStyle(space, field) {
  const typography = normalizeTypography(space?.typography)
  const fonts = normalizeSpaceFonts(space?.fonts)
  const fontId = typography[field]?.fontId || 'default'
  return { fontFamily: resolveFontFamily(fontId, fonts) }
}

/** Inject @font-face for custom Space fonts (idempotent per id). */
export function ensureSpaceFontFaces(fonts = []) {
  if (typeof document === 'undefined') return
  const list = normalizeSpaceFonts(fonts)
  for (const font of list) {
    const styleId = `vc-font-${font.id}`
    if (document.getElementById(styleId)) continue
    const format = font.format === 'woff2' ? 'woff2'
      : font.format === 'woff' ? 'woff'
        : font.format === 'opentype' ? 'opentype'
          : 'truetype'
    const el = document.createElement('style')
    el.id = styleId
    el.textContent = `
@font-face {
  font-family: "${font.family.replace(/"/g, '')}";
  src: url("${font.url}") format("${format}");
  font-display: swap;
}`
    document.head.appendChild(el)
  }
}

export { DEFAULT_TYPOGRAPHY }
