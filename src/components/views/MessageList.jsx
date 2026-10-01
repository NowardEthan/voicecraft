/** Accessible, windowed conversation timeline. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ChevronUp, MessageSquare, SearchX } from 'lucide-react'
import MessageBubble from './MessageBubble'
import { colorFromId } from '../../features/spaces'
import { resolveChatDensity, normalizeChatDensity } from './chatDensity'
import { getLastRead, markRoomRead } from '../../features/notifications/unreadStore'
import { usePerfProfile } from '../../shared/perf/usePerfProfile'

const STICK_THRESHOLD_PX = 32
const EARLIER_BATCH = 60

export { buildConversationRows, computeMessageWindow } from './chatTimeline.js'
import {
  buildConversationRows, computeMessageWindow, hasAttachments, isOwnMessage, messageId,
} from './chatTimeline.js'

function detectMentionMe(message, currentUserId, currentUserName, members) {
  if (!message || !currentUserId) return false
  if (Array.isArray(message.mentions) && message.mentions.length > 0) {
    return message.mentions.some((mention) => String(mention?.userId || mention) === String(currentUserId))
  }
  const text = message.text
  if (!text) return false
  const me = members.find((member) => member.userId === currentUserId) || (currentUserName ? { displayName: currentUserName } : null)
  const handle = String(me?.handle || '').toLowerCase()
  if (!handle) return false
  return new RegExp(`(^|\\s)@${handle.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?=\\s|$|[.,!?;:])`, 'i').test(text)
}

export function resolveChatAuthor(message, members = [], currentUserId, currentUserName) {
  if (!message) return { userId: null, displayName: 'convidado', handle: '', photoURL: '' }
  const userId = message.authorId || (isOwnMessage(message, currentUserId, currentUserName) ? currentUserId : null)
  const member = userId ? members.find((item) => item.userId === userId) : null
  return {
    userId,
    displayName: member?.displayName || message.author || currentUserName || 'convidado',
    handle: member?.handle || message.authorHandle || '',
    photoURL: member?.photoURL || message.authorPhoto || '',
    online: !!member?.online,
  }
}

export function messageMatchesSearch(message, query = '', filters = {}) {
  if (!message || message.deleted) return false
  const needle = String(query || '').trim().toLocaleLowerCase('pt-BR')
  const attachmentNames = Array.isArray(message.attachments) ? message.attachments.map((attachment) => attachment?.name) : []
  const body = [message.text, message.announce?.title, message.announce?.body, message.attachment?.name, ...attachmentNames]
    .filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
  if (needle && !body.includes(needle)) return false
  if (filters.authorId) {
    const authorKeys = new Set([message.authorId, message.author].filter(Boolean).map(String))
    if (message.direction === 'out' && filters.currentUserId) authorKeys.add(String(filters.currentUserId))
    if (!authorKeys.has(String(filters.authorId))) return false
  }
  if (filters.attachments && !hasAttachments(message)) return false
  if (filters.pinned && !message.pinned) return false
  const days = filters.period === 'day' ? 1 : filters.period === 'week' ? 7 : filters.period === 'month' ? 30 : 0
  if (days && Number(message.ts || 0) < Date.now() - days * 86_400_000) return false
  return true
}

function parseRoomKey(roomKey) {
  const raw = String(roomKey || '')
  const separator = raw.indexOf(':')
  if (separator < 0) return { spaceId: null, roomId: raw || null }
  return { spaceId: raw.slice(0, separator), roomId: raw.slice(separator + 1) }
}

function hasActiveSearch(query, filters) {
  return !!(
    String(query || '').trim()
    || filters?.authorId
    || filters?.attachments
    || filters?.pinned
    || (filters?.period && filters.period !== 'all')
  )
}

export default function MessageList({
  messages = [], currentUserName, currentUserId, authorColors, roomKey = null,
  loading = false, onRetry, onCopy, onCancel, onImageClick,
  emptyHint = 'Nenhuma mensagem ainda. Mande a primeira.', query = '', searchFilters = null,
  onToggleReaction, onReply, onEdit, onDelete, canModerate = false, members = [],
  density = 'confortavel', pinnedIds = [], onTogglePin, onToggleLike,
  quickReactions = ['👍', '❤️', '🔥'], typingTracker = null, allRooms = [],
  onRoomMention, jumpToId = null, jumpTick = 0, canPinAll = false,
  onMarkUnread = null, onReadCursorChange = null, readTick = 0,
  onOpenThread = null, listHeader = null,
}) {
  const scrollerRef = useRef(null)
  const contentRef = useRef(null)
  const highlightTimerRef = useRef(null)
  const lastLengthRef = useRef(messages.length)
  const stickRef = useRef(true)
  const readMarkerRef = useRef('')
  const preservePositionRef = useRef(null)
  const [unseen, setUnseen] = useState(0)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [highlightId, setHighlightId] = useState(null)
  const [highlightTick, setHighlightTick] = useState(0)
  const [forceVisibleId, setForceVisibleId] = useState(null)
  const [jumpSequence, setJumpSequence] = useState(0)
  const [windowStart, setWindowStart] = useState(null)
  const [typingState, setTypingState] = useState({ peers: [] })
  const [lastReadTs, setLastReadTs] = useState(() => {
    const { spaceId, roomId } = parseRoomKey(roomKey)
    return getLastRead(currentUserId, spaceId, roomId).at || 0
  })
  const densityKey = normalizeChatDensity(density)
  const dens = resolveChatDensity(densityKey)
  const perfProfile = usePerfProfile()
  const messageWindow = Math.max(60, Number(perfProfile?.budgets?.messageWindow) || 200)
  const hasListHeader = !!listHeader
  const searchActive = hasActiveSearch(query, searchFilters)

  const updateStick = useCallback((value) => {
    stickRef.current = value
    setStickToBottom(value)
  }, [])

  const isAtBottom = useCallback(() => {
    const element = scrollerRef.current
    return !!element && element.scrollHeight - element.scrollTop - element.clientHeight <= STICK_THRESHOLD_PX
  }, [])

  const markLatestRead = useCallback(() => {
    const element = scrollerRef.current
    const latest = messages[messages.length - 1]
    if (!latest?.ts || !element || !isAtBottom()) return
    const id = messageId(latest)
    const marker = `${Number(latest.ts)}:${id || ''}`
    if (readMarkerRef.current === marker) return
    const { spaceId, roomId } = parseRoomKey(roomKey)
    markRoomRead(currentUserId, spaceId, roomId, { at: latest.ts, id })
    readMarkerRef.current = marker
    setLastReadTs((previous) => Math.max(previous, Number(latest.ts) || 0))
    onReadCursorChange?.()
  }, [messages, roomKey, currentUserId, isAtBottom, onReadCursorChange])

  const pinToPresent = useCallback(({ markRead = true } = {}) => {
    const element = scrollerRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
    updateStick(true)
    setUnseen(0)
    if (markRead) requestAnimationFrame(() => requestAnimationFrame(markLatestRead))
  }, [markLatestRead, updateStick])

  const handleScroll = useCallback(() => {
    const stick = isAtBottom()
    updateStick(stick)
    if (stick) {
      setUnseen(0)
      markLatestRead()
    }
  }, [isAtBottom, markLatestRead, updateStick])

  useEffect(() => {
    const { spaceId, roomId } = parseRoomKey(roomKey)
    setLastReadTs(getLastRead(currentUserId, spaceId, roomId).at || 0)
    readMarkerRef.current = ''
  }, [roomKey, currentUserId, readTick])

  useEffect(() => {
    const previousLength = lastLengthRef.current
    const incoming = messages.length - previousLength
    lastLengthRef.current = messages.length
    if (incoming <= 0) return
    if (stickRef.current && windowStart == null && !forceVisibleId) {
      requestAnimationFrame(() => {
        const element = scrollerRef.current
        if (!element) return
        if (hasListHeader && element.scrollHeight <= element.clientHeight + 48) element.scrollTop = 0
        else pinToPresent()
      })
    } else {
      setUnseen((count) => count + incoming)
    }
  }, [messages.length, hasListHeader, pinToPresent, windowStart, forceVisibleId])

  useEffect(() => {
    lastLengthRef.current = 0
    setUnseen(0)
    setHighlightId(null)
    setForceVisibleId(null)
    setWindowStart(null)
    updateStick(!hasListHeader)
    const frame = requestAnimationFrame(() => {
      const element = scrollerRef.current
      if (!element) return
      element.scrollTop = hasListHeader ? 0 : element.scrollHeight
      lastLengthRef.current = messages.length
      if (!hasListHeader) markLatestRead()
    })
    return () => cancelAnimationFrame(frame)
    // Seed scroll only when the room/header mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey, hasListHeader])

  useEffect(() => {
    if (hasListHeader || !stickRef.current || windowStart != null || forceVisibleId) return
    requestAnimationFrame(() => requestAnimationFrame(() => pinToPresent()))
  }, [messages.length, hasListHeader, roomKey, pinToPresent, windowStart, forceVisibleId])

  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (!stickRef.current || windowStart != null || forceVisibleId) return
      requestAnimationFrame(() => pinToPresent())
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [pinToPresent, windowStart, forceVisibleId])

  useEffect(() => {
    if (!typingTracker) return undefined
    return typingTracker.subscribe(setTypingState)
  }, [typingTracker])

  useEffect(() => () => {
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
  }, [])

  const jumpToMessage = useCallback((id) => {
    if (!id) return
    setWindowStart(null)
    setForceVisibleId(String(id))
    setJumpSequence((sequence) => sequence + 1)
    updateStick(false)
  }, [updateStick])

  useEffect(() => {
    if (jumpToId) jumpToMessage(jumpToId)
  }, [jumpToId, jumpTick, jumpToMessage])

  const messagesById = useMemo(() => {
    const index = new Map()
    for (const message of messages) {
      if (message?.id) index.set(message.id, message)
      if (message?.firestoreId) index.set(message.firestoreId, message)
    }
    return index
  }, [messages])

  const filteredAll = useMemo(() => (
    searchActive
      ? messages.filter((message) => messageMatchesSearch(message, query, { ...(searchFilters || {}), currentUserId }))
      : messages
  ), [messages, query, searchFilters, currentUserId, searchActive])

  const windowed = useMemo(() => computeMessageWindow(filteredAll, messageWindow, {
    anchorId: forceVisibleId,
    start: windowStart,
  }), [filteredAll, messageWindow, forceVisibleId, windowStart])

  useEffect(() => {
    const preserved = preservePositionRef.current
    if (!preserved) return
    preservePositionRef.current = null
    requestAnimationFrame(() => {
      const scroller = scrollerRef.current
      if (!scroller) return
      const selector = `[data-msg-id="${CSS.escape(String(preserved.id))}"], [data-msg-fs="${CSS.escape(String(preserved.id))}"]`
      const target = scroller.querySelector(selector)
      if (target) scroller.scrollTop += target.getBoundingClientRect().top - preserved.top
    })
  }, [windowed.start])

  useEffect(() => {
    if (!forceVisibleId || !jumpSequence) return undefined
    let cancelled = false
    let attempts = 0
    const seek = () => {
      if (cancelled) return
      const scroller = scrollerRef.current
      if (!scroller) return
      const id = CSS.escape(String(forceVisibleId))
      const target = scroller.querySelector(`[data-msg-id="${id}"]`) || scroller.querySelector(`[data-msg-fs="${id}"]`)
      if (!target) {
        if (attempts++ < 20) requestAnimationFrame(seek)
        return
      }
      const scrollerRect = scroller.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const offset = targetRect.top - scrollerRect.top + scroller.scrollTop
      scroller.scrollTop = Math.max(0, Math.min(offset - scroller.clientHeight / 2 + targetRect.height / 2, scroller.scrollHeight - scroller.clientHeight))
      setHighlightId(String(forceVisibleId))
      setHighlightTick((tick) => tick + 1)
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = window.setTimeout(() => setHighlightId(null), 2200)
    }
    const frame = requestAnimationFrame(seek)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [forceVisibleId, jumpSequence])

  const revealEarlier = useCallback(() => {
    if (windowed.start <= 0) return
    const scroller = scrollerRef.current
    const first = windowed.items[0]
    const id = messageId(first)
    const target = id && scroller?.querySelector(`[data-msg-id="${CSS.escape(String(id))}"], [data-msg-fs="${CSS.escape(String(id))}"]`)
    if (id && target) preservePositionRef.current = { id, top: target.getBoundingClientRect().top }
    setForceVisibleId(null)
    setWindowStart(Math.max(0, windowed.start - Math.min(EARLIER_BATCH, messageWindow)))
    updateStick(false)
  }, [windowed, messageWindow, updateStick])

  const returnToPresent = useCallback(() => {
    setForceVisibleId(null)
    setWindowStart(null)
    requestAnimationFrame(() => requestAnimationFrame(() => pinToPresent()))
  }, [pinToPresent])

  const resolveReplyTarget = useCallback((replyToId) => {
    if (!replyToId) return null
    return messagesById.get(replyToId) || { id: replyToId, missing: true }
  }, [messagesById])

  const pinnedSet = useMemo(() => {
    const set = new Set(pinnedIds || [])
    for (const message of messages) if (message?.pinned && messageId(message)) set.add(messageId(message))
    return set
  }, [pinnedIds, messages])

  const roomIndex = useMemo(() => {
    const index = new Map()
    for (const room of Array.isArray(allRooms) ? allRooms : []) {
      if (!room?.id || !room?.name) continue
      const keys = [String(room.name).toLowerCase().replace(/[\s_]+/g, '-'), String(room.id).toLowerCase()]
      for (const key of keys) if (key && !index.has(key)) index.set(key, room)
    }
    return index
  }, [allRooms])
  const resolveRoom = useCallback((slug) => roomIndex.get(String(slug || '').toLowerCase()) || null, [roomIndex])

  const rows = useMemo(() => buildConversationRows(windowed.items, {
    currentUserId,
    currentUserName,
    lastReadTs,
    groupBreakMs: dens.groupBreakMs,
    hideInitialDay: hasListHeader && windowed.start === 0,
  }).map((row) => row.kind === 'msg' ? {
    ...row,
    color: authorColors?.get(row.authorKey) || colorFromId(row.authorKey),
  } : row), [windowed.items, windowed.start, currentUserId, currentUserName, lastReadTs, dens.groupBreakMs, hasListHeader, authorColors])

  const typingText = useMemo(() => {
    const peers = typingState?.peers || []
    if (peers.length === 1) return `${peers[0]} está digitando`
    if (peers.length === 2) return `${peers[0]} e ${peers[1]} estão digitando`
    return peers.length > 2 ? 'Várias pessoas estão digitando' : ''
  }, [typingState])

  const showReturnButton = unseen > 0 || forceVisibleId || windowStart != null || !stickToBottom

  return (
    <div className="vc-conversation-timeline" data-motion-layout="static" data-chat-density={densityKey} style={dens.vars}>
      <div
        ref={scrollerRef}
        role="log"
        aria-label="Histórico da conversa"
        aria-live="polite"
        aria-busy={loading}
        aria-relevant="additions text"
        onScroll={handleScroll}
        className={`vc-conversation-log ${dens.listPy}`}
      >
        <div ref={contentRef} className="vc-conversation-log__content" data-motion-policy="static-window">
          {listHeader}
          {loading ? (
            <SkeletonStack />
          ) : filteredAll.length === 0 ? (
            <EmptyHint text={searchActive ? 'Nenhuma mensagem encontrada. Ajuste a busca ou os filtros para ver outros resultados.' : emptyHint} compact={hasListHeader} filtered={searchActive} />
          ) : (
            <>
              {windowed.start > 0 && (
                <div className="vc-conversation-earlier">
                  <button type="button" onClick={revealEarlier}>
                    <ChevronUp size={16} aria-hidden />
                    Mostrar mensagens anteriores
                    <span>{windowed.start} disponíveis</span>
                  </button>
                </div>
              )}
              {rows.map((row) => {
                if (row.kind === 'day') return <DayDivider key={row.key} label={row.label} ts={row.ts} className={dens.dividerPy} />
                if (row.kind === 'unread') return <UnreadDivider key={row.key} className={dens.dividerPy} />
                if (row.kind !== 'msg') {
                  return (
                    <div key={row.key} className={`vc-conversation-special ${dens.group}`}>
                      <MessageBubble
                        msg={row.message} isMine={false} showHeader={false} density={densityKey}
                        resolveRoom={resolveRoom} currentUserId={currentUserId}
                        onToggleLike={row.kind === 'announce' ? onToggleLike : null}
                        onToggleReaction={row.kind === 'announce' ? onToggleReaction : null}
                        quickReactions={quickReactions}
                      />
                    </div>
                  )
                }
                return (
                  <div key={row.key} className={`vc-conversation-group ${dens.group} ${dens.row}`}>
                    {row.items.map((message, index) => {
                      const id = messageId(message)
                      const replyTarget = message.replyToId ? resolveReplyTarget(message.replyToId) : null
                      return (
                        <MessageBubble
                          key={id || `${row.key}-${index}`}
                          msg={message}
                          isMine={row.isMine}
                          showHeader={index === 0}
                          isLast={index === row.items.length - 1}
                          density={densityKey}
                          onRetry={onRetry}
                          onCopy={onCopy}
                          onCancel={onCancel}
                          onImageClick={onImageClick}
                          onReply={onReply}
                          onToggleReaction={onToggleReaction}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          canModerate={canModerate}
                          author={resolveChatAuthor(message, members, currentUserId, currentUserName)}
                          authorColor={row.color || colorFromId(message.authorId || message.author || (row.isMine ? '__me__' : 'peer'))}
                          replyTo={replyTarget}
                          replyAuthor={message.replyToId ? resolveChatAuthor(messagesById.get(message.replyToId), members, currentUserId, currentUserName) : null}
                          highlighted={highlightId != null && (highlightId === message.id || highlightId === message.firestoreId)}
                          highlightTick={highlightTick}
                          onJumpToReply={jumpToMessage}
                          currentUserId={currentUserId}
                          currentUserName={currentUserName}
                          roomKey={roomKey}
                          mentionsMe={!row.isMine && detectMentionMe(message, currentUserId, currentUserName, members)}
                          isReply={!!message.replyToId}
                          pinned={pinnedSet.has(id) || !!message.pinned}
                          canPin={canPinAll || row.isMine}
                          onTogglePin={onTogglePin}
                          onToggleLike={onToggleLike}
                          quickReactions={quickReactions}
                          resolveRoom={resolveRoom}
                          onRoomMention={onRoomMention}
                          onMarkUnread={onMarkUnread}
                          onOpenThread={onOpenThread}
                          searchQuery={query}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
          {typingText && <div className="vc-conversation-typing" role="status"><span>{typingText}</span><i aria-hidden><b /><b /><b /></i></div>}
        </div>
      </div>

      {showReturnButton && (
        <button type="button" onClick={returnToPresent} className="vc-conversation-return" aria-label="Voltar às mensagens mais recentes">
          <ArrowDown size={16} aria-hidden />
          <span>{unseen > 0 ? `${unseen} ${unseen === 1 ? 'mensagem nova' : 'mensagens novas'}` : 'Voltar ao presente'}</span>
        </button>
      )}
    </div>
  )
}

function DayDivider({ label, ts, className = '' }) {
  return (
    <div role="separator" aria-label={`Mensagens de ${label}`} className={`vc-conversation-day ${className}`}>
      <time dateTime={new Date(ts).toISOString()}>{label}</time>
    </div>
  )
}

function UnreadDivider({ className = '' }) {
  return (
    <div role="separator" aria-label="Início das mensagens não lidas" className={`vc-conversation-unread ${className}`}>
      <span>Não lidas</span>
    </div>
  )
}

function SkeletonStack() {
  return (
    <div className="vc-conversation-skeleton" role="status" aria-label="Carregando mensagens">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} aria-hidden>
          <span className="vc-conversation-skeleton__avatar" />
          <span className="vc-conversation-skeleton__copy"><i /><i /><i /></span>
        </div>
      ))}
    </div>
  )
}

function EmptyHint({ text, compact, filtered }) {
  const Icon = filtered ? SearchX : MessageSquare
  return (
    <div className={`vc-conversation-empty ${compact ? 'is-compact' : ''}`}>
      <span className="vc-conversation-empty__icon"><Icon size={22} aria-hidden /></span>
      <strong>{filtered ? 'Nada por aqui' : 'A conversa começa aqui'}</strong>
      <p>{text}</p>
    </div>
  )
}
