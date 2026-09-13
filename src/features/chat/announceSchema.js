/**
 * Rich chat announcement payload helpers.
 */

import { DEFAULT_COVER_FIT, normalizeCoverFit } from '../spaces/model/spaceCover'

export const ANNOUNCE_ACCENTS = [
  { id: 'gold', value: '#f5b942', label: 'Ouro' },
  { id: 'rose', value: '#f472b6', label: 'Rosa' },
  { id: 'sky', value: '#38bdf8', label: 'Céu' },
  { id: 'lime', value: '#a3e635', label: 'Lima' },
  { id: 'violet', value: '#a78bfa', label: 'Violeta' },
  { id: 'coral', value: '#fb7185', label: 'Coral' },
]

export const ANNOUNCE_SIZES = [
  { id: 'sm', label: 'Compacto' },
  { id: 'md', label: 'Normal' },
  { id: 'lg', label: 'Destaque' },
]

export const ANNOUNCE_AUTHOR_MODES = [
  { id: 'me', label: 'Eu' },
  { id: 'member', label: 'Membro' },
  { id: 'system', label: 'Sistema' },
  { id: 'custom', label: 'Custom' },
]

/** Compact banner strip — fixed height so chat width doesn't inflate the cover. */
export const ANNOUNCE_COVER_HEIGHT = 96

/** @deprecated use ANNOUNCE_COVER_HEIGHT; kept for any leftover imports */
export const ANNOUNCE_COVER_ASPECT = `${ANNOUNCE_COVER_HEIGHT * 4} / ${ANNOUNCE_COVER_HEIGHT}`

const HEX = /^#[0-9a-fA-F]{6}$/
const ICON_STYLES = ['outline', 'rounded', 'filled', 'duotone']

function sanitizeMediaUrl(url) {
  if (typeof url !== 'string' || !url) return null
  if (url.startsWith('data:image/')) return url.slice(0, 3_500_000)
  if (/^https?:\/\//i.test(url)) return url.slice(0, 2000)
  return null
}

function sanitizeHex(value, fallback) {
  return typeof value === 'string' && HEX.test(value) ? value : fallback
}

function sanitizeIconValue(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name || raw.id || '').trim().slice(0, 80)
  if (!name) return null
  return {
    id: String(raw.id || name).slice(0, 80),
    name,
    collection: String(raw.collection || 'ph').slice(0, 16),
    style: ICON_STYLES.includes(raw.style) ? raw.style : 'outline',
  }
}

export function emptyAnnounceDraft(overrides = {}) {
  return {
    title: '',
    body: '',
    bodyHtml: '',
    authorMode: 'me', // me | member | system | custom
    authorUserId: null,
    authorName: '',
    authorPhoto: '',
    authorIcon: '', // emoji for system/custom author avatar
    authorIconValue: null, // SpaceIcon for system/custom author avatar
    icon: '📣',
    iconValue: null, // app SpaceIcon { id, collection, name, style }
    iconImage: null, // uploaded png/data url preferred over iconValue/emoji
    cover: null,
    coverFit: { ...DEFAULT_COVER_FIT },
    badge: '',
    badgeColor: '#f5b942',
    accent: ANNOUNCE_ACCENTS[0].value,
    bodySize: 'md',
    scheduledFor: null,
    ...overrides,
  }
}

export function normalizeAnnounce(raw) {
  const base = emptyAnnounceDraft()
  if (!raw || typeof raw !== 'object') return base
  const bodySize = ['sm', 'md', 'lg'].includes(raw.bodySize) ? raw.bodySize : 'md'
  const authorMode = ['me', 'member', 'system', 'custom'].includes(raw.authorMode)
    ? raw.authorMode
    : 'custom'
  const scheduledFor = raw.scheduledFor != null && Number(raw.scheduledFor) > 0
    ? Number(raw.scheduledFor)
    : null

  const bodyHtml = typeof raw.bodyHtml === 'string' ? raw.bodyHtml.slice(0, 50_000) : ''
  const bodyPlain = String(raw.body || raw.text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)

  return {
    title: String(raw.title || '').slice(0, 120),
    body: bodyPlain || String(raw.body || '').slice(0, 4000),
    bodyHtml,
    authorMode,
    authorUserId: raw.authorUserId ? String(raw.authorUserId).slice(0, 128) : null,
    authorName: String(raw.authorName || '').slice(0, 64),
    authorPhoto: sanitizeMediaUrl(raw.authorPhoto) || '',
    authorIcon: String(raw.authorIcon || '').slice(0, 16),
    authorIconValue: sanitizeIconValue(raw.authorIconValue),
    icon: String(raw.icon || '📣').slice(0, 16),
    iconValue: sanitizeIconValue(raw.iconValue),
    iconImage: sanitizeMediaUrl(raw.iconImage),
    cover: sanitizeMediaUrl(raw.cover),
    coverFit: normalizeCoverFit(raw.coverFit || base.coverFit),
    badge: String(raw.badge || '').slice(0, 32),
    badgeColor: sanitizeHex(raw.badgeColor, base.badgeColor),
    accent: sanitizeHex(raw.accent, base.accent),
    bodySize,
    scheduledFor,
  }
}

export function announcePreviewText(announce) {
  const a = normalizeAnnounce(announce)
  if (a.title) return a.title
  if (a.body) return a.body.slice(0, 80)
  if (a.bodyHtml) {
    return a.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  }
  return 'Anúncio'
}

export function isAnnounceMessage(msg) {
  return msg?.kind === 'announce' || !!msg?.announce
}

/** Very small HTML allowlist for announce rich text. */
export function sanitizeAnnounceHtml(html) {
  let out = String(html || '')
  out = out.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
  out = out.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  out = out.replace(/javascript:/gi, '')
  out = out.replace(/<\/?(?:iframe|object|embed|link|meta|form|input|button)[^>]*>/gi, '')
  return out.slice(0, 50_000)
}

export function htmlToPlainText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
