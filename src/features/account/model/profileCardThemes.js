/**
 * Profile card themes — Discord-style skins. Each id maps to distinct FX in CardThemeFx.
 */

export const DEFAULT_CARD_THEME_ID = 'default'

export const PROFILE_CARD_THEMES = [
  {
    id: 'default',
    label: 'Clássico',
    premium: false,
    fx: 'default',
    accent: '#ff3f6c',
    bodyBg: '#12080e',
    bannerGradient: 'linear-gradient(125deg, #ff3f6c 0%, #7a1030 42%, #1a0a14 100%)',
    popoverBorder: 'rgba(255,63,108,0.45)',
    popoverGlow: 'rgba(255,63,108,0.55)',
    nameplate: 'linear-gradient(90deg, rgba(255,63,108,0.35) 0%, rgba(255,63,108,0.1) 50%, transparent 100%)',
    coverTint: 'linear-gradient(135deg, rgba(255,63,108,0.55), transparent 55%)',
  },
  {
    id: 'lunar',
    label: 'Lunar',
    premium: true,
    fx: 'lunar',
    accent: '#c4b5fd',
    bodyBg: '#0c0a18',
    bannerGradient: 'linear-gradient(125deg, #1e1b4b 0%, #4c1d95 38%, #0f0a1a 100%)',
    popoverBorder: 'rgba(196,181,253,0.55)',
    popoverGlow: 'rgba(167,139,250,0.6)',
    nameplate: 'linear-gradient(90deg, rgba(167,139,250,0.4) 0%, rgba(76,29,149,0.22) 50%, transparent 100%)',
    coverTint: 'linear-gradient(135deg, rgba(139,92,246,0.5), rgba(30,27,75,0.35) 60%)',
  },
  {
    id: 'nebula',
    label: 'Nebula',
    premium: true,
    fx: 'nebula',
    accent: '#f472b6',
    bodyBg: '#120816',
    bannerGradient: 'linear-gradient(125deg, #831843 0%, #6b21a8 40%, #0c1222 100%)',
    popoverBorder: 'rgba(244,114,182,0.55)',
    popoverGlow: 'rgba(236,72,153,0.65)',
    nameplate: 'linear-gradient(90deg, rgba(236,72,153,0.42) 0%, rgba(109,40,217,0.25) 55%, transparent 100%)',
    coverTint: 'linear-gradient(125deg, rgba(236,72,153,0.5), rgba(109,40,217,0.4) 55%, transparent)',
  },
  {
    id: 'ember',
    label: 'Ember',
    premium: true,
    fx: 'ember',
    accent: '#fb923c',
    bodyBg: '#140a06',
    bannerGradient: 'linear-gradient(125deg, #9a3412 0%, #7f1d1d 40%, #1a0a08 100%)',
    popoverBorder: 'rgba(251,146,60,0.55)',
    popoverGlow: 'rgba(249,115,22,0.65)',
    nameplate: 'linear-gradient(90deg, rgba(249,115,22,0.42) 0%, rgba(127,29,29,0.25) 55%, transparent 100%)',
    coverTint: 'linear-gradient(180deg, rgba(249,115,22,0.35), rgba(127,29,29,0.45) 70%)',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    premium: true,
    fx: 'aurora',
    accent: '#34d399',
    bodyBg: '#061410',
    bannerGradient: 'linear-gradient(125deg, #065f46 0%, #0e7490 45%, #0a1220 100%)',
    popoverBorder: 'rgba(52,211,153,0.55)',
    popoverGlow: 'rgba(16,185,129,0.55)',
    nameplate: 'linear-gradient(90deg, rgba(16,185,129,0.4) 0%, rgba(14,116,144,0.22) 55%, transparent 100%)',
    coverTint: 'linear-gradient(100deg, rgba(16,185,129,0.45), rgba(56,189,248,0.3) 50%, transparent)',
  },
  {
    id: 'void',
    label: 'Void',
    premium: true,
    fx: 'void',
    accent: '#94a3b8',
    bodyBg: '#06080e',
    bannerGradient: 'linear-gradient(125deg, #0f172a 0%, #1e293b 50%, #020617 100%)',
    popoverBorder: 'rgba(148,163,184,0.4)',
    popoverGlow: 'rgba(100,116,139,0.45)',
    nameplate: 'linear-gradient(90deg, rgba(100,116,139,0.35) 0%, rgba(15,23,42,0.55) 55%, transparent 100%)',
    coverTint: 'linear-gradient(180deg, rgba(15,23,42,0.55), rgba(2,6,23,0.7))',
  },
  {
    id: 'sakura',
    label: 'Sakura',
    premium: true,
    fx: 'sakura',
    accent: '#fda4af',
    bodyBg: '#14080e',
    bannerGradient: 'linear-gradient(125deg, #9f1239 0%, #be185d 40%, #1a0a12 100%)',
    popoverBorder: 'rgba(253,164,175,0.55)',
    popoverGlow: 'rgba(244,114,182,0.6)',
    nameplate: 'linear-gradient(90deg, rgba(251,113,133,0.42) 0%, rgba(159,18,57,0.22) 55%, transparent 100%)',
    coverTint: 'linear-gradient(135deg, rgba(251,113,133,0.5), rgba(244,114,182,0.25) 50%, transparent)',
  },
  {
    id: 'cyber',
    label: 'Cyber',
    premium: true,
    fx: 'cyber',
    accent: '#22d3ee',
    bodyBg: '#060a12',
    bannerGradient: 'linear-gradient(125deg, #083344 0%, #164e63 35%, #4c1d95 70%, #0a0a14 100%)',
    popoverBorder: 'rgba(34,211,238,0.6)',
    popoverGlow: 'rgba(6,182,212,0.65)',
    nameplate: 'linear-gradient(90deg, rgba(6,182,212,0.42) 0%, rgba(76,29,149,0.28) 55%, transparent 100%)',
    coverTint: 'linear-gradient(110deg, rgba(6,182,212,0.4), rgba(168,85,247,0.35) 55%, transparent)',
  },
]

const BY_ID = Object.fromEntries(PROFILE_CARD_THEMES.map((t) => [t.id, t]))

export function resolveCardTheme(themeId, fallbackAccent = null) {
  const base = BY_ID[themeId] || BY_ID[DEFAULT_CARD_THEME_ID]
  if (!fallbackAccent || themeId !== 'default') return base
  return {
    ...base,
    accent: fallbackAccent,
    bannerGradient: `linear-gradient(125deg, ${fallbackAccent} 0%, ${hexAlpha(fallbackAccent, 0.25)} 45%, #1a0a14 100%)`,
    popoverGlow: hexAlpha(fallbackAccent, 0.5),
    popoverBorder: hexAlpha(fallbackAccent, 0.4),
    nameplate: `linear-gradient(90deg, ${hexAlpha(fallbackAccent, 0.35)} 0%, ${hexAlpha(fallbackAccent, 0.1)} 55%, transparent 100%)`,
    coverTint: `linear-gradient(135deg, ${hexAlpha(fallbackAccent, 0.5)}, transparent 55%)`,
  }
}

export function normalizeCardThemeId(value) {
  const id = String(value || DEFAULT_CARD_THEME_ID)
  return BY_ID[id] ? id : DEFAULT_CARD_THEME_ID
}

function hexAlpha(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(255,63,108,${alpha})`
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
