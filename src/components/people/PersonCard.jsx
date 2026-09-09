/**
 * PersonCard — the "rich" card for each member of a Space.
 *
 * Used in:
 *   - PeopleDirectory tab
 *   - VoiceRoom participant grid
 *
 * Visual states (driven by props):
 *   - online / offline   → dot color + name opacity
 *   - inRoom / roomName  → "em <roomName>" status line
 *   - inCurrentRoom      → Space-accent left rail bar
 *   - speaking           → --space-accent ring + breathing pulse
 *   - muted              → small mic-off badge over the avatar
 *   - isCreator          → role badge in the name row
 *
 * Click behavior: opens the ProfilePopover via the global helper so any
 * avatar anywhere can trigger it without prop-drilling. Caller can
 * override with `onClick` if they want a custom action.
 */
import {
  MicOff, Radio, MessageCircle, BookOpen, Gamepad2, Music, Crown,
} from 'lucide-react'
import { PersonAvatar } from '../../features/people'
import { PURPOSE_BY_KEY } from '../../features/rooms'

const PURPOSE_BADGE_ICON = {
  voice: Radio,
  conversation: MessageCircle,
  study: BookOpen,
  games: Gamepad2,
  music: Music,
}

export default function PersonCard({
  member,
  isSelf = false,
  isCreator = false,
  space = null,
  inCurrentRoom = false,
  speaking = false,
  muted = false,
  avatarSize = 40,
  onClick,
  hideStatus = false,
  title,
}) {
  if (!member) return null

  const online = !!member.online
  const inRoom = !!member.location?.roomId
  const roomName = member.roomName
  const name = member.displayName || 'convidado'

  const purposeOfRoom = inRoom
    ? (space?.rooms || []).find(r => r.id === member.location.roomId)
    : null
  const purpose = purposeOfRoom
    ? PURPOSE_BY_KEY[purposeOfRoom.purpose || (purposeOfRoom.type === 'voice' ? 'voice' : 'conversation')]
    : null
  const BadgeIcon = purpose ? PURPOSE_BADGE_ICON[purpose.key] || Radio : null

  // Left rail accent bar (DESIGN_SYSTEM §5).
  const railClass = inCurrentRoom
    ? 'bg-accent'
    : inRoom
      ? 'bg-accent/70'
      : online
        ? 'bg-positive'
        : 'bg-transparent'

  // Avatar ring: 2px --space-accent + breathing pulse when speaking.
  const avatarWrapClass = speaking
    ? 'ring-2 ring-[var(--space-accent)] shadow-[0_0_0_4px_var(--space-accent-glow-24)] vc-speaking-pulse'
    : 'ring-1 ring-black/40'

  const handleClick = onClick || ((e) => {
    e?.stopPropagation?.()
    if (typeof window !== 'undefined' && window.__vcOpenProfile) {
      window.__vcOpenProfile(member.userId)
    }
  })

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title || name}
      aria-label={isCreator ? `${name}, criador` : name}
      className="
        group relative flex items-center gap-3 w-full text-left
        pl-3 pr-3 py-2 rounded-card
        bg-surface1 hover:bg-surface2
        border border-line hover:border-line
        transition-all duration-200 hover:-translate-y-px
        focus:outline-none focus-visible:border-accent
      "
    >
      {/* Left accent rail */}
      <span
        className={
          `absolute left-0 top-2 bottom-2 w-[2px] rounded-r transition-all ` +
          `${railClass} ${inCurrentRoom || inRoom ? 'opacity-100' : 'opacity-0 group-hover:opacity-70'}`
        }
      />

      {/* Avatar */}
      <div className="relative shrink-0">
        <PersonAvatar
          src={member.photoURL}
          name={name}
          userId={member.userId}
          size={avatarSize}
          className={`shadow-sm transition-transform duration-200 group-hover:scale-105 ${avatarWrapClass}`}
        />

        {/* Online dot */}
        <span
          className={
            `absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-panel ` +
            (online ? 'bg-positive' : 'bg-line')
          }
          style={{ width: 11, height: 11 }}
        />

        {/* In-room purpose badge */}
        {inRoom && BadgeIcon && (
          <div
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-panel flex items-center justify-center shadow-sm"
            style={{ backgroundColor: purpose?.color || 'var(--space-accent)' }}
            title={purpose?.label || 'em sala'}
          >
            <BadgeIcon size={8} className="text-strong" strokeWidth={3} />
          </div>
        )}

        {/* Muted indicator */}
        {muted && (
          <div
            className="absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full bg-danger border-2 border-panel flex items-center justify-center shadow-sm"
            title="microfone desligado"
          >
            <MicOff size={8} className="text-strong" strokeWidth={3} />
          </div>
        )}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={
              'text-[13px] font-semibold truncate transition-colors ' +
              (online ? 'text-strong' : 'text-muted')
            }
          >
            {name}
          </span>
          {isSelf && (
            <span className="text-[9px] font-bold px-1 py-px rounded bg-accent-soft text-accent uppercase tracking-wider shrink-0">
              você
            </span>
          )}
          {isCreator && (
            <span
              className="inline-flex items-center gap-0.5 px-1 py-px rounded bg-warning/15 text-warning text-[9px] font-bold uppercase tracking-wider shrink-0"
              title="Criador do Space"
            >
              <Crown size={8} strokeWidth={2.5} />
              criador
            </span>
          )}
        </div>
        {!hideStatus && (
          <p className="text-[10.5px] truncate leading-tight mt-0.5">
            {inRoom ? (
              <span className="text-ink/65">
                em <span className="text-accent font-medium">{roomName || 'sala'}</span>
              </span>
            ) : (
              <span className={online ? 'text-muted' : 'text-muted/70'}>
                {online ? 'online' : 'offline'}
              </span>
            )}
          </p>
        )}
      </div>
    </button>
  )
}
