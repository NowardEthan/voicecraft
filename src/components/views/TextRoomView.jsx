/**
 * ConversationRoom — full-page view of a conversation Sala.
 * Layout follows the chat mockup: flat header, Discord-style feed, composer.
 */
import { useCallback, useMemo, useState, useEffect } from 'react'
import { UserPlus, Search, MoreHorizontal, X } from 'lucide-react'
import MessageList from './MessageList'
import Composer from './Composer'
import ChatDensityMenu from './ChatDensityMenu'
import { readChatDensity, writeChatDensity } from './chatDensity'
import { useChat } from '../../hooks/useChat'
import { useTextRoomChannel } from '../../hooks/useTextRoomChannel'
import { purposeOf } from '../../features/rooms'
import { RoomIconMark, roomAccentColor } from '../../features/rooms/components/RoomIconMark'
import { resolveRoomNameStyle } from '../../features/rooms/model/roomCosmetics'
import { colorFromId, spaceTokens } from '../../features/spaces'
import { PersonAvatar } from '../../features/people'

export default function ConversationRoom({
  room,
  space,
  signaling,
  currentUserId,
  currentUserName,
  members = [],
  onClose,
  onInvite,
  voiceActive = false,
}) {
  const purpose = purposeOf(room)
  const accent = roomAccentColor(room)
  const nameStyle = resolveRoomNameStyle(room?.nameStyle).style

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

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [lightbox, setLightbox] = useState(null)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [density, setDensity] = useState(readChatDensity)

  useEffect(() => {
    if (!headerMenuOpen) return
    const onDown = (e) => {
      if (e.target.closest?.('[data-header-menu]')) return
      setHeaderMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [headerMenuOpen])

  const handleSubmit = useCallback(async ({ text, attachment, replyToId }) => {
    return chat.sendMessage({ text, attachment, replyToId })
  }, [chat])

  const handleRetry = useCallback((msgId) => chat.retry(msgId), [chat])

  const handleReply = useCallback((msg) => {
    setReplyTo({
      id: msg.id,
      author: msg.author,
      text: msg.text,
      attachment: msg.attachment,
      deleted: msg.deleted,
    })
  }, [])

  const handleCancelReply = useCallback(() => setReplyTo(null), [])

  const tokens = useMemo(() => spaceTokens(space), [space])

  if (!room) return null

  const handleInviteClick = () => {
    if (onInvite) onInvite(room)
  }

  const onlineCount = onlineMembers.length

  return (
    <div
      className="h-full w-full flex flex-col min-h-0 bg-canvas relative overflow-hidden"
      style={tokens}
    >
      <header
        className="@container relative shrink-0 z-20 px-3 sm:px-6 py-3 sm:py-3.5 border-b border-white/[0.06]"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--space-accent) 20%, #15171d) 0%, color-mix(in srgb, var(--space-accent) 6%, #12141a) 70%, #12141a 100%)',
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`,
              color: accent,
            }}
          >
            <RoomIconMark room={room} size={20} />
          </div>

          <div className={`min-w-0 ${searchOpen ? 'hidden @[480px]:block flex-1' : 'flex-1'}`}>
            <h1
              className="text-[16px] sm:text-[20px] font-bold text-strong tracking-tight truncate"
              style={{ ...nameStyle, ...(room?.color ? { color: accent } : null) }}
            >
              {room.name}
            </h1>
            <p className="text-[11px] sm:text-[12px] text-muted truncate mt-0.5 hidden @[380px]:block">
              {purpose.description}
            </p>
          </div>

          {searchOpen ? (
            <div className="flex items-center gap-2 min-w-0 flex-1 @[480px]:flex-none @[480px]:w-[min(280px,42vw)] px-3 h-9 rounded-full bg-surface1 border border-line focus-within:border-accent/50">
              <Search size={13} className="text-muted shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar nesta conversa…"
                className="flex-1 min-w-0 bg-transparent text-[12.5px] text-strong placeholder:text-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                className="text-muted hover:text-strong"
                aria-label="Fechar busca"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              <div className="hidden @[640px]:flex items-center gap-2.5 shrink-0">
                <ParticipantStack members={onlineMembers} selfId={currentUserId} />
                {onlineCount > 0 && (
                  <span className="text-[12px] text-muted tabular-nums whitespace-nowrap">
                    {onlineCount} online
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors shrink-0"
                title="Buscar"
                aria-label="Buscar nesta conversa"
              >
                <Search size={16} strokeWidth={1.75} />
              </button>
            </>
          )}

          <div className="hidden @[520px]:block shrink-0">
            <ChatDensityMenu
              value={density}
              onChange={(next) => {
                setDensity(next)
                writeChatDensity(next)
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleInviteClick}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors shrink-0"
            title="Convidar pessoas"
            aria-label="Convidar pessoas pra essa sala"
          >
            <UserPlus size={16} strokeWidth={1.75} />
          </button>

          <div className="relative shrink-0" data-header-menu>
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((o) => !o)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors"
              title="Mais"
              aria-label="Mais opções"
              aria-expanded={headerMenuOpen}
            >
              <MoreHorizontal size={16} strokeWidth={1.75} />
            </button>
            {headerMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-44 py-1 rounded-xl bg-surface1 border border-line shadow-2xl vc-anim-fade-in-up">
                <button
                  type="button"
                  onClick={() => {
                    const next = density === 'compact' ? 'comfy' : 'compact'
                    setHeaderMenuOpen(false)
                    setDensity(next)
                    writeChatDensity(next)
                  }}
                  className="w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-surface2 hover:text-strong @[520px]:hidden"
                >
                  Densidade: {density === 'compact' ? 'Compacta' : 'Confortável'}
                </button>
                <button
                  type="button"
                  onClick={() => { setHeaderMenuOpen(false); onClose?.() }}
                  className="w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-surface2 hover:text-strong"
                >
                  Fechar sala
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        <MessageList
          messages={chat.messages}
          currentUserName={currentUserName}
          currentUserId={currentUserId}
          authorColors={authorColors}
          roomKey={roomKey}
          onRetry={handleRetry}
          onImageClick={(url) => setLightbox(url)}
          emptyHint="Nenhuma mensagem ainda. Mande a primeira."
          query={searchQuery}
          onReply={handleReply}
          onToggleReaction={chat.toggleReaction}
          onEdit={chat.editMessage}
          onDelete={chat.deleteMessage}
          members={members}
          density={density}
        />
      </div>

      <Composer
        placeholder={`Conversar em ${room.name}`}
        onSubmit={handleSubmit}
        replyTo={replyTo}
        onCancelReply={handleCancelReply}
      />

      {lightbox && (
        <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}

function ParticipantStack({ members, selfId }) {
  const shown = members.slice(0, 3)
  const rest = members.length - shown.length
  const openProfile = (userId) => {
    if (typeof window !== 'undefined' && window.__vcOpenProfile) {
      window.__vcOpenProfile(userId)
    }
  }
  return (
    <div className="flex -space-x-1.5">
      {shown.map(m => (
        <button
          key={m.userId}
          type="button"
          onClick={(e) => { e.stopPropagation(); openProfile(m.userId) }}
          className="rounded-full ring-2 ring-[#12141a] transition-transform hover:scale-125 hover:z-10"
          title={m.displayName || (m.userId === selfId ? 'você' : 'convidado')}
        >
          <PersonAvatar src={m.photoURL} name={m.displayName} userId={m.userId} size={26} />
        </button>
      ))}
      {rest > 0 && (
        <div className="w-7 h-7 rounded-full ring-2 ring-[#12141a] bg-surface2 text-muted text-[10px] font-semibold flex items-center justify-center">
          +{rest}
        </div>
      )}
    </div>
  )
}

function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 vc-anim-fade-in cursor-zoom-out"
      role="dialog"
      aria-modal="true"
      aria-label="Imagem ampliada"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 border border-white/15 text-strong hover:bg-black/70 flex items-center justify-center"
        aria-label="Fechar"
        title="Fechar"
      >
        <X size={16} />
      </button>
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl cursor-default"
      />
    </div>
  )
}

