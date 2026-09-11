/**
 * Room name cosmetics — light Discord-ish fonts / effects for sidebar + headers.
 * Stored as a style id on the room doc (not free-form CSS).
 */
import { resolveFontFamily } from '../../spaces/model/spaceTypography'

export const ROOM_NAME_STYLES = [
  {
    id: 'default',
    label: 'Clássico',
    preview: 'Aa',
    style: {
      fontFamily: 'inherit',
      fontWeight: 600,
      letterSpacing: 'normal',
      textShadow: 'none',
      fontStyle: 'normal',
    },
  },
  {
    id: 'display',
    label: 'Display',
    preview: 'Aa',
    style: {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontWeight: 600,
      letterSpacing: '-0.02em',
      textShadow: 'none',
      fontStyle: 'italic',
    },
  },
  {
    id: 'soft',
    label: 'Suave',
    preview: 'Aa',
    style: {
      fontFamily: 'inherit',
      fontWeight: 500,
      letterSpacing: '0.04em',
      textShadow: 'none',
      fontStyle: 'normal',
      textTransform: 'lowercase',
    },
  },
  {
    id: 'bold',
    label: 'Impacto',
    preview: 'Aa',
    style: {
      fontFamily: 'inherit',
      fontWeight: 800,
      letterSpacing: '-0.03em',
      textShadow: 'none',
      fontStyle: 'normal',
      textTransform: 'uppercase',
      fontSize: '0.92em',
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    preview: 'Aa',
    style: {
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontWeight: 600,
      letterSpacing: '-0.04em',
      textShadow: 'none',
      fontStyle: 'normal',
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    preview: 'Aa',
    style: {
      fontFamily: 'inherit',
      fontWeight: 700,
      letterSpacing: '0.02em',
      textShadow: '0 0 10px currentColor, 0 0 22px color-mix(in srgb, currentColor 55%, transparent)',
      fontStyle: 'normal',
    },
  },
  {
    id: 'glow',
    label: 'Brilho',
    preview: 'Aa',
    style: {
      fontFamily: 'Georgia, serif',
      fontWeight: 600,
      letterSpacing: '0.01em',
      textShadow: '0 0 14px color-mix(in srgb, currentColor 45%, transparent)',
      fontStyle: 'italic',
    },
  },
]

export const ROOM_NAME_STYLE_BY_ID = Object.fromEntries(
  ROOM_NAME_STYLES.map((s) => [s.id, s]),
)

export function resolveRoomNameStyle(id) {
  return ROOM_NAME_STYLE_BY_ID[id] || ROOM_NAME_STYLE_BY_ID.default
}

/**
 * Merge cosmetic nameStyle effects with a Space catalog fontId.
 * fontId wins for fontFamily when provided.
 */
export function resolveLabeledNameStyle({
  nameStyle = 'default',
  fontId = null,
  fonts = [],
} = {}) {
  const base = { ...resolveRoomNameStyle(nameStyle).style }
  if (typeof fontId === 'string' && fontId) {
    base.fontFamily = resolveFontFamily(fontId, fonts)
  }
  return base
}

export function normalizeFontId(value, fallback = 'default') {
  if (typeof value !== 'string') return fallback
  const id = value.trim().slice(0, 64)
  return id || fallback
}

/** Small emoji chips for quick room markers (optional alternative to Phosphor). */
export const ROOM_EMOJI_PRESETS = [
  '💬', '🔊', '🎮', '🎵', '📚', '☕', '🚀', '✨', '🔥', '💜', '🏠', '🎯',
]

export function normalizeRoomEmoji(value) {
  const s = String(value || '').trim()
  if (!s) return null
  // Keep short grapheme clusters (emoji + ZWJ sequences).
  const chars = Array.from(s)
  if (chars.length > 8) return chars.slice(0, 8).join('')
  return s
}
