/**
 * Rules channel config — gate the rest of the Space until the member accepts.
 * Personalization mirrors lobby/announce (icon, rich text, banner, author).
 */

import { DEFAULT_COVER_FIT, normalizeCoverFit } from '../spaces/model/spaceCover'
import {
  sanitizeAnnounceHtml,
  htmlToPlainText,
} from './announceSchema.js'
import {
  LOBBY_ACCENTS,
  LOBBY_AUTHOR_MODES,
  LOBBY_PLACEHOLDERS,
  wrapLobbyPlaceholders,
  unwrapLobbyPlaceholders,
  lobbyPlaceholderChipHtml,
  applyLobbyTemplate,
  applyLobbyTemplateChips,
} from './lobbySchema'

export {
  sanitizeAnnounceHtml,
  htmlToPlainText,
  LOBBY_ACCENTS as RULES_ACCENTS,
  LOBBY_AUTHOR_MODES as RULES_AUTHOR_MODES,
  LOBBY_PLACEHOLDERS as RULES_PLACEHOLDERS,
  wrapLobbyPlaceholders as wrapRulesPlaceholders,
  unwrapLobbyPlaceholders as unwrapRulesPlaceholders,
  lobbyPlaceholderChipHtml as rulesPlaceholderChipHtml,
  applyLobbyTemplate as applyRulesTemplate,
  applyLobbyTemplateChips as applyRulesTemplateChips,
}

const HEX = /^#[0-9a-fA-F]{6}$/
const ICON_STYLES = ['outline', 'rounded', 'filled', 'duotone']

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

export function emptyRulesConfig(overrides = {}) {
  return {
    enabled: false,
    lockSpace: true,
    version: 1,
    title: 'Regras do Space',
    body: 'Leia com atenção antes de continuar.\n\n1. Respeito acima de tudo\n2. Sem spam\n3. Divirta-se em {{space}}',
    bodyHtml: 'Leia com atenção antes de continuar.<br><br>1. Respeito acima de tudo<br>2. Sem spam<br>3. Divirta-se em {{space}}',
    badge: 'Regras',
    badgeColor: '#a78bfa',
    icon: '📜',
    iconValue: null,
    iconImage: null,
    accent: '#a78bfa',
    banner: null,
    bannerFit: { ...DEFAULT_COVER_FIT },
    acceptLabel: 'Li e aceito as regras',
    authorMode: 'system',
    authorUserId: null,
    authorName: 'Moderação',
    authorPhoto: '',
    authorIcon: '⚖️',
    authorIconValue: null,
    ...overrides,
  }
}

export function normalizeRules(raw) {
  const base = emptyRulesConfig()
  if (!raw || typeof raw !== 'object') return base

  const authorMode = ['me', 'member', 'system', 'custom'].includes(raw.authorMode)
    ? raw.authorMode
    : 'system'

  const bodyHtml = typeof raw.bodyHtml === 'string' ? raw.bodyHtml.slice(0, 50_000) : ''
  const bodyPlain = String(raw.body || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)

  const version = Math.max(1, Math.floor(Number(raw.version) || 1))

  return {
    enabled: !!raw.enabled,
    lockSpace: raw.lockSpace !== false,
    version,
    title: String(raw.title || base.title).slice(0, 80),
    body: bodyPlain || String(raw.body || base.body).slice(0, 4000),
    bodyHtml,
    badge: String(raw.badge || base.badge).slice(0, 24),
    badgeColor: sanitizeHex(raw.badgeColor || raw.accent, base.badgeColor),
    icon: String(raw.icon || base.icon).slice(0, 16),
    iconValue: sanitizeIconValue(raw.iconValue),
    iconImage: sanitizeMediaUrl(raw.iconImage),
    accent: sanitizeHex(raw.accent, base.accent),
    banner: sanitizeMediaUrl(raw.banner),
    bannerFit: normalizeCoverFit(raw.bannerFit || base.bannerFit),
    acceptLabel: String(raw.acceptLabel || base.acceptLabel).slice(0, 64),
    authorMode,
    authorUserId: raw.authorUserId ? String(raw.authorUserId).slice(0, 128) : null,
    authorName: String(raw.authorName || base.authorName).slice(0, 64),
    authorPhoto: sanitizeMediaUrl(raw.authorPhoto) || '',
    authorIcon: String(raw.authorIcon || '').slice(0, 16),
    authorIconValue: sanitizeIconValue(raw.authorIconValue),
  }
}

export function isRulesRoom(room) {
  return !!normalizeRules(room?.rules).enabled
}

export function findRulesRoom(space) {
  const rooms = Array.isArray(space?.rooms) ? space.rooms : []
  return rooms.find((r) => isRulesRoom(r)) || null
}

export function rulesContentFingerprint(rules) {
  const r = normalizeRules(rules)
  return [
    r.title,
    r.body,
    r.bodyHtml,
    r.badge,
    r.acceptLabel,
    r.banner || '',
    r.icon || '',
    r.iconImage || '',
    JSON.stringify(r.iconValue || null),
  ].join('\n')
}

export function memberAcceptedRules(member, rules) {
  const cfg = normalizeRules(rules)
  if (!cfg.enabled || !cfg.lockSpace) return true
  const accepted = Math.floor(Number(member?.rulesAcceptedVersion) || 0)
  return accepted >= cfg.version
}

export function spaceRequiresRulesAccept({ space, member, canBypass = false }) {
  if (canBypass) return false
  const room = findRulesRoom(space)
  if (!room) return false
  const cfg = normalizeRules(room.rules)
  if (!cfg.enabled || !cfg.lockSpace) return false
  return !memberAcceptedRules(member, cfg)
}
