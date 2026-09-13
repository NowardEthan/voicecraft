/**
 * RoomCard — sala card shared between the panel "Visão geral" tab and the
 * main-area SpaceHome. Per DESIGN_SYSTEM §7.2:
 *   - Ícone + nome (no #)
 *   - Descrição (1 linha)
 *   - Pessoas (avatares empilhados + texto) quando ativo
 *   - Estado: ao vivo / vazia / mensagens novas
 *   - CTA dominante
 *
 * Variants:
 *   - "compact"  — small footprint, used in tight panel lists (default)
 *   - "featured" — larger card, used in "Acontecendo agora" main-area grid
 */
import { purposeOf } from '../../features/rooms'
import { PersonAvatar } from '../../features/people'

export function RoomCard({ room, members, currentUserId, onClick, variant = 'compact' }) {
  const purpose = purposeOf(room)
  const Icon = purpose.icon
  const present = members.filter(m => m.online && m.location?.roomId === room.id)
  const isLive = present.some(m => m.userId !== currentUserId)

  // State pill label + tone.
  let stateLabel = purpose.actionLabel
  let stateTone = 'accent'
  if (isLive) {
    stateLabel = 'ao vivo'
    stateTone = 'live'
  } else if (present.length > 0) {
    stateLabel = 'reunida'
    stateTone = 'muted'
  }

  if (variant === 'featured') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="
          group relative w-full text-left p-5 rounded-card
          border border-line bg-surface1
          hover:bg-surface2 hover:border-accent/40
          transition-all active:scale-[0.99]
          focus:outline-none focus-visible:border-accent
        "
      >
        {/* Soft accent glow on hover */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-card opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ background: 'radial-gradient(120% 80% at 0% 0%, var(--space-accent-soft) 0%, transparent 60%)' }}
        />

        <div className="relative flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: purpose.soft, color: purpose.color }}
          >
            <Icon size={22} strokeWidth={1.75} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-semibold text-strong truncate">
                {room.name}
              </p>
              {stateTone === 'live' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent text-[10.5px] font-semibold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
                  ao vivo
                </span>
              )}
            </div>
            <p className="text-[12.5px] text-muted mt-0.5 line-clamp-2">
              {purpose.description}
            </p>

            {present.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <AvatarStack members={present} size={20} />
                <span className="text-[11.5px] text-ink/80">
                  {present.length} {present.length === 1 ? 'pessoa aqui' : 'pessoas aqui'}
                </span>
              </div>
            )}
          </div>

          <span
            className={
              'inline-flex items-center px-3 py-1.5 rounded-pill text-[11px] font-semibold shrink-0 self-center transition-colors ' +
              (stateTone === 'live'
                ? 'bg-accent text-strong'
                : 'bg-accent-soft text-accent group-hover:bg-accent/25')
            }
          >
            {stateLabel}
          </span>
        </div>
      </button>
    )
  }

  // Compact — used in the panel tab.
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        group w-full text-left p-3 rounded-card
        border border-line bg-surface1
        hover:bg-surface2 hover:border-accent/40
        transition-all active:scale-[0.99]
        focus:outline-none focus-visible:border-accent
      "
    >
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: purpose.soft,
            color: purpose.color,
          }}
        >
          <Icon size={17} strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13.5px] font-semibold text-strong truncate">
              {room.name}
            </p>
            {stateTone === 'live' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent-soft text-accent text-[9.5px] font-semibold uppercase tracking-wider">
                <span className="w-1 h-1 rounded-full bg-accent animate-pulse-dot" />
                ao vivo
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-muted truncate mt-0.5">
            {purpose.description}
          </p>

          {present.length > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <AvatarStack members={present} size={18} />
              <span className="text-[10.5px] text-ink/75 truncate">
                {present.length} {present.length === 1 ? 'pessoa' : 'pessoas'} aqui
              </span>
            </div>
          )}
        </div>

        <span
          className={
            'inline-flex items-center px-2.5 py-1 rounded-lg text-[10.5px] font-semibold shrink-0 self-center transition-colors ' +
            (stateTone === 'live'
              ? 'bg-accent text-strong'
              : 'bg-accent-soft text-accent group-hover:bg-accent/25')
          }
        >
          {stateLabel}
        </span>
      </div>
    </button>
  )
}

// ----------------------------------------------------------------------
// SectionTitle — small uppercase label with optional icon, dot (live),
// and trailing slot (used for the "+ Criar sala" link).
// ----------------------------------------------------------------------
export function SectionTitle({ icon: Icon, label, trailing, live = false }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {live && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />}
      {Icon && <Icon size={12} className={live ? 'text-accent' : 'text-muted'} strokeWidth={1.75} />}
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/55">
        {label}
      </h3>
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  )
}

// ----------------------------------------------------------------------
// AvatarStack — small overlapping avatars + "+N" overflow chip.
// ----------------------------------------------------------------------
export function AvatarStack({ members, size = 22 }) {
  if (!members || members.length === 0) {
    return (
      <div
        className="rounded-full border border-line bg-surface1 flex items-center justify-center text-[9px] text-muted"
        aria-hidden
        style={{ width: size, height: size }}
      >
        —
      </div>
    )
  }
  const shown = members.slice(0, 3)
  const rest = members.length - shown.length
  return (
    <div className="flex -space-x-1.5 shrink-0">
      {shown.map(m => (
        <PersonAvatar
          key={m.userId}
          src={m.photoURL}
          name={m.displayName}
          userId={m.userId}
          size={size}
          className="ring-2 ring-panel"
        />
      ))}
      {rest > 0 && (
        <div
          className="rounded-full ring-2 ring-panel bg-surface2 text-ink text-[9px] font-semibold flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          +{rest}
        </div>
      )}
    </div>
  )
}
