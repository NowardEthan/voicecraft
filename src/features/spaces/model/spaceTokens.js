import { resolveSpaceCover, resolveSpaceCoverFit } from './spaceCover'

/**
 * Time-based greeting for the Space overview. Kept simple and in Portuguese.
 */
export function greetingFor(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/**
 * Stable color from a string id. Used for member avatars.
 * Tinted toward the cool/grey end of the wheel so they don't fight the
 * Space's accent (which can be any hue). DESIGNS_SYSTEM §1.3 principle 4
 * — personalization contained — the accent colors the action, not people.
 */
export function colorFromId(id) {
  if (!id) return 'hsl(220, 14%, 52%)'
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  // Use a desaturated, mid-luminance hue. People get presence, not drama.
  return `hsl(${h % 360}, 22%, 48%)`
}

/**
 * Convert a hex color to rgba with the given alpha (0–1). Falls back to a
 * safe neutral (the default spec accent) if input is malformed.
 */
export function hexToRgba(hex, alpha = 1) {
  const rgb = parseHex(hex)
  if (!rgb) return `rgba(255, 63, 108, ${alpha})`
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

export function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function relativeLuminance(hex) {
  const c = parseHex(hex)
  if (!c) return 0.2
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

/** Text/icon color that stays readable on top of an identity fill. */
export function onColorHex(hex) {
  return relativeLuminance(hex) > 0.36 ? '#1a1a1e' : '#ffffff'
}

/** Fill + readable ink, plus a hairline when the fill would vanish on the dark chrome. */
export function identitySurfaceStyle(hex) {
  const fill = parseHex(hex) ? hex : '#ff3f6c'
  const L = relativeLuminance(fill)
  const ring = L < 0.1
    ? 'inset 0 0 0 1px rgba(255,255,255,0.28)'
    : L > 0.78
      ? 'inset 0 0 0 1px rgba(26,26,30,0.2)'
      : undefined
  return {
    backgroundColor: fill,
    color: onColorHex(fill),
    boxShadow: ring,
  }
}

function hexToHsl(hex) {
  const c = parseHex(hex) || { r: 255, g: 63, b: 108 }
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  return { h: h * 360, s, l }
}

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.min(1, Math.max(0, s))
  const light = Math.min(1, Math.max(0, l))
  const f = (n) => {
    const k = (n + hue / 30) % 12
    const a = sat * Math.min(light, 1 - light)
    const v = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(v * 255).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/**
 * Accent used by buttons, rings and steppers. Keeps the identity hue
 * but clamps lightness so black/white/yellow still read on the dark UI.
 */
export function uiAccentHex(hex) {
  if (!parseHex(hex)) return '#ff3f6c'
  const { h, s, l } = hexToHsl(hex)
  if (s < 0.08) {
    const light = l < 0.35 ? 0.42 : l > 0.7 ? 0.4 : Math.max(0.36, Math.min(0.48, l))
    return hslToHex(220, 0.1, light)
  }
  const sat = Math.min(0.78, Math.max(0.42, s))
  const light = l < 0.28 ? 0.5 : l > 0.62 ? 0.4 : l
  return hslToHex(h, sat, light)
}

export function bannerGradient(hex) {
  const base = parseHex(hex) ? hex : '#ff3f6c'
  const L = relativeLuminance(base)
  if (L < 0.1) {
    const lift = uiAccentHex(base)
    return `linear-gradient(135deg, ${lift} 0%, ${base} 58%, #121218 100%)`
  }
  if (L > 0.72) {
    return `linear-gradient(135deg, ${base} 0%, ${uiAccentHex(base)} 70%, #1a1214 100%)`
  }
  const { r, g, b } = parseHex(base)
  const deeper = `#${[r, g, b].map(v => Math.round(v * 0.45).toString(16).padStart(2, '0')).join('')}`
  return `linear-gradient(135deg, ${base} 0%, ${deeper} 100%)`
}

export function bannerOverlay(hex, covered = false) {
  const base = parseHex(hex) ? hex : '#ff3f6c'
  const L = relativeLuminance(base)
  if (L < 0.12) {
    return `linear-gradient(180deg, ${hexToRgba(uiAccentHex(base), 0.28)} 0%, rgba(13,10,12,0.42) 100%)`
  }
  if (L > 0.42) {
    const bottom = L > 0.6 ? 0.82 : 0.72
    return `linear-gradient(180deg, ${hexToRgba(base, 0.18)} 0%, rgba(13,10,12,${bottom}) 100%)`
  }
  if (!covered) return 'transparent'
  return `linear-gradient(180deg, ${hexToRgba(base, 0.32)} 0%, rgba(13,10,12,0.62) 100%)`
}

/**
 * Primary CTA paint — Home mockup: cool white → blue gradient with dark ink.
 * Pass a Space accent hex to tint the same shape for personalized Spaces.
 *
 * Returns { background, color, boxShadow } for inline style on buttons.
 */
export function ctaStyle(accentHex = null) {
  const hasAccent = !!(accentHex && parseHex(accentHex))
  const accent = hasAccent ? uiAccentHex(accentHex) : '#4a9eff'
  const soft = hasAccent ? hexToRgba(accent, 0.45) : 'rgba(74, 158, 255, 0.45)'
  const glow = hasAccent ? hexToRgba(accent, 0.35) : 'rgba(74, 158, 255, 0.35)'
  // Specular white highlight on top → accent mid → deeper blue at bottom.
  const background = hasAccent
    ? `linear-gradient(180deg, #ffffff 0%, ${hexToRgba('#ffffff', 0.92)} 18%, ${accent} 62%, ${uiAccentHex(accent)} 100%)`
    : 'linear-gradient(180deg, #ffffff 0%, #e8f2ff 22%, #7eb6ff 58%, #3d8dff 100%)'
  // Dark ink reads on the bright top of the gradient.
  const color = '#0b1220'
  const boxShadow = [
    `0 1px 0 rgba(255,255,255,0.55) inset`,
    `0 0 0 1px ${soft}`,
    `0 8px 22px -8px ${glow}`,
  ].join(', ')
  return { background, color, boxShadow }
}

/**
 * Compute the CSS custom-property tokens for the current Space. We attach
 * these as inline `style` on the main container so every descendant can read
 * them via `var(--space-accent)` etc.
 *
 * Accent defaults to the spec value (#ff3f6c) when the Space has no color.
 * The "glow-24" variant is what speaking cards use (DESIGN_SYSTEM §5.2).
 */
export function spaceTokens(space) {
  if (!space) {
    return {
      '--space-color':          '#ff3f6c',
      '--space-on-color':       '#ffffff',
      '--space-accent':         '#ff3f6c',
      '--space-on-accent':      '#ffffff',
      '--space-accent-soft':    'rgba(255, 63, 108, 0.14)',
      '--space-accent-glow-24': 'rgba(255, 63, 108, 0.24)',
      '--space-accent-glow-32': 'rgba(255, 63, 108, 0.32)',
      '--space-accent-glow-40': 'rgba(255, 63, 108, 0.40)',
      '--space-surface':        '#15171d',
      '--space-elevated':       '#191c23',
      '--space-gradient':       'linear-gradient(135deg, rgba(255,63,108,0.18) 0%, rgba(255,63,108,0.06) 70%, transparent 100%)',
    }
  }
  const identity = (space.color && /^#/.test(space.color)) ? space.color : '#ff3f6c'
  const accent = uiAccentHex(identity)
  const soft  = hexToRgba(accent, 0.14)
  const mid   = hexToRgba(accent, 0.08)
  const glow  = hexToRgba(accent, 0.24)
  const glow32 = hexToRgba(accent, 0.32)
  const glow40 = hexToRgba(accent, 0.40)
  const cover = resolveSpaceCover(space)
  const fit = resolveSpaceCoverFit(space)
  const gradient = cover
    ? `linear-gradient(135deg, ${hexToRgba(accent, 0.40)} 0%, transparent 60%), url(${cover})`
    : `linear-gradient(135deg, ${soft} 0%, ${mid} 70%, transparent 100%)`
  return {
    '--space-color':          identity,
    '--space-on-color':       onColorHex(identity),
    '--space-accent':         accent,
    '--space-on-accent':      onColorHex(accent),
    '--space-accent-soft':    soft,
    '--space-accent-glow-24': glow,
    '--space-accent-glow-32': glow32,
    '--space-accent-glow-40': glow40,
    '--space-surface':        '#15171d',
    '--space-elevated':       '#191c23',
    '--space-gradient':       gradient,
    '--space-cover':          cover ? `url(${cover})` : 'none',
    '--space-cover-position': `${fit.x}% ${fit.y}%`,
    '--space-cover-zoom':     String(fit.zoom),
  }
}

/**
 * Initial avatar helper. Stable per id so names don't repaint.
 */
export function initialsOf(name) {
  if (!name) return '?'
  const trimmed = name.trim()
  if (!trimmed) return '?'
  return trimmed.charAt(0).toUpperCase()
}
