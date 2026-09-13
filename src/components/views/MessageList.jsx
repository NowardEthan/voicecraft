/**
 * MessageList — scrollable Discord-style feed with grouping, date
 * dividers, unread marker, smart auto-scroll, mentions highlights and a
 * typing indicator footer.
 *
 * Phase 3A — chat Discord-style additions:
 *   - Typing indicator at the footer ("fulano está digitando…")
 *   - mentionsMe / isReply / pinned passed to MessageBubble
 *   - Animated fade-in classes use Tailwind's animate-* (not vc-anim-*)
 *   - 3 quick emoji reactions on the action bar (handled by bubble)
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { ArrowDown, MessageSquare } from 'lucide-react'
import MessageBubble from './MessageBubble'
import { colorFromId } from '../../features/spaces'
import { resolveChatDensity, normalizeChatDensity } from './chatDensity'
import { getLastRead, setLastRead } from '../../features/notifications/unreadStore'

const STICK_THRESHOLD_PX = 100

function isOwnMessage(m, currentUserId, currentUserName) {
  if (m?.authorId && currentUserId) return m.authorId === currentUserId
  return m?.direction === 'out' || m?.author === currentUserName
}

/** Detect if `text` contains an `@<handle>` mention that matches the
 *  current user's handle or displayName. */
function detectMentionMe(text, currentUserId, currentUserName, members) {
  if (!text) return false
  const me = members.find((m) => m.userId === currentUserId)
    || (currentUserName ? { displayName: currentUserName } : null)
  if (!me) return false
  const handles = new Set()
  if (me.handle) handles.add(me.handle.toLowerCase())
  if (me.displayName) handles.add(me.displayName.toLowerCase())
  if (currentUserId) handles.add(String(currentUserId).toLowerCase())
  const re = /@([a-zA-Z0-9_.\-]{1,24})/g
  let m
  while ((m = re.exec(text))) {
    if (handles.has(m[1].toLowerCase())) return true
  }
  return false
}

export function resolveChatAuthor(msg, members = [], currentUserId, currentUserName) {
  if (!msg) return { userId: null, displayName: 'convidado', handle: '', photoURL: '' }
  const userId = msg.authorId || (isOwnMessage(msg, currentUserId, currentUserName) ? currentUserId : null)
  const member = userId ? members.find((m) => m.userId === userId) : null
  return {
    userId,
    displayName: member?.displayName || msg.author || currentUserName || 'convidado',
    handle: member?.handle || msg.authorHandle || '',
    photoURL: member?.photoURL || msg.authorPhoto || '',
    online: !!member?.online,
  }
}

function parseRoomKey(roomKey) {
  const raw = String(roomKey || '')
  const idx = raw.indexOf(':')
  if (idx < 0) return { spaceId: null, roomId: raw || null }
  return { spaceId: raw.slice(0, idx), roomId: raw.slice(idx + 1) }
}

function dayKey(ts) {
  const d = new Date(ts || 0)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function formatDayLabel(ts) {
  const d = new Date(ts || 0)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (dayKey(d.getTime()) === dayKey(today.getTime())) return 'Hoje'
  if (dayKey(d.getTime()) === dayKey(yesterday.getTime())) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
}

export default function MessageList({
  messages,
  currentUserName,
  currentUserId,
  authorColors,
  roomKey = null,
  loading = false,
  onRetry,
  onImageClick,
  emptyHint = 'Nenhuma mensagem ainda. Mande a primeira.',
  query = '',
  onToggleReaction,
  onReply,
  onEdit,
  onDelete,
  canModerate = false,
  members = [],
  density = 'confortavel',
  pinnedIds = [],
  onTogglePin,
  onToggleLike,
  quickReactions = ['👍', '❤️', '🔥'],
  typingTracker = null,
  allRooms = [],
  onRoomMention,
  jumpToId = null,
  jumpTick = 0,
  canPinAll = false,
  /** Optional node rendered at the top of the same scroll as messages (rules, etc.). */
  listHeader = null,
}) {
  const scrollerRef = useRef(null)
  const [unseen, setUnseen] = useState(0)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [highlightId, setHighlightId] = useState(null)
  const [highlightTick, setHighlightTick] = useState(0)
  const [typingState, setTypingState] = useState({ peers: [] })
  const highlightTimerRef = useRef(null)
  const lastLenRef = useRef(messages.length)
  const [lastReadTs] = useState(() => {
    const { spaceId, roomId } = parseRoomKey(roomKey)
    return getLastRead(currentUserId, spaceId, roomId).at || 0
  })
  const densityKey = normalizeChatDensity(density)
  const dens = resolveChatDensity(densityKey)

  const handleScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    const stick = distance < STICK_THRESHOLD_PX
    setStickToBottom(stick)
    if (stick) setUnseen(0)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const prev = lastLenRef.current
    const incoming = messages.length - prev
    lastLenRef.current = messages.length
    if (incoming <= 0) return

    if (stickToBottom) {
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight
      })
      setUnseen(0)
    } else {
      setUnseen(n => n + incoming)
    }
  }, [messages.length, stickToBottom])

  useEffect(() => {
    lastLenRef.current = messages.length
    setUnseen(0)
    requestAnimationFrame(() => {
      const el = scrollerRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [messages === undefined ? null : messages])

  useEffect(() => {
    if (!stickToBottom || !messages.length) return
    const latest = messages[messages.length - 1]
    if (!latest?.ts) return
    const { spaceId, roomId } = parseRoomKey(roomKey)
    setLastRead(currentUserId, spaceId, roomId, { at: latest.ts, id: latest.id || null })
  }, [messages, stickToBottom, roomKey, currentUserId])

  const jumpToMessage = useCallback((id) => {
    if (!id) return
    const root = scrollerRef.current
    if (!root) return
    const target = root.querySelector(`[data-msg-id="${CSS.escape(String(id))}"]`)
    if (!target) return
    setStickToBottom(false)
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(id)
    setHighlightTick((n) => n + 1)
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => setHighlightId(null), 2400)
  }, [])

  useEffect(() => {
    if (!jumpToId) return
    jumpToMessage(jumpToId)
  }, [jumpToId, jumpTick, jumpToMessage])

  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
  }, [])

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    setUnseen(0)
    setStickToBottom(true)
  }, [])

  /* Typing indicator subscription */
  useEffect(() => {
    if (!typingTracker) return undefined
    return typingTracker.subscribe(setTypingState)
  }, [typingTracker])

  const messagesById = useMemo(() => {
    const m = new Map()
    for (const message of messages) {
      if (message.id) m.set(message.id, message)
    }
    return m
  }, [messages])

  const filteredMessages = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(m => {
      if (m.kind === 'sys' || m.kind === 'announce' || m.announce
        || m.kind === 'lobby_event' || m.kind === 'lobby_welcome'
        || m.lobbyEvent) {
        return true
      }
      return String(m.text || m.announce?.title || m.announce?.body || '').toLowerCase().includes(q)
    })
  }, [messages, query])

  const pinnedSet = useMemo(() => {
    const fromProp = new Set(pinnedIds || [])
    for (const m of messages || []) {
      if (m?.pinned && m.id) fromProp.add(m.id)
    }
    return fromProp
  }, [pinnedIds, messages])

  /* Room-mention resolver (CONTRATO_FASE2). Builds a slug index once per
   * rooms prop change so the markdown renderer can produce a
   * clickable pill only when `#geral` actually maps to a room.       */
  const roomIndex = useMemo(() => {
    const idx = new Map()
    const list = Array.isArray(allRooms) ? allRooms : []
    for (const r of list) {
      if (!r || !r.id || !r.name) continue
      const slugBase = String(r.name).toLowerCase().replace(/[\s_]+/g, '-')
      const idLower = String(r.id).toLowerCase()
      const candidates = new Set([slugBase, idLower])
      for (const k of candidates) {
        if (k && !idx.has(k)) idx.set(k, r)
      }
    }
    return idx
  }, [allRooms])
  const resolveRoom = useCallback((slug) => {
    if (!slug || !roomIndex.size) return null
    return roomIndex.get(String(slug).toLowerCase()) || null
  }, [roomIndex])

  const rows = useMemo(() => {
    const groups = []
    for (let i = 0; i < filteredMessages.length; i++) {
      const m = filteredMessages[i]
      if (m.kind === 'sys' || m.kind === 'announce' || m.announce
        || m.kind === 'lobby_event' || m.kind === 'lobby_welcome'
        || m.lobbyEvent) {
        const asAnnounce = m.kind === 'announce' || m.announce
          || (m.kind === 'sys' && String(m.text || '').length > 60)
        const kind = m.kind === 'lobby_welcome'
          ? 'lobby_welcome'
          : (m.kind === 'lobby_event' || m.lobbyEvent)
            ? 'lobby_event'
            : asAnnounce ? 'announce' : 'sys'
        groups.push({
          kind,
          message: m,
          key: m.id,
        })
        continue
      }
      const isMine = isOwnMessage(m, currentUserId, currentUserName)
      const prev = filteredMessages[i - 1]
      const sameAsPrev = prev
        && prev.kind === 'msg'
        && !m.attachment
        && !prev.attachment
        && !m.replyToId
        && isOwnMessage(prev, currentUserId, currentUserName) === isMine
        && ((isMine ? m.author : prev.author) || 'peer') === ((isMine ? prev.author : m.author) || 'peer')
        && (m.ts - prev.ts) < dens.groupBreakMs
      const authorKey = isMine ? '__me__' : (m.authorId || m.author || 'peer')
      if (sameAsPrev && groups.length > 0 && groups[groups.length - 1].kind === 'msg') {
        groups[groups.length - 1].items.push(m)
      } else {
        groups.push({
          kind: 'msg',
          isMine,
          authorKey,
          color: authorColors?.get(authorKey) || colorFromId(authorKey),
          items: [m],
          key: m.id,
        })
      }
    }

    const isCardKind = (kind) => (
      kind === 'sys' || kind === 'announce'
      || kind === 'lobby_event' || kind === 'lobby_welcome'
    )

    const out = []
    let lastDay = null
    let lastContentKind = null
    let unreadInserted = false
    for (const g of groups) {
      const first = isCardKind(g.kind) ? g.message : g.items[0]
      const ts = first?.ts || 0
      const day = dayKey(ts)
      if (day !== lastDay) {
        // Avoid a hard "two panes" cut under rules/announcements/lobby cards.
        const hideDivider = (listHeader && lastDay === null)
          || isCardKind(g.kind)
          || isCardKind(lastContentKind)
        if (!hideDivider) {
          out.push({ kind: 'day', key: `day-${day}`, label: formatDayLabel(ts) })
        }
        lastDay = day
      }
      if (!unreadInserted && lastReadTs > 0 && ts > lastReadTs) {
        out.push({ kind: 'unread', key: 'unread' })
        unreadInserted = true
      }
      out.push(g)
      lastContentKind = g.kind
    }
    return out
  }, [filteredMessages, currentUserName, currentUserId, authorColors, lastReadTs, dens.groupBreakMs, listHeader])

  const typingText = useMemo(() => {
    const peers = typingState?.peers || []
    if (peers.length === 0) return ''
    if (peers.length === 1) return `${peers[0]} está digitando`
    if (peers.length === 2) return `${peers[0]} e ${peers[1]} estão digitando`
    return 'várias pessoas estão digitando'
  }, [typingState])

/* Split the typing-text into `<strong>name</strong> <em>rest…</em>` so
 * the label itself feels premium (bold who + italic action). Falls back
 * to plain text for the "várias pessoas" case.                       */
function renderTypingLabel(text) {
  if (!text) return null
  const m = /^(.+?)\s+(está digitando|estão digitando)$/.exec(text)
  if (m) {
    return (
      <span>
        <strong>{m[1]}</strong>{' '}
        <em style={{ fontStyle: 'italic', opacity: 0.85 }}>{m[2]}</em>
      </span>
    )
  }
  return <span>{text}</span>
}

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      data-chat-density={densityKey}
      style={dens.vars}
    >
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className={'h-full overflow-y-auto overscroll-contain ' + dens.listPy}
      >
        {listHeader}
        {loading ? (
          <SkeletonStack />
        ) : filteredMessages.length === 0 ? (
          <EmptyHint text={query.trim() ? `sem resultados pra "${query}"` : emptyHint} />
        ) : (
          rows.map(g => {
            if (g.kind === 'day') {
              return <DayDivider key={g.key} label={g.label} className={dens.dividerPy} />
            }
            if (g.kind === 'unread') {
              return <UnreadDivider key={g.key} className={dens.dividerPy} />
            }
            if (g.kind === 'sys' || g.kind === 'announce'
              || g.kind === 'lobby_event' || g.kind === 'lobby_welcome') {
              return (
                <div key={g.key} className={dens.group}>
                  <MessageBubble
                    msg={g.message}
                    isMine={false}
                    showHeader={false}
                    density={densityKey}
                    resolveRoom={resolveRoom}
                    currentUserId={currentUserId}
                    onToggleLike={g.kind === 'announce' ? onToggleLike : null}
                    onToggleReaction={g.kind === 'announce' ? onToggleReaction : null}
                    quickReactions={quickReactions}
                  />
                </div>
              )
            }
            return (
              <div key={g.key} className={`${dens.group} ${dens.row}`}>
                {g.items.map((m, idx) => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    isMine={g.isMine}
                    showHeader={idx === 0}
                    isLast={idx === g.items.length - 1}
                    density={densityKey}
                    onRetry={onRetry}
                    onImageClick={onImageClick}
                    onReply={onReply}
                    onToggleReaction={onToggleReaction}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    canModerate={canModerate}
                    author={resolveChatAuthor(m, members, currentUserId, currentUserName)}
                    /* Author color: prefer the one already derived for the
                     * group (stable for the whole chain), fallback to a
                     * per-message id-derived hue.                          */
                    authorColor={g.color || colorFromId(m.authorId || m.author || (g.isMine ? '__me__' : 'peer'))}
                    replyTo={m.replyToId ? (messagesById.get(m.replyToId) || { id: m.replyToId, missing: true }) : null}
                    replyAuthor={m.replyToId ? resolveChatAuthor(messagesById.get(m.replyToId), members, currentUserId, currentUserName) : null}
                    highlighted={highlightId === m.id}
                    highlightTick={highlightTick}
                    onJumpToReply={jumpToMessage}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    roomKey={roomKey}
                    mentionsMe={
                      !isOwnMessage(m, currentUserId, currentUserName) &&
                      detectMentionMe(m.text, currentUserId, currentUserName, members)
                    }
                    isReply={!!m.replyToId}
                    pinned={pinnedSet.has(m.id) || !!m.pinned}
                    canPin={canPinAll || isOwnMessage(m, currentUserId, currentUserName)}
                    onTogglePin={onTogglePin}
                    onToggleLike={onToggleLike}
                    quickReactions={quickReactions}
                    resolveRoom={resolveRoom}
                    onRoomMention={onRoomMention}
                  />
                ))}
              </div>
            )
          })
        )}
        {typingText && (
          <div className="vc-typing-wrap flex items-center gap-2 px-5 sm:px-8 py-1.5">
            <div
              data-typing-indicator
              aria-live="polite"
              className="vc-typing"
            >
              {renderTypingLabel(typingText)}
              <span className="vc-typing-dots" aria-hidden>
                <span className="vc-typing-dot" />
                <span className="vc-typing-dot" />
                <span className="vc-typing-dot" />
              </span>
            </div>
          </div>
        )}
      </div>

      {unseen > 0 && (
        <button
          onClick={scrollToBottom}
          className="
            absolute right-3 sm:right-5 bottom-3 z-10 inline-flex items-center gap-1.5
            px-3 py-1.5 rounded-pill text-[11px] font-semibold text-white
            vc-jump-bottom
            active:scale-95
            animate-fade-in-up
          "
          style={{ animationDuration: '180ms' }}
          aria-label="Pular para as mensagens mais recentes"
        >
          <ArrowDown size={11} strokeWidth={2.5} className="vc-jump-icon" />
          {unseen} {unseen === 1 ? 'mensagem nova' : 'mensagens novas'}
        </button>
      )}
    </div>
  )
}

function DayDivider({ label, className = 'px-4 sm:px-6 py-3' }) {
  return (
    <div
      role="separator"
      aria-hidden
      className={'vc-day-divider ' + className}
    >
      <span className="vc-day-divider__label">{label}</span>
      <span className="vc-day-divider__dot" />
    </div>
  )
}

function UnreadDivider({ className = 'px-4 sm:px-6 py-2' }) {
  return (
    <div
      role="separator"
      className={'vc-day-divider unread-divider ' + className}
      style={{ paddingTop: 10, paddingBottom: 10 }}
    >
      <span className="vc-day-divider__label" style={{ textTransform: 'uppercase' }}>Novas mensagens</span>
      <span className="vc-day-divider__dot" />
    </div>
  )
}

function SkeletonStack() {
  return (
    <div className="space-y-5 px-4 sm:px-6 pt-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3 items-start">
          <div className="w-10 h-10 rounded-full animate-shimmer" />
          <div className="flex-1 space-y-2 max-w-md">
            <div className="h-2.5 w-28 rounded animate-shimmer" />
            <div className="h-3 w-full rounded animate-shimmer" />
            <div className="h-3 w-3/4 rounded animate-shimmer" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyHint({ text }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <MessageSquare size={28} className="text-line mb-3" />
      <p className="text-[12.5px] text-muted leading-relaxed">{text}</p>
    </div>
  )
}
