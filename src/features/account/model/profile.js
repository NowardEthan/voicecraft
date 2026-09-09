import { DEFAULT_COVER_FIT, normalizeCoverFit } from '../../spaces/model/spaceCover'
import { DEFAULT_CARD_THEME_ID, normalizeCardThemeId } from './profileCardThemes'

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

export function slugHandle(value) {
  const raw = String(value || 'voce')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 20)
  return raw || 'voce'
}

export function monthLabel(ts) {
  const d = new Date(Number(ts) || Date.now())
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`
}

export function relativeTime(ts) {
  const delta = Date.now() - Number(ts || 0)
  const min = Math.round(delta / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return '1 dia'
  return `${d} dias`
}

export function normalizeProfile(uid, data = {}, authUser = null) {
  const displayName = data.displayName || authUser?.displayName || 'Você'
  const createdAt = Number(data.createdAt)
    || Date.parse(authUser?.metadata?.creationTime || '')
    || Date.now()
  return {
    uid,
    displayName,
    handle: data.handle || slugHandle(authUser?.email?.split('@')[0] || displayName),
    bio: data.bio || '',
    about: data.about || '',
    location: data.location || '',
    statusText: data.statusText || '',
    photoURL: data.photoURL || authUser?.photoURL || '',
    cover: typeof data.cover === 'string' ? data.cover : '',
    coverFit: normalizeCoverFit(data.coverFit),
    bannerHue: Number.isFinite(Number(data.bannerHue)) ? Number(data.bannerHue) : 340,
    cardThemeId: normalizeCardThemeId(data.cardThemeId || DEFAULT_CARD_THEME_ID),
    createdAt,
    voiceMinutes: Number(data.voiceMinutes) || 0,
    connections: Array.isArray(data.connections) ? data.connections : [],
    activity: Array.isArray(data.activity) ? data.activity : [],
    privacy: {
      showLocation: data.privacy?.showLocation !== false,
      showActivity: data.privacy?.showActivity !== false,
      showSpaces: data.privacy?.showSpaces !== false,
    },
    email: data.email || authUser?.email || '',
    online: data.online !== false,
  }
}

export function profilePayload(profile) {
  return {
    displayName: String(profile.displayName || '').trim().slice(0, 40) || 'Você',
    handle: slugHandle(profile.handle),
    bio: String(profile.bio || '').trim().slice(0, 80),
    about: String(profile.about || '').trim().slice(0, 600),
    location: String(profile.location || '').trim().slice(0, 60),
    statusText: String(profile.statusText || '').trim().slice(0, 40),
    photoURL: profile.photoURL || '',
    cover: profile.cover || '',
    coverFit: profile.cover ? normalizeCoverFit(profile.coverFit) : { ...DEFAULT_COVER_FIT },
    bannerHue: Number(profile.bannerHue) || 340,
    cardThemeId: normalizeCardThemeId(profile.cardThemeId),
    createdAt: profile.createdAt,
    voiceMinutes: Number(profile.voiceMinutes) || 0,
    connections: profile.connections || [],
    activity: (profile.activity || []).slice(0, 20),
    privacy: profile.privacy,
  }
}

export function appendActivity(list, entry) {
  const next = [
    { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: Date.now(), ...entry },
    ...(list || []),
  ]
  return next.slice(0, 20)
}

export function deriveBadges(profile, spaceCount) {
  const year = new Date(profile.createdAt).getFullYear()
  return [
    { id: 'pioneer', label: 'Pioneiro', hint: `Desde ${year}`, unlocked: year <= 2026 },
    { id: 'connecting', label: 'Conectando', hint: '10+ conexões', unlocked: (profile.connections?.length || 0) >= 10 },
    { id: 'voice', label: 'Voz ativa', hint: '25+ horas', unlocked: (profile.voiceMinutes || 0) >= 25 * 60 },
    { id: 'vibe', label: 'Boa vibe', hint: 'Sempre por perto', unlocked: !!(profile.bio || profile.about) },
  ]
}
