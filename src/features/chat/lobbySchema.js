/**
 * Lobby / welcome-channel config — Discord-style join cards.
 * Personalization mirrors announce (icon picker, rich text, author, banner fit).
 */

import { DEFAULT_COVER_FIT, normalizeCoverFit } from '../spaces/model/spaceCover'
import {
  sanitizeAnnounceHtml,
  htmlToPlainText,
} from './announceSchema.js'

export { sanitizeAnnounceHtml, htmlToPlainText }

const HEX = /^#[0-9a-fA-F]{6}$/
const ICON_STYLES = ['outline', 'rounded', 'filled', 'duotone']

export const LOBBY_ACCENTS = [
  { id: 'sky', value: '#38bdf8', label: 'Céu' },
  { id: 'gold', value: '#f5b942', label: 'Ouro' },
  { id: 'lime', value: '#a3e635', label: 'Lima' },
  { id: 'violet', value: '#a78bfa', label: 'Violeta' },
  { id: 'rose', value: '#f472b6', label: 'Rosa' },
  { id: 'coral', value: '#fb7185', label: 'Coral' },
]

export const LOBBY_AUTHOR_MODES = [
  { id: 'me', label: 'Eu' },
  { id: 'member', label: 'Membro' },
  { id: 'system', label: 'Sistema' },
  { id: 'custom', label: 'Custom' },
]

/** Compact avatar banner — smaller than announce cover (96). */
export const LOBBY_BANNER_HEIGHT = 108

function sanitizeHex(value, fallback) {
  return typeof value === 'string' && HEX.test(value) ? value : fallback
}

function sanitizeMediaUrl(url) {
  if (typeof url !== 'string' || !url) return null
  if (url.startsWith('data:image/')) return url.slice(0, 3_500_000)
  if (/^https?:\/\//i.test(url)) return url.slice(0, 2000)
  return null
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

export function emptyLobbyConfig(overrides = {}) {
  return {
    enabled: false,
    showJoins: true,
    showLeaves: true,
    title: 'Boas-vindas! 🎊',
    body: 'Olá {{user}}!\n\nLeia as #regras e apresente-se aqui.\nSomos {{count}} membros em {{space}}.',
    bodyHtml: 'Olá {{user}}!<br><br>Leia as #regras e apresente-se aqui.<br>Somos {{count}} membros em {{space}}.',
    bannerCaption: 'Bem-vindo(a) a {{space}}!',
    badge: 'Lobby',
    badgeColor: '#38bdf8',
    icon: '👋',
    iconValue: null,
    iconImage: null,
    accent: LOBBY_ACCENTS[0].value,
    banner: null,
    bannerFit: { ...DEFAULT_COVER_FIT },
    authorMode: 'system',
    authorUserId: null,
    authorName: 'Lobby',
    authorPhoto: '',
    authorIcon: '🚪',
    authorIconValue: null,
    ...overrides,
  }
}

export function normalizeLobby(raw) {
  const base = emptyLobbyConfig()
  if (!raw || typeof raw !== 'object') return base

  const showJoinsLeaves = raw.showJoinsLeaves
  const showJoins = raw.showJoins !== undefined
    ? !!raw.showJoins
    : (showJoinsLeaves !== false)
  const showLeaves = raw.showLeaves !== undefined
    ? !!raw.showLeaves
    : (showJoinsLeaves !== false)

  const authorMode = ['me', 'member', 'system', 'custom'].includes(raw.authorMode)
    ? raw.authorMode
    : 'system'

  const bodyHtml = typeof raw.bodyHtml === 'string' ? raw.bodyHtml.slice(0, 50_000) : ''
  const bodyPlain = String(raw.body || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)

  return {
    enabled: !!raw.enabled,
    showJoins,
    showLeaves,
    title: String(raw.title || base.title).slice(0, 80),
    body: bodyPlain || String(raw.body || base.body).slice(0, 1200),
    bodyHtml,
    bannerCaption: String(
      raw.bannerCaption != null ? raw.bannerCaption : base.bannerCaption,
    ).slice(0, 120),
    badge: String(raw.badge || base.badge).slice(0, 24),
    badgeColor: sanitizeHex(raw.badgeColor || raw.accent, base.badgeColor),
    icon: String(raw.icon || base.icon).slice(0, 16),
    iconValue: sanitizeIconValue(raw.iconValue),
    iconImage: sanitizeMediaUrl(raw.iconImage),
    accent: sanitizeHex(raw.accent, base.accent),
    banner: sanitizeMediaUrl(raw.banner),
    bannerFit: normalizeCoverFit(raw.bannerFit || base.bannerFit),
    authorMode,
    authorUserId: raw.authorUserId ? String(raw.authorUserId).slice(0, 128) : null,
    authorName: String(raw.authorName || base.authorName).slice(0, 64),
    authorPhoto: sanitizeMediaUrl(raw.authorPhoto) || '',
    authorIcon: String(raw.authorIcon || '').slice(0, 16),
    authorIconValue: sanitizeIconValue(raw.authorIconValue),
  }
}

export const LOBBY_PLACEHOLDERS = [
  {
    id: 'user',
    token: '{{user}}',
    label: 'Nome',
    hint: 'Nome de quem entrou',
    aliases: ['user', 'username', 'name'],
  },
  {
    id: 'space',
    token: '{{space}}',
    label: 'Space',
    hint: 'Nome do Space',
    aliases: ['space', 'server'],
  },
  {
    id: 'count',
    token: '{{count}}',
    label: 'Membros',
    hint: 'Quantidade de membros',
    aliases: ['count', 'members'],
  },
]

function lobbyPhChipHtml(id, label) {
  const safe = String(label || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<span class="lobby-ph" data-ph="${id}" contenteditable="false">${safe}</span>`
}

/** Turn {{user}} tokens into non-editable chips for the rich editor. */
export function wrapLobbyPlaceholders(html) {
  let out = String(html || '')
  for (const ph of LOBBY_PLACEHOLDERS) {
    const re = new RegExp(`\\{\\{\\s*(?:${ph.aliases.join('|')})\\s*\\}\\}`, 'gi')
    out = out.replace(re, lobbyPhChipHtml(ph.id, ph.label))
  }
  return out
}

/** Turn chips back into {{user}} tokens for storage / templates. */
export function unwrapLobbyPlaceholders(html) {
  let out = String(html || '')
  for (const ph of LOBBY_PLACEHOLDERS) {
    const re = new RegExp(
      `<span[^>]*data-ph=["']${ph.id}["'][^>]*>[\\s\\S]*?<\\/span>`,
      'gi',
    )
    out = out.replace(re, ph.token)
  }
  return out
}

export function lobbyPlaceholderChipHtml(id) {
  const ph = LOBBY_PLACEHOLDERS.find((p) => p.id === id)
  if (!ph) return ''
  return `${lobbyPhChipHtml(ph.id, ph.label)}\u00a0`
}

function lobbyTemplateContext(ctx = {}) {
  return {
    user: String(ctx.user || ctx.username || ctx.name || 'alguém'),
    space: String(ctx.space || ctx.server || 'Space'),
    count: String(ctx.count ?? ctx.members ?? ''),
  }
}

/** Plain-text fill (no chips) — previews, lastMessage, etc. */
export function applyLobbyTemplate(text, ctx = {}) {
  const { user, space, count } = lobbyTemplateContext(ctx)
  let out = unwrapLobbyPlaceholders(String(text || ''))
  out = out
    .replace(/\{\{\s*(user|username|name)\s*\}\}/gi, user)
    .replace(/\{\{\s*(space|server)\s*\}\}/gi, space)
    .replace(/\{\{\s*(count|members)\s*\}\}/gi, count)
  return out
}

/**
 * Fill placeholders as styled chips (for card body / caption / preview).
 * Accepts raw {{tokens}}, editor chips, or mixed HTML.
 */
export function applyLobbyTemplateChips(text, ctx = {}) {
  const values = lobbyTemplateContext(ctx)
  let out = unwrapLobbyPlaceholders(String(text || ''))
  // Plain text → keep line breaks if there is no HTML yet.
  if (out && !/<[a-z][\s\S]*>/i.test(out)) {
    out = out
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }
  for (const ph of LOBBY_PLACEHOLDERS) {
    const re = new RegExp(`\\{\\{\\s*(?:${ph.aliases.join('|')})\\s*\\}\\}`, 'gi')
    out = out.replace(re, lobbyPhChipHtml(ph.id, values[ph.id] ?? ''))
  }
  return out
}

export function isLobbyRoom(room) {
  return !!normalizeLobby(room?.lobby).enabled
}

export function isLobbyEventMessage(msg) {
  return msg?.kind === 'lobby_event' || !!msg?.lobbyEvent
}

export function isLobbyWelcomeMessage(msg) {
  return msg?.kind === 'lobby_welcome' || msg?.id === '__lobby_welcome__'
}

export function lobbyDayKey(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}
