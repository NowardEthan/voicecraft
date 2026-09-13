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
import MessageList from './MessageList'
import Composer from './Composer'
import ChatHeader from './ChatHeader'
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
import { CommandsFab, CommandsPanel } from '../../features/chat/commands'
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

  const selfMember = useMemo(
    () => members.find((m) => m.userId === currentUserId) || null,
    [members, currentUserId],
  )

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
  const [lightbox, setLightbox] = useState(null)
  const [density, setDensity] = useState(readChatDensity)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [jumpToId, setJumpToId] = useState(null)
  const [jumpTick, setJumpTick] = useState(0)
  const lastSendAtRef = useRef(0)

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
    const peerName = selfMember?.displayName || currentUserName || 'peer'
    const unsubMsg = subscribeTyping(channel, currentUserId, typingTracker, peerName)
    const detached = attachComposerTyping(channel, () => textStateRef.current)
    return () => { unsubMsg(); detached() }
  }, [channel, currentUserId, typingTracker, selfMember, currentUserName])

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

  const handleSubmit = useCallback(async ({ text, attachment, replyToId }) => {
    if (chatLocked && !canModerateChat) {
      flashToast('Canal trancado')
      return false
    }
    if (slowModeSeconds > 0 && !canModerateChat) {
      const waitMs = slowModeSeconds * 1000
      const elapsed = Date.now() - lastSendAtRef.current
      if (lastSendAtRef.current && elapsed < waitMs) {
        const left = Math.ceil((waitMs - elapsed) / 1000)
        flashToast(`Slowmode: aguarde ${left}s`)
        return false
      }
    }
    const ok = await chat.sendMessage({ text, attachment, replyToId })
    if (ok) lastSendAtRef.current = Date.now()
    return ok
  }, [chat, chatLocked, canModerateChat, slowModeSeconds])

  const handleRetry = useCallback((msgId) => chat.retry(msgId), [chat])

  const handleReply = useCallback((msg) => {
    setReplyTo({
      id: msg.id,
      author: msg.author,
      authorHandle: msg.authorHandle || '',
      text: msg.text,
      attachment: msg.attachment,
      deleted: msg.deleted,
    })
  }, [])

  const handleCancelReply = useCallback(() => setReplyTo(null), [])

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
      chat.editMessage(m.id, m.text || '')
      break
    }
  }, [chat, currentUserId])

  const tokens = useMemo(() => spaceTokens(space), [space])

  if (!room) return null

  const handleInviteClick = () => {
    if (onInvite) onInvite(room)
  }

  const onlineCount = onlineMembers.length

  const quickReactions = useMemo(() => getFrequentReactions(), [])

  return (
    <div
      className="h-full w-full flex flex-col min-h-0 bg-canvas relative overflow-hidden vc-chat-bg-decor"
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
      />

      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <MessageList
            messages={feedMessages}
            currentUserName={currentUserName}
            currentUserId={currentUserId}
            authorColors={authorColors}
            roomKey={roomKey}
            onRetry={handleRetry}
            onImageClick={(url) => setLightbox(url)}
            emptyHint="Nenhuma mensagem ainda. Mande a primeira."
            query=""
            onReply={handleReply}
            onToggleReaction={chat.toggleReaction}
            onToggleLike={chat.toggleLike}
            quickReactions={quickReactions}
            onEdit={chat.editMessage}
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

        <CommandsFab
          open={commandsOpen}
          onClick={() => setCommandsOpen((v) => !v)}
        />
        <CommandsPanel
          open={commandsOpen}
          onClose={() => setCommandsOpen(false)}
          canModerateChat={canModerateChat}
          canKick={canKick}
          members={members}
          chat={chat}
          space={space}
          room={room}
          signaling={signaling}
          currentUserId={currentUserId}
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
                  Canal trancado — só moderadores podem enviar mensagens.
                </p>
              </div>
            </div>
          )}
          <Composer
            placeholder={
              slowModeSeconds > 0 && !canModerateChat
                ? `Slowmode ${slowModeSeconds}s · #${room.name.toLowerCase().replace(/\s+/g, '-')}…`
                : `Conversar em #${room.name.toLowerCase().replace(/\s+/g, '-')}…`
            }
            accent={accent}
            channelName={room.name}
            disabled={false}
            onSubmit={async (payload) => {
              const ok = await handleSubmit(payload)
              textStateRef.current = ''
              return ok
            }}
            replyTo={replyTo}
            onCancelReply={handleCancelReply}
            onArrowUpEditLast={handleArrowUpEditLast}
            onTextChange={handleComposerTextChange}
            members={members}
            rooms={space?.rooms || []}
            currentUserId={currentUserId}
          />
        </>
      )}

      {lightbox && (
        <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

function ChannelLockedBanner({ channelName }) {
  const slug = String(channelName || 'canal')
    .toLowerCase()
    .replace(/\s+/g, '-')

  return (
    <div
      className="relative z-20 shrink-0 px-3 sm:px-6 pb-3 sm:pb-4"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-line bg-[#14171f] px-4 py-4 sm:px-5 sm:py-4.5 flex items-start gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background: 'color-mix(in srgb, var(--vc-warning, #f5b942) 16%, #1a1e28)',
            borderColor: 'color-mix(in srgb, var(--vc-warning, #f5b942) 35%, #2a303a)',
            color: 'var(--vc-warning, #f5b942)',
          }}
        >
          <Lock size={18} strokeWidth={2.1} />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-[13.5px] font-semibold text-strong">
            Canal trancado
          </div>
          <p className="text-[12px] text-muted leading-relaxed">
            <span className="text-ink">#{slug}</span> está restrito a administradores.
            Só quem tem permissão de moderar o chat pode enviar mensagens aqui.
          </p>
        </div>
      </div>
    </div>
  )
}
