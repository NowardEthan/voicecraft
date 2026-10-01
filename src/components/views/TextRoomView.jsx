/**
 * TextRoomView — top-level orchestrator for a conversation Sala.
 *
 * Layout follows the chat mockup: flat header, Discord-style feed,
 * composer. This component is intentionally thin: it wires data
 * (channel → chat hook, typing tracker, density prefs) and delegates
 * rendering to dedicated shells:
 *
 *   <ChatShell>          ← root flex column + bg + tokens
 *     <ChatHeader>       ← title, search, actions (own state)
 *     <MessageList>      ← scroller + bubbles + typing indicator
 *     <Composer>         ← input (its own shell)
 *     <ImageLightbox>    ← optional overlay
 *   </ChatShell>
 *
 * Compatibility: AppShell imports this as default and uses the same
 * prop names. The internal name `ConversationRoom` is preserved only
 * for grep-friendliness.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MessageList, { messageMatchesSearch, resolveChatAuthor } from './MessageList'
import Composer from './Composer'
import ChatHeader from './ChatHeader'
import TopicCardsRow from './TopicCardsRow'
import ImageLightbox from './ImageLightbox'
import { readChatDensity, writeChatDensity, resolveChatDensity } from './chatDensity'
import { getFrequentReactions } from '../../shared/firebase/frequentReactions'
import { useChat } from '../../hooks/useChat'
import { useTextRoomChannel } from '../../hooks/useTextRoomChannel'
import { purposeOf } from '../../features/rooms'
import { roomAccentColor } from '../../features/rooms/components/RoomIconMark'
import { resolveLabeledNameStyle } from '../../features/rooms/model/roomCosmetics'
import { colorFromId, spaceTokens } from '../../features/spaces'
import {
  attachComposerTyping,
  makeTypingTracker,
  subscribeTyping,
} from '../../features/chat/typing'
import { CommandsPanel } from '../../features/chat/commands'
import { useScheduledAnnouncePublisher } from '../../features/chat/useScheduledAnnouncePublisher'
import { normalizeLobby } from '../../features/chat/lobbySchema'
import {
  normalizeRules,
  memberAcceptedRules,
  isRulesRoom,
} from '../../features/chat/rulesSchema'
import { RulesCard } from '../../features/chat/RulesCards'
import { flashToast } from '../../shared/utils/toast'
import { Lock } from 'lucide-react'
import { setLastRead } from '../../features/notifications/unreadStore'
import { useNotifications } from '../../features/notifications'
import { collectMessageMediaUrls, warmImages } from '../../shared/media/imageWarm'

export default function TextRoomView({
  room,
  space,
  signaling,
  currentUserId,
  currentUserName,
  members = [],
  onClose,
  onInvite,
  onSelectRoom, // optional — falls back to window.__vcSelectRoom when absent
  voiceActive = false,
  canModerateChat = false,
  canKick = false,
  // Future thread panel hook. No thread control is rendered until backend support exists.
  onOpenThread = null,
}) {
  const purpose = purposeOf(room)
  const accent = roomAccentColor(room)
  const nameStyle = resolveLabeledNameStyle({
    nameStyle: room?.nameStyle,
    fontId: room?.fontId,
    fonts: space?.fonts,
  })

  const { channel } = useTextRoomChannel({
    signaling,
    roomId: room?.id,
    currentUserId,
    roomCreatedBy: room?.createdBy,
    // Firestore chat works without DataChannel; avoid stealing voice signals.
    enabled: !voiceActive,
  })

  const roomKey = room ? `${space?.id || 'nospace'}:${room.id}` : null
  const currentRoomKeyRef = useRef(roomKey)
  currentRoomKeyRef.current = roomKey

  const selfMember = useMemo(
    () => members.find((m) => m.userId === currentUserId) || null,
    [members, currentUserId],
  )

  const notifications = useNotifications()

  const chat = useChat({
    channel,
    signaling,
    username: selfMember?.displayName || currentUserName || 'você',
    roomKey,
    spaceId: space?.id || null,
    roomId: room?.id || null,
    userId: currentUserId,
    authorProfile: {
      displayName: selfMember?.displayName || currentUserName || 'você',
      handle: selfMember?.handle || '',
      photoURL: selfMember?.photoURL || '',
    },
  })

  const authorColors = useMemo(() => {
    const map = new Map()
    if (currentUserName) map.set('__me__', colorFromId(currentUserId || 'me'))
    for (const m of chat.messages) {
      const k = m.direction === 'out' ? '__me__' : (m.author || 'peer')
      if (!map.has(k)) map.set(k, colorFromId(k))
    }
    return map
  }, [chat.messages, currentUserId, currentUserName])

  const onlineMembers = useMemo(() => members.filter((m) => m.online), [members])

  const [replyTo, setReplyTo] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [density, setDensity] = useState(readChatDensity)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [jumpToId, setJumpToId] = useState(null)
  const [jumpTick, setJumpTick] = useState(0)
  const lastSendAtByRoomRef = useRef(new Map())
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFilters, setSearchFilters] = useState({ authorId: '', attachments: false, pinned: false, period: 'all' })
  const [searchIndex, setSearchIndex] = useState(-1)
  const [readTick, setReadTick] = useState(0)
  const [commandTarget, setCommandTarget] = useState(null)

  useEffect(() => {
    setReplyTo(null)
    setEditingMessage(null)
    textStateRef.current = ''
    setSearchOpen(false)
    setSearchQuery('')
    setSearchFilters({ authorId: '', attachments: false, pinned: false, period: 'all' })
    setSearchIndex(-1)
    setCommandTarget(null)
    setCommandsOpen(false)
  }, [roomKey])

  const chatLocked = !!room?.chatLocked
  const slowModeSeconds = Math.max(0, Number(room?.slowModeSeconds) || 0)
  const composerLocked = chatLocked && !canModerateChat

  useScheduledAnnouncePublisher({
    signaling,
    roomId: room?.id,
    enabled: canModerateChat && !!room?.id,
  })

  const feedMessages = useMemo(() => {
    const lobby = normalizeLobby(room?.lobby)
    const list = Array.isArray(chat.messages) ? chat.messages : []
    if (!lobby.enabled) return list
    return list.map((m) => {
      if (m?.kind === 'lobby_event' || m?.lobbyEvent) {
        return { ...m, lobbyAccent: m.lobbyAccent || lobby.accent }
      }
      return m
    })
  }, [chat.messages, room?.lobby])

  const hasSearchCriteria = !!(
    searchQuery.trim()
    || searchFilters.authorId
    || searchFilters.attachments
    || searchFilters.pinned
    || searchFilters.period !== 'all'
  )
  const searchMatches = useMemo(() => {
    if (!searchOpen || !hasSearchCriteria) return []
    return feedMessages.filter((message) => messageMatchesSearch(message, searchQuery, { ...searchFilters, currentUserId }))
  }, [feedMessages, searchOpen, hasSearchCriteria, searchQuery, searchFilters, currentUserId])

  const searchAuthors = useMemo(() => {
    const map = new Map()
    for (const message of feedMessages) {
      if (!message || message.deleted || message.kind === 'sys') continue
      const author = resolveChatAuthor(message, members, currentUserId, currentUserName)
      const id = String(author.userId || message.authorId || message.author || '')
      if (id && !map.has(id)) map.set(id, { id, label: author.displayName || message.author || id })
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [feedMessages, members, currentUserId, currentUserName])

  useEffect(() => {
    setSearchIndex((index) => {
      if (!searchMatches.length) return -1
      if (index < 0) return -1
      return index >= searchMatches.length ? searchMatches.length - 1 : index
    })
  }, [searchMatches.length])

  const jumpSearch = useCallback((delta) => {
    if (!searchMatches.length) return
    const next = searchIndex < 0
      ? (delta < 0 ? searchMatches.length - 1 : 0)
      : (searchIndex + delta + searchMatches.length) % searchMatches.length
    setSearchIndex(next)
    const target = searchMatches[next]
    setJumpToId(target.id || target.firestoreId)
    setJumpTick((tick) => tick + 1)
  }, [searchMatches, searchIndex])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchFilters({ authorId: '', attachments: false, pinned: false, period: 'all' })
    setSearchIndex(-1)
  }, [])

  // Decode announce / lobby / attachment bitmaps before paint (kills black remount).
  useEffect(() => {
    const urls = collectMessageMediaUrls(feedMessages)
    const lobby = normalizeLobby(room?.lobby)
    if (lobby?.banner) urls.push(lobby.banner)
    if (lobby?.iconImage) urls.push(lobby.iconImage)
    const rules = normalizeRules(room?.rules)
    if (rules?.banner) urls.push(rules.banner)
    if (rules?.iconImage) urls.push(rules.iconImage)
    if (!urls.length) return undefined
    warmImages(urls, { concurrency: 6 }).catch(() => {})
    return undefined
  }, [feedMessages, room?.lobby, room?.rules])

  const rulesCfg = useMemo(() => normalizeRules(room?.rules), [room?.rules])
  const rulesActive = isRulesRoom(room)
  const rulesAccepted = useMemo(
    () => memberAcceptedRules(selfMember, rulesCfg),
    [selfMember, rulesCfg],
  )
  const [acceptingRules, setAcceptingRules] = useState(false)

  const handleAcceptRules = useCallback(async () => {
    if (!signaling || acceptingRules || rulesAccepted) return
    setAcceptingRules(true)
    try {
      await signaling.acceptSpaceRules(space?.id, rulesCfg.version)
      flashToast('Regras aceitas — Space liberado')
    } catch (err) {
      flashToast(err?.message || 'Falha ao aceitar regras')
    } finally {
      setAcceptingRules(false)
    }
  }, [signaling, acceptingRules, rulesAccepted, space?.id, rulesCfg.version])

  /* Typing indicator wiring (one tracker per room, shared with MessageList) */
  const typingTrackerRef = useRef(null)
  if (!typingTrackerRef.current) typingTrackerRef.current = makeTypingTracker()
  const typingTracker = typingTrackerRef.current
  const textStateRef = useRef('')

  useEffect(() => {
    if (!channel || !currentUserId) return undefined
    const resolvePeerName = (peerId, message) => {
      const peer = members.find((member) => String(member.userId) === String(peerId))
      return peer?.displayName || message?.name || 'alguém'
    }
    const unsubMsg = subscribeTyping(channel, currentUserId, typingTracker, resolvePeerName)
    const detached = attachComposerTyping(channel, () => textStateRef.current, {
      userId: currentUserId,
      name: selfMember?.displayName || currentUserName || 'você',
    })
    return () => { unsubMsg(); detached() }
  }, [channel, currentUserId, typingTracker, selfMember, currentUserName, members])

  const togglePin = useCallback(async (msgId) => {
    try {
      const target = (chat.messages || []).find((m) => m.id === msgId || m.firestoreId === msgId)
      const willPin = !target?.pinned
      await chat.togglePin(msgId)
      flashToast(willPin ? 'Mensagem fixada' : 'Mensagem desafixada')
    } catch (err) {
      flashToast(err?.message || 'Não deu para fixar a mensagem')
    }
  }, [chat])

  const handleJumpToPinned = useCallback((msgId) => {
    setJumpToId(msgId)
    setJumpTick((n) => n + 1)
  }, [])

  const pinnedMessages = useMemo(
    () => (feedMessages || []).filter((m) => m?.pinned && !m.deleted),
    [feedMessages],
  )

  const topicSourceMessages = useMemo(() => {
    const list = feedMessages || []
    return list.filter((m) => m && !m.deleted && (m.kind === 'announce' || m.announce))
  }, [feedMessages])

  const handleReply = useCallback((msg) => {
    setEditingMessage(null)
    if (!msg?.id && !msg?.firestoreId) return
    const author = resolveChatAuthor(msg, members, currentUserId, currentUserName)
    setReplyTo({
      id: msg.id || msg.firestoreId,
      firestoreId: msg.firestoreId || null,
      author: author?.displayName || msg.author || 'alguém',
      authorHandle: author?.handle || msg.authorHandle || '',
      authorId: msg.authorId || author?.userId || null,
      text: msg.deleted ? '' : (msg.text || ''),
      attachment: msg.attachment || msg.attachments?.[0] || null,
      attachments: msg.attachments,
      deleted: !!msg.deleted,
    })
  }, [members, currentUserId, currentUserName])

  const handleCancelReply = useCallback(() => setReplyTo(null), [])

  const handleMarkUnread = useCallback((message) => {
    if (!message?.ts || !space?.id || !room?.id) return
    setLastRead(currentUserId, space.id, room.id, { at: Math.max(0, Number(message.ts) - 1), id: null })
    notifications.refreshInbox()
    setReadTick((tick) => tick + 1)
    setJumpToId(message.id || message.firestoreId)
    setJumpTick((tick) => tick + 1)
    flashToast('Marcado como não lido a partir daqui')
  }, [currentUserId, space?.id, room?.id, notifications])

  const resolveMentions = useCallback((ids = []) => {
    const wanted = new Set(ids.map(String))
    return members
      .filter((member) => member?.userId && wanted.has(String(member.userId)))
      .map((member) => ({ userId: String(member.userId), handle: member.handle || '', displayName: member.displayName || '' }))
  }, [members])

  const handleSubmit = useCallback(async ({ text, attachment, attachments, replyToId, mentionUserIds = [], operationRoomKey = roomKey } = {}) => {
    const stillInOriginRoom = () => currentRoomKeyRef.current === operationRoomKey
    if (chatLocked && !canModerateChat) {
      flashToast('Sala trancada')
      return false
    }
    const mentions = resolveMentions(mentionUserIds)
    if (editingMessage) {
      const ok = await chat.editMessage(editingMessage.id || editingMessage.firestoreId, text, mentions)
      if (ok && stillInOriginRoom()) setEditingMessage(null)
      return ok
    }
    if (slowModeSeconds > 0 && !canModerateChat) {
      const waitMs = slowModeSeconds * 1000
      const lastSendAt = lastSendAtByRoomRef.current.get(operationRoomKey) || 0
      const elapsed = Date.now() - lastSendAt
      if (lastSendAt && elapsed < waitMs) {
        flashToast(`Slowmode: aguarde ${Math.ceil((waitMs - elapsed) / 1000)}s`)
        return false
      }
    }
    const ok = await chat.sendMessage({ text, attachment, attachments, replyToId, mentions })
    if (ok) {
      lastSendAtByRoomRef.current.set(operationRoomKey, Date.now())
      if (stillInOriginRoom()) setReplyTo(null)
    }
    return ok
  }, [chat, chatLocked, canModerateChat, slowModeSeconds, editingMessage, resolveMentions])
  const handleRetry = useCallback((msgId) => chat.retry(msgId), [chat])

  const handleComposerTextChange = useCallback((next) => {
    textStateRef.current = next
  }, [])

  /* Room mention click (CONTRATO_FASE2) — navigate to the named Sala in
   * the current Space. We use the prop callback when provided (the
   * hosted AppShell wires this in), otherwise fall back to a
   * window-namespace callback so room mentions still work in tests and
   * embedded contexts.                                            */
  const handleRoomMention = useCallback((targetRoom) => {
    if (!targetRoom || !targetRoom.id) return
    if (typeof onSelectRoom === 'function') {
      try { onSelectRoom(targetRoom); return } catch {}
    }
    if (typeof window !== 'undefined' && typeof window.__vcSelectRoom === 'function') {
      try { window.__vcSelectRoom(targetRoom); return } catch {}
    }
    flashToast('essa sala não tá disponível aqui')
  }, [onSelectRoom])

  /* ArrowUp on empty composer → edit last own message */
  const handleArrowUpEditLast = useCallback(() => {
    const list = chat.messages || []
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      if (!m || m.deleted || m.kind === 'sys') continue
      if (m.direction !== 'out' && m.authorId !== currentUserId) continue
      if (m.status === 'sending') continue
      setReplyTo(null)
      setEditingMessage(m)
      break
    }
  }, [chat.messages, currentUserId])

  const tokens = useMemo(() => spaceTokens(space), [space])
  const quickReactions = useMemo(() => getFrequentReactions(), [])

  if (!room) return null

  const handleInviteClick = () => {
    if (onInvite) onInvite(room)
  }

  const onlineCount = onlineMembers.length

  return (
    <div
      className="vc-conversation-root h-full w-full flex flex-col min-h-0 relative overflow-hidden"
      data-conversation-density={density}
      style={tokens}
    >
      <ChatHeader
        room={room}
        accent={accent}
        nameStyle={nameStyle}
        onlineMembers={onlineMembers}
        currentUserId={currentUserId}
        onlineCount={onlineCount}
        chatLocked={chatLocked}
        density={density}
        onDensityChange={(next) => {
          const key = writeChatDensity(next)
          setDensity(key)
          flashToast(`Densidade: ${resolveChatDensity(key).shortLabel}`)
        }}
        onInvite={handleInviteClick}
        onClose={onClose}
        pinnedMessages={pinnedMessages}
        members={members}
        canModerate={canModerateChat}
        onJumpToPinned={handleJumpToPinned}
        onUnpinMessage={togglePin}
        notificationKey={roomKey}
        commandsOpen={commandsOpen}
        onToggleCommands={() => {
          if (commandsOpen) setCommandsOpen(false)
          else { setCommandTarget(null); setCommandsOpen(true) }
        }}
        search={{
          open: searchOpen,
          onOpen: () => setSearchOpen(true),
          query: searchQuery,
          onQueryChange: (value) => { setSearchQuery(value); setSearchIndex(-1) },
          onClose: closeSearch,
          matchCount: searchMatches.length,
          activeIndex: searchMatches.length ? searchIndex : -1,
          onNext: () => jumpSearch(1),
          onPrevious: () => jumpSearch(-1),
          filters: searchFilters,
          onFiltersChange: (value) => { setSearchFilters(value); setSearchIndex(-1) },
          authors: searchAuthors,
        }}
      />

      <TopicCardsRow
        messages={topicSourceMessages}
        accent={accent}
        onJump={handleJumpToPinned}
      />

      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <MessageList
            messages={feedMessages}
            loading={!chat.historyReady}
            currentUserName={currentUserName}
            currentUserId={currentUserId}
            authorColors={authorColors}
            roomKey={roomKey}
            onRetry={handleRetry}
            onCopy={chat.copyMessageText}
            onCancel={chat.cancelOutbox}
            onImageClick={(imagesOrUrl, index = 0) => {
              if (Array.isArray(imagesOrUrl)) setLightbox({ images: imagesOrUrl, index })
              else if (imagesOrUrl) setLightbox({ images: [imagesOrUrl], index: 0 })
            }}
            emptyHint="Nenhuma mensagem ainda. Mande a primeira."
            query={searchOpen ? searchQuery : ''}
            searchFilters={searchOpen ? searchFilters : null}
            onReply={handleReply}
            onToggleReaction={chat.toggleReaction}
            onToggleLike={chat.toggleLike}
            quickReactions={quickReactions}
            onEdit={(id) => {
              const message = chat.messages.find((item) => item.id === id || item.firestoreId === id)
              if (message) { setReplyTo(null); setEditingMessage(message) }
            }}
            onDelete={(id) => chat.deleteMessage(id, { moderate: canModerateChat })}
            canModerate={canModerateChat}
            members={members}
            density={density}
            onTogglePin={togglePin}
            typingTracker={typingTracker}
            allRooms={space?.rooms || []}
            onRoomMention={handleRoomMention}
            jumpToId={jumpToId}
            jumpTick={jumpTick}
            canPinAll={canModerateChat}
            onMarkUnread={handleMarkUnread}
            onReadCursorChange={notifications.refreshInbox}
            readTick={readTick}
            onOpenThread={onOpenThread}
            listHeader={rulesActive ? (
              <div className="pb-1">
                <RulesCard
                  rules={rulesCfg}
                  spaceName={space?.name || ''}
                  memberCount={space?.memberCount || members.length}
                  accepted={rulesAccepted}
                  accepting={acceptingRules}
                  onAccept={handleAcceptRules}
                  showAccept
                />
              </div>
            ) : null}
          />
        </div>

        <CommandsPanel
          open={commandsOpen}
          onClose={() => { setCommandsOpen(false); setCommandTarget(null) }}
          canModerateChat={canModerateChat}
          canKick={canKick}
          members={members}
          chat={chat}
          space={space}
          room={room}
          signaling={signaling}
          currentUserId={currentUserId}
          initialCommandId={commandTarget}
        />
      </div>

      {composerLocked ? (
        <ChannelLockedBanner channelName={room.name} />
      ) : (
        <>
          {chatLocked && canModerateChat && (
            <div className="shrink-0 px-3 sm:px-6 pb-1.5">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--vc-warning)]/25 bg-[var(--vc-warning)]/[0.08] px-3 py-2">
                <Lock size={13} className="text-[var(--vc-warning)] shrink-0" />
                <p className="text-[11.5px] text-ink leading-snug">
                  Sala trancada — só moderadores podem enviar mensagens.
                </p>
              </div>
            </div>
          )}
          <Composer
            placeholder={
              slowModeSeconds > 0 && !canModerateChat
                ? `Slowmode ${slowModeSeconds}s · ${room.name}…`
                : `Conversar em ${room.name}…`
            }
            accent={accent}
            channelName={room.name}
            disabled={false}
            spaceId={space?.id}
            roomId={room?.id}
            accountUid={currentUserId}
            onSubmit={handleSubmit}
            replyTo={replyTo}
            editingMessage={editingMessage}
            onCancelEdit={() => setEditingMessage(null)}
            onCancelReply={handleCancelReply}
            onArrowUpEditLast={handleArrowUpEditLast}
            onTextChange={handleComposerTextChange}
            members={members}
            rooms={space?.rooms || []}
            currentUserId={currentUserId}
            commandPermissions={{ canModerateChat, canKick }}
            onSlashCommand={(command) => {
              setCommandTarget(command.id)
              setCommandsOpen(true)
            }}
          />
        </>
      )}

      {lightbox?.images?.length ? (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index || 0}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  )
}

function ChannelLockedBanner({ channelName }) {
  return (
    <div className="relative z-20 shrink-0 px-3 sm:px-6 pb-3 sm:pb-4" role="status" aria-live="polite">
      <div className="vc-conversation-locked-card flex items-start gap-3 px-4 py-4 sm:px-5">
        <div className="vc-conversation-locked-icon">
          <Lock size={18} strokeWidth={2.1} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[13.5px] font-semibold text-strong">Sala trancada</div>
          <p className="text-[12px] text-muted leading-relaxed">
            <span className="text-ink">{channelName || 'Esta sala'}</span> está restrita a administradores.
            Só quem tem permissão para moderar a conversa pode enviar mensagens aqui.
          </p>
        </div>
      </div>
    </div>
  )
}
