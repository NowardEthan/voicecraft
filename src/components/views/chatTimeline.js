import { actionIdOf } from '../../features/chat/messageIdentity.js'

export function messageId(message) {
  return actionIdOf(message)
}

export function isOwnMessage(message, currentUserId, currentUserName) {
  if (message?.authorId && currentUserId) return message.authorId === currentUserId
  return message?.direction === 'out' || message?.author === currentUserName
}

export function hasAttachments(message) {
  return !!message?.attachment || (Array.isArray(message?.attachments) && message.attachments.length > 0)
}

function dayKey(ts) {
  const date = new Date(Number(ts) || 0)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function formatDayLabel(ts) {
  const date = new Date(Number(ts) || 0)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(date.getTime()) === dayKey(today.getTime())) return 'Hoje'
  if (dayKey(date.getTime()) === dayKey(yesterday.getTime())) return 'Ontem'
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

function findMessageIndex(messages, id) {
  if (!id) return -1
  const target = String(id)
  return messages.findIndex((message) => String(message?.id || '') === target || String(message?.firestoreId || '') === target)
}

/** Return a fixed-size slice around an anchor, clamped to the available list. */
export function computeMessageWindow(messages, limit, { anchorId = null, start = null } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const size = Math.max(1, Math.min(list.length || 1, Math.floor(Number(limit) || 1)))
  if (list.length <= size) return { items: list, start: 0, end: list.length, total: list.length }

  let windowStart
  if (Number.isFinite(start)) {
    windowStart = Math.max(0, Math.min(Math.floor(start), list.length - size))
  } else {
    const anchorIndex = findMessageIndex(list, anchorId)
    windowStart = anchorIndex >= 0
      ? Math.max(0, Math.min(anchorIndex - Math.floor(size / 2), list.length - size))
      : list.length - size
  }
  const end = Math.min(list.length, windowStart + size)
  return { items: list.slice(windowStart, end), start: windowStart, end, total: list.length }
}

function cardKind(message) {
  if (message?.kind === 'lobby_welcome') return 'lobby_welcome'
  if (message?.kind === 'lobby_event' || message?.lobbyEvent) return 'lobby_event'
  if (message?.kind === 'announce' || message?.announce) return 'announce'
  if (message?.kind === 'sys') return 'sys'
  return null
}

function authorGroupingKey(message, currentUserId, currentUserName) {
  if (isOwnMessage(message, currentUserId, currentUserName)) return '__me__'
  return String(message?.authorId || message?.author || 'peer')
}

/** Build timeline rows; message groups never span a local day or unread edge. */
export function buildConversationRows(messages, {
  currentUserId = null,
  currentUserName = '',
  lastReadTs = 0,
  groupBreakMs = 5 * 60 * 1000,
  hideInitialDay = false,
} = {}) {
  const rows = []
  let previous = null
  let unreadInserted = false

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]
    if (!message) continue
    const timestamp = Number(message.ts) || 0
    const day = dayKey(timestamp)
    const previousDay = previous ? dayKey(previous.ts) : null
    const dayChanged = day !== previousDay
    const crossesUnread = !unreadInserted && lastReadTs > 0 && timestamp > lastReadTs

    if (dayChanged && !(hideInitialDay && previous == null)) {
      rows.push({ kind: 'day', key: `day-${day}-${index}`, label: formatDayLabel(timestamp), ts: timestamp })
    }
    if (crossesUnread) {
      rows.push({ kind: 'unread', key: `unread-${messageId(message) || index}` })
      unreadInserted = true
    }

    const specialKind = cardKind(message)
    if (specialKind) {
      rows.push({ kind: specialKind, message, key: `card-${messageId(message) || index}` })
      previous = message
      continue
    }

    const authorKey = authorGroupingKey(message, currentUserId, currentUserName)
    const previousSpecial = cardKind(previous)
    const sameAuthor = previous && authorGroupingKey(previous, currentUserId, currentUserName) === authorKey
    const elapsed = timestamp - (Number(previous?.ts) || 0)
    const canJoin = previous
      && !previousSpecial
      && !dayChanged
      && !crossesUnread
      && sameAuthor
      && elapsed >= 0
      && elapsed < groupBreakMs
      && !message.replyToId
      && !hasAttachments(message)
      && !hasAttachments(previous)

    const lastRow = rows[rows.length - 1]
    if (canJoin && lastRow?.kind === 'msg') {
      lastRow.items.push(message)
    } else {
      rows.push({
        kind: 'msg',
        isMine: isOwnMessage(message, currentUserId, currentUserName),
        authorKey,
        items: [message],
        key: `group-${messageId(message) || index}`,
      })
    }
    previous = message
  }
  return rows
}

