/**
 * ChatHeader — top bar of a conversation room.
 *
 * Shell component: owns the search input toggle, the room title block,
 * the participant stack, and the right-side actions row. The
 * `searchOpen` state is internal so opening/closing the search field
 * does not require the parent to re-render the whole view.
 *
 * Visual breakdown:
 *   <header>
 *     <div flex>
 *       <div flex> room icon + name + purpose                  </div>
 *       {searchOpen ? <SearchInput /> : <Actions />}
 *     </div>
 *   </header>
 */
import { useEffect, useRef, useState } from 'react'
import { Search, X, Lock } from 'lucide-react'
import { RoomIconMark } from '../../features/rooms/components/RoomIconMark'
import { purposeOf } from '../../features/rooms'
import ParticipantStack from './ParticipantStack'
import ChatHeaderActions from './ChatHeaderActions'
import PinnedMessagesPanel from '../../features/chat/PinnedMessagesPanel'

export default function ChatHeader({
  room,
  accent,
  nameStyle,
  onlineMembers,
  currentUserId,
  onlineCount,
  chatLocked = false,
  density,
  onDensityChange,
  onInvite,
  onClose,
  pinnedMessages = [],
  members = [],
  canModerate = false,
  onJumpToPinned,
  onUnpinMessage,
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pinsOpen, setPinsOpen] = useState(false)
  const pinButtonRef = useRef(null)

  /* Sync external close (e.g. switching rooms) — when room changes,
   * reset search so we don't carry state across rooms.                */
  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery('')
    setPinsOpen(false)
  }, [room?.id])

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
  }

  const purpose = purposeOf(room)
  const pinCount = pinnedMessages.length

  return (
    <header className="@container vc-channel-header relative shrink-0 z-30 px-3 sm:px-6 py-3 sm:py-3.5">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="min-w-0 flex-1 flex items-center gap-2.5 sm:gap-3">
          <div
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              backgroundColor: accent,
              color: 'var(--vc-on-accent, #fff)',
            }}
          >
            <RoomIconMark room={room} size={20} />
          </div>

          <div className={`min-w-0 ${searchOpen ? 'hidden @[480px]:block flex-1' : 'flex-1'}`}>
            <h1 className="vc-channel-title text-[16px] sm:text-[20px] font-semibold tracking-tight truncate flex items-center gap-1.5">
              <span className="vc-channel-hash shrink-0" aria-hidden>#</span>
              <span
                className="vc-channel-name truncate"
                style={{ ...nameStyle, ...(accent ? { color: accent } : null) }}
              >
                {room.name}
              </span>
              {chatLocked && (
                <span
                  className="inline-flex items-center gap-1 shrink-0 h-5 px-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    color: 'var(--vc-warning, #f5b942)',
                    background: 'color-mix(in srgb, var(--vc-warning, #f5b942) 14%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--vc-warning, #f5b942) 28%, transparent)',
                  }}
                  title="Canal trancado — só moderadores enviam"
                >
                  <Lock size={10} strokeWidth={2.4} />
                  Trancado
                </span>
              )}
            </h1>
            <p className="text-[11px] sm:text-[12px] text-muted truncate mt-0.5 hidden @[380px]:block">
              {chatLocked
                ? 'Canal trancado · só moderadores podem enviar'
                : purpose.description}
            </p>
          </div>
        </div>

        {searchOpen ? (
          <ChatSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onClose={closeSearch}
          />
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

            <ChatHeaderActions
              accent={accent}
              density={density}
              onDensityChange={onDensityChange}
              onInvite={onInvite}
              onSearchClick={() => { setPinsOpen(false); setSearchOpen(true) }}
              onClose={onClose}
              pinCount={pinCount}
              pinsOpen={pinsOpen}
              onTogglePins={() => setPinsOpen((v) => !v)}
              pinButtonRef={pinButtonRef}
            />
          </>
        )}
      </div>

      <PinnedMessagesPanel
        open={pinsOpen && !searchOpen}
        onClose={() => setPinsOpen(false)}
        messages={pinnedMessages}
        members={members}
        currentUserId={currentUserId}
        canModerate={canModerate}
        accent={accent}
        onJump={onJumpToPinned}
        onUnpin={onUnpinMessage}
        anchorRef={pinButtonRef}
      />
    </header>
  )
}

/** Inline search input that takes the full width of the header bar.
 *  Auto-focuses on mount and resets on close.                         */
function ChatSearchInput({ value, onChange, onClose }) {
  /* Esc closes the search bar.                                        */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1 @[480px]:flex-none @[480px]:w-[min(280px,42vw)] px-3 h-9 rounded-full bg-surface1 border border-line focus-within:border-accent/50">
      <Search size={13} className="text-muted shrink-0" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar nesta conversa…"
        className="flex-1 min-w-0 bg-transparent text-[12.5px] text-strong placeholder:text-muted focus:outline-none"
      />
      <button
        type="button"
        onClick={onClose}
        className="text-muted hover:text-strong"
        aria-label="Fechar busca"
      >
        <X size={13} />
      </button>
    </div>
  )
}
