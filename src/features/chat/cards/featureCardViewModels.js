/**
 * Pure presentation models shared by special chat-card surfaces.
 * These helpers intentionally do not read React, browser globals, or persistence.
 */

export const FEATURE_CARD_KINDS = Object.freeze({
  ANNOUNCEMENT: 'announcement',
  RULES: 'rules',
  LOBBY: 'lobby',
  SYSTEM: 'system',
  MESSAGE: 'message',
})

export const FEATURE_CARD_MESSAGE_VARIANTS = Object.freeze([
  'compact',
  'pinned',
  'highlight',
])

const DEFAULT_TITLES = Object.freeze({
  announcement: 'Anúncio',
  rules: 'Regras do Space',
  lobby: 'Lobby',
  system: 'Atualização do sistema',
  message: 'Mensagem',
})

function valueOf(value) {
  return typeof value === 'function' ? value() : value
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function withContext(value, context = {}) {
  const values = {
    user: context.user ?? context.username ?? context.name ?? 'alguém',
    space: context.space ?? context.server ?? 'Space',
    count: context.count ?? context.members ?? '',
  }
  return String(value ?? '')
    .replace(/\{\{\s*(?:user|username|name)\s*\}\}/gi, String(values.user))
    .replace(/\{\{\s*(?:space|server)\s*\}\}/gi, String(values.space))
    .replace(/\{\{\s*(?:count|members)\s*\}\}/gi, String(values.count))
}

export function truncateFeatureCardText(value, maxLength = 160) {
  const text = plainText(value)
  const limit = Math.max(1, Math.floor(Number(maxLength) || 160))
  if (text.length <= limit) return text
  return `${text.slice(0, Math.max(1, limit - 1)).trimEnd()}…`
}

function firstLine(value) {
  return plainText(value).split(/\n/)[0].trim()
}

function safeMediaUrl(value) {
  const url = String(value ?? '').trim()
  if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url
  return ''
}

function normalizeFit(fit) {
  if (!fit || typeof fit !== 'object') return null
  const clamp = (value, min, max, fallback) => {
    const number = Number(value)
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
  }
  return {
    x: clamp(fit.x, 0, 100, 50),
    y: clamp(fit.y, 0, 100, 50),
    zoom: clamp(fit.zoom, 1, 2.5, 1),
  }
}

export function resolveFeatureCardTitle(source = {}, options = {}) {
  const kind = options.kind || FEATURE_CARD_KINDS.MESSAGE
  const config = options.config || {}
  const context = options.context || {}
  let candidate = options.title

  if (!candidate && kind === FEATURE_CARD_KINDS.ANNOUNCEMENT) {
    candidate = config.title || source.title || firstLine(source.text)
  } else if (!candidate && kind === FEATURE_CARD_KINDS.RULES) {
    candidate = config.title || source.title
  } else if (!candidate && kind === FEATURE_CARD_KINDS.LOBBY) {
    candidate = config.title || source.title || source.lobbyEvent?.title
  } else if (!candidate && kind === FEATURE_CARD_KINDS.SYSTEM) {
    candidate = source.title || firstLine(source.text)
  } else if (!candidate) {
    candidate = source.title || firstLine(source.text) || source.attachment?.name
  }

  return truncateFeatureCardText(
    withContext(candidate || DEFAULT_TITLES[kind] || DEFAULT_TITLES.message, context),
    options.maxLength || 120,
  )
}

export function resolveFeatureCardSnippet(source = {}, options = {}) {
  const kind = options.kind || FEATURE_CARD_KINDS.MESSAGE
  const config = options.config || {}
  const context = options.context || {}
  let candidate = options.snippet

  if (!candidate && kind === FEATURE_CARD_KINDS.ANNOUNCEMENT) {
    candidate = config.body || config.bodyHtml || source.text
  } else if (!candidate && kind === FEATURE_CARD_KINDS.RULES) {
    candidate = config.body || config.bodyHtml
  } else if (!candidate && kind === FEATURE_CARD_KINDS.LOBBY) {
    candidate = config.body || config.bodyHtml || source.lobbyEvent?.body || source.text
  } else {
    candidate = candidate || source.text || source.attachment?.name || ''
  }

  return truncateFeatureCardText(withContext(candidate, context), options.maxLength || 180)
}

export function resolveFeatureCardAuthor(source = {}, fallback = {}) {
  const mode = String(source.authorMode || fallback.mode || 'custom')
  const name = plainText(source.authorName || fallback.name || fallback.author || '')
  const id = source.authorUserId || fallback.id || null
  return Object.freeze({
    id: id ? String(id) : null,
    name: name || (mode === 'system' ? 'Sistema' : 'Equipe'),
    photo: safeMediaUrl(source.authorPhoto || fallback.photo),
    icon: String(source.authorIcon || fallback.icon || ''),
    iconValue: source.authorIconValue || fallback.iconValue || null,
    mode,
  })
}

/**
 * The displayed author may be editorial/custom. Publisher preserves the stable
 * account identity from the message envelope so consumers can verify it.
 */
export function resolveFeatureCardPublisher(source = {}, fallback = {}) {
  const id = source.publisherId || source.authorId || fallback.id || null
  const name = plainText(
    source.publisherName || fallback.name || source.author || source.displayName || '',
  )
  const normalizedId = id ? String(id) : null
  return Object.freeze({
    id: normalizedId,
    name: name || 'Publicador desconhecido',
    photo: safeMediaUrl(source.publisherPhoto || fallback.photo || source.authorPhoto),
    verifiable: Boolean(normalizedId),
  })
}

export function resolveFeatureCardMedia(source = {}, options = {}) {
  const config = options.config || {}
  const attachment = source.attachment || {}
  const src = safeMediaUrl(
    options.src || config.cover || config.banner || source.cover || source.banner
      || attachment.url || attachment.src,
  )
  if (!src) return null
  const name = plainText(options.alt || config.mediaAlt || attachment.name || '')
  return Object.freeze({
    src,
    alt: name,
    kind: String(options.kind || (attachment.type?.startsWith?.('video/') ? 'video' : 'image')),
    fit: normalizeFit(options.fit || config.coverFit || config.bannerFit),
  })
}

export function resolveFeatureCardStatus(source = {}, options = {}) {
  if (source.deleted) return Object.freeze({ id: 'deleted', label: 'Excluída', tone: 'danger' })
  if (options.status) {
    const status = typeof options.status === 'string' ? { label: options.status } : options.status
    return Object.freeze({ id: status.id || 'custom', label: status.label || '', tone: status.tone || 'neutral' })
  }
  if (source.status === 'scheduled' || options.scheduled) {
    return Object.freeze({ id: 'scheduled', label: 'Agendado', tone: 'info' })
  }
  if (options.kind === FEATURE_CARD_KINDS.RULES && options.accepted === true) {
    return Object.freeze({ id: 'accepted', label: 'Regras aceitas', tone: 'positive' })
  }
  if (options.variant === 'pinned' || source.pinned) {
    return Object.freeze({ id: 'pinned', label: 'Fixada', tone: 'accent' })
  }
  if (options.variant === 'highlight' || source.highlighted) {
    return Object.freeze({ id: 'highlight', label: 'Destaque', tone: 'accent' })
  }
  if (source.edited) return Object.freeze({ id: 'edited', label: 'Editada', tone: 'neutral' })
  if (options.kind === FEATURE_CARD_KINDS.SYSTEM) {
    return Object.freeze({ id: 'system', label: 'Sistema', tone: 'info' })
  }
  return null
}

export function featureCardTimestamp(value) {
  const raw = valueOf(value)
  if (raw == null || raw === '') return null
  if (raw instanceof Date) return Number.isFinite(raw.getTime()) ? raw.getTime() : null
  if (typeof raw?.toMillis === 'function') return featureCardTimestamp(raw.toMillis())
  if (Number.isFinite(Number(raw?.seconds))) {
    return (Number(raw.seconds) * 1000) + Math.floor(Number(raw.nanoseconds || 0) / 1e6)
  }
  if (typeof raw === 'string' && !/^\d+(?:\.\d+)?$/.test(raw.trim())) {
    const parsed = Date.parse(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  const numeric = Number(raw)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null
}

export function formatFeatureCardTime(value, options = {}) {
  const timestamp = featureCardTimestamp(value)
  if (timestamp == null) return ''
  const format = options.format || 'time'
  const dateOptions = format === 'dateTime'
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : format === 'date'
      ? { day: '2-digit', month: 'short', year: 'numeric' }
      : { hour: '2-digit', minute: '2-digit' }
  if (options.timeZone) dateOptions.timeZone = options.timeZone
  return new Intl.DateTimeFormat(options.locale || 'pt-BR', dateOptions).format(timestamp)
}

export function resolveFeatureCardTime(source = {}, options = {}) {
  const value = options.value
    ?? ((source.status === 'scheduled' || options.scheduled) ? source.publishAt ?? source.scheduledFor : null)
    ?? (options.variant === 'pinned' ? source.pinnedAt : null)
    ?? source.createdAt
    ?? source.ts
    ?? source.timestamp
  const timestamp = featureCardTimestamp(value)
  if (timestamp == null) return null
  return Object.freeze({
    timestamp,
    iso: new Date(timestamp).toISOString(),
    label: formatFeatureCardTime(timestamp, options),
  })
}

function baseViewModel(kind, source, config, options) {
  const context = options.context || {}
  const publisherSource = options.publisher || source
  return Object.freeze({
    id: source.id || source.firestoreId || options.id || null,
    kind,
    variant: options.variant || null,
    accent: config.accent || source.accent || options.accent || null,
    title: resolveFeatureCardTitle(source, { ...options, kind, config, context }),
    snippet: resolveFeatureCardSnippet(source, { ...options, kind, config, context }),
    author: resolveFeatureCardAuthor(config, {
      name: source.author,
      photo: source.authorPhoto,
    }),
    publisher: resolveFeatureCardPublisher(publisherSource, options.publisherFallback),
    media: resolveFeatureCardMedia(source, { config, ...options.media }),
    status: resolveFeatureCardStatus(source, { ...options, kind }),
    time: resolveFeatureCardTime(source, options.time || options),
  })
}

export function createAnnouncementCardViewModel(message = {}, options = {}) {
  const config = message.announce || options.announce || {}
  return baseViewModel(FEATURE_CARD_KINDS.ANNOUNCEMENT, message, config, options)
}

export function createRulesCardViewModel(rules = {}, options = {}) {
  const source = options.message || { id: options.id, ...options.publisher }
  return baseViewModel(FEATURE_CARD_KINDS.RULES, source, rules.rules || rules, options)
}

export function createLobbyCardViewModel(message = {}, options = {}) {
  const event = message.lobbyEvent || {}
  const config = options.lobby || event.config || message.lobby || {}
  const source = { ...message, title: event.title || message.title, accent: event.accent || message.accent }
  return baseViewModel(FEATURE_CARD_KINDS.LOBBY, source, config, options)
}

export function createSystemCardViewModel(message = {}, options = {}) {
  const config = options.system || {
    authorMode: 'system',
    authorName: options.authorName || 'Sistema',
    authorIcon: options.authorIcon || '•',
  }
  return baseViewModel(FEATURE_CARD_KINDS.SYSTEM, message, config, options)
}

export function createMessageCardViewModel(message = {}, options = {}) {
  const variant = FEATURE_CARD_MESSAGE_VARIANTS.includes(options.variant)
    ? options.variant
    : 'compact'
  return baseViewModel(FEATURE_CARD_KINDS.MESSAGE, message, {}, { ...options, variant })
}

export function createFeatureCardViewModel(source = {}, options = {}) {
  const kind = options.kind
    || (source.announce ? FEATURE_CARD_KINDS.ANNOUNCEMENT : null)
    || (source.rules ? FEATURE_CARD_KINDS.RULES : null)
    || (source.lobbyEvent || source.lobby ? FEATURE_CARD_KINDS.LOBBY : null)
    || (source.kind === 'sys' || source.kind === 'system' ? FEATURE_CARD_KINDS.SYSTEM : null)
    || FEATURE_CARD_KINDS.MESSAGE

  if (kind === FEATURE_CARD_KINDS.ANNOUNCEMENT) return createAnnouncementCardViewModel(source, options)
  if (kind === FEATURE_CARD_KINDS.RULES) return createRulesCardViewModel(source.rules || source, options)
  if (kind === FEATURE_CARD_KINDS.LOBBY) return createLobbyCardViewModel(source, options)
  if (kind === FEATURE_CARD_KINDS.SYSTEM) return createSystemCardViewModel(source, options)
  return createMessageCardViewModel(source, options)
}
