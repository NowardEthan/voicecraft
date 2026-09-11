/**
 * MessageList — scrollable Discord-style feed with grouping, date
 * dividers, unread marker and smart auto-scroll.
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { ArrowDown, MessageSquare } from 'lucide-react'
import MessageBubble from './MessageBubble'
import { colorFromId } from '../../features/spaces'
import { resolveChatDensity } from './chatDensity'
import { getLastRead, setLastRead } from '../../features/notifications/unreadStore'

const STICK_THRESHOLD_PX = 100
const GROUP_BREAK_MS = 5 * 60 * 1000

function isOwnMessage(m, currentUserId, currentUserName) {
  if (m?.authorId && currentUserId) return m.authorId === currentUserId
  return m?.direction === 'out' || m?.author === currentUserName
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
  density = 'compacto',
}) {
  const scrollerRef = useRef(null)
  const [unseen, setUnseen] = useState(0)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [highlightId, setHighlightId] = useState(null)
  const [highlightTick, setHighlightTick] = useState(0)
  const highlightTimerRef = useRef(null)
  const lastLenRef = useRef(messages.length)
  const [lastReadTs] = useState(() => {
    const { spaceId, roomId } = parseRoomKey(roomKey)
    return getLastRead(currentUserId, spaceId, roomId).at || 0
  })
  const dens = resolveChatDensity(density)

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
      if (m.kind === 'sys') return true
      return String(m.text || '').toLowerCase().includes(q)
    })
  }, [messages, query])

  const rows = useMemo(() => {
    const groups = []
    for (let i = 0; i < filteredMessages.length; i++) {
      const m = filteredMessages[i]
      if (m.kind === 'sys') {
        groups.push({ kind: 'sys', message: m, key: m.id })
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
        && (m.ts - prev.ts) < GROUP_BREAK_MS
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

    const out = []
    let lastDay = null
    let unreadInserted = false
    for (const g of groups) {
      const first = g.kind === 'sys' ? g.message : g.items[0]
      const ts = first?.ts || 0
      const day = dayKey(ts)
      if (day !== lastDay) {
        out.push({ kind: 'day', key: `day-${day}`, label: formatDayLabel(ts) })
        lastDay = day
      }
      if (!unreadInserted && lastReadTs > 0 && ts > lastReadTs) {
        out.push({ kind: 'unread', key: 'unread' })
        unreadInserted = true
      }
      out.push(g)
    }
    return out
  }, [filteredMessages, currentUserName, currentUserId, authorColors, lastReadTs])

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className={'h-full overflow-y-auto ' + dens.listPy}
      >
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
            if (g.kind === 'sys') {
              return <MessageBubble key={g.key} msg={g.message} isMine={false} showHeader={false} density={density} />
            }
            return (
              <div key={g.key}>
                {g.items.map((m, idx) => (
                  <MessageBubble
                    key={m.id}
                    msg={m}
                    isMine={g.isMine}
                    showHeader={idx === 0}
                    isLast={idx === g.items.length - 1}
                    density={density}
                    onRetry={onRetry}
                    onImageClick={onImageClick}
                    onReply={onReply}
                    onToggleReaction={onToggleReaction}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    canModerate={canModerate}
                    author={resolveChatAuthor(m, members, currentUserId, currentUserName)}
                    replyTo={m.replyToId ? (messagesById.get(m.replyToId) || { id: m.replyToId, missing: true }) : null}
                    replyAuthor={m.replyToId ? resolveChatAuthor(messagesById.get(m.replyToId), members, currentUserId, currentUserName) : null}
                    highlighted={highlightId === m.id}
                    highlightTick={highlightTick}
                    onJumpToReply={jumpToMessage}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {unseen > 0 && (
        <button
          onClick={scrollToBottom}
          className="
            absolute right-3 sm:right-5 bottom-3 z-10 inline-flex items-center gap-1.5
            px-3 py-1.5 rounded-pill text-[11px] font-medium
            bg-accent text-strong shadow-lg shadow-accent/30
            hover:opacity-90 active:scale-95
            transition-all vc-anim-fade-in-up
          "
          style={{ animationDuration: '160ms' }}
        >
          <ArrowDown size={11} strokeWidth={2.5} />
          {unseen} {unseen === 1 ? 'mensagem nova' : 'mensagens novas'}
        </button>
      )}
    </div>
  )
}

function DayDivider({ label, className = 'px-4 sm:px-6 py-3' }) {
  return (
    <div className={'flex items-center gap-3 ' + className}>
      <div className="flex-1 h-px bg-white/[0.08]" />
      <span className="text-[11px] text-muted font-medium">{label}</span>
      <div className="flex-1 h-px bg-white/[0.08]" />
    </div>
  )
}

function UnreadDivider({ className = 'px-4 sm:px-6 py-2' }) {
  return (
    <div className={'flex items-center gap-3 ' + className}>
      <div className="flex-1 h-px bg-accent" />
      <span className="text-[11px] font-semibold text-accent whitespace-nowrap">Novas mensagens</span>
      <div className="flex-1 h-px bg-accent" />
    </div>
  )
}

function SkeletonStack() {
  return (
    <div className="space-y-5 px-4 sm:px-6 pt-2">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex gap-3 items-start">
          <div className="w-10 h-10 rounded-full vc-anim-shimmer" />
          <div className="flex-1 space-y-2 max-w-md">
            <div className="h-2.5 w-28 rounded vc-anim-shimmer" />
            <div className="h-3 w-full rounded vc-anim-shimmer" />
            <div className="h-3 w-3/4 rounded vc-anim-shimmer" />
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
