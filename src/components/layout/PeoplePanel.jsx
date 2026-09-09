/**
 * PeoplePanel — right-side member list matching the Pessoas mockup:
 * sections (Na sala / Online / Offline), invite CTA, footer count.
 */
import { useMemo, useRef, useState } from 'react'
import {
  UserPlus, Users, X, Search, Crown, Headphones,
  Laptop, Clock, Gamepad2, MessageCircle, BookOpen, Music, Radio,
  ChevronLeft, MoreHorizontal,
} from 'lucide-react'
import { PersonAvatar } from '../../features/people'
import { PURPOSE_BY_KEY } from '../../features/rooms'
import { resolveCardTheme } from '../../features/account/model/profileCardThemes'
import { CardThemeFx } from '../../features/account/components/CardThemeFx'

const PURPOSE_ICON = {
  voice: Radio,
  conversation: MessageCircle,
  study: BookOpen,
  games: Gamepad2,
  music: Music,
}

function seenLabel(lastSeen) {
  const n = Number(lastSeen)
  if (!n) return 'Offline'
  const mins = Math.max(0, Math.floor((Date.now() - n) / 60000))
  if (mins < 1) return 'Visto agora'
  if (mins < 60) return `Visto há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Visto há ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Visto há 1 dia' : `Visto há ${days} dias`
}

function sortMembers(list, currentUserId) {
  return [...list].sort((a, b) => {
    if (a.userId === currentUserId) return -1
    if (b.userId === currentUserId) return 1
    return String(a.displayName || '').localeCompare(String(b.displayName || ''))
  })
}

function memberStatus(member, space) {
  const inRoom = !!member.location?.roomId
  const room = inRoom
    ? (space?.rooms || []).find((r) => r.id === member.location.roomId)
    : null
  const purpose = room
    ? PURPOSE_BY_KEY[room.purpose || (room.type === 'voice' ? 'voice' : 'conversation')]
    : null

  if (inRoom && room) {
    const Icon = PURPOSE_ICON[purpose?.key] || (room.type === 'voice' ? Gamepad2 : MessageCircle)
    const accent = purpose?.color || 'var(--space-accent)'
    const label = room.type === 'voice'
      ? (
        <>
          Jogando{' '}
          <span className="font-semibold" style={{ color: accent }}>
            em {room.name}
          </span>
        </>
      )
      : (
        <>
          em{' '}
          <span className="font-semibold" style={{ color: accent }}>
            {room.name}
          </span>
        </>
      )
    return {
      Icon,
      color: accent,
      textColor: 'text-muted',
      label,
      ring: true,
      dot: accent,
    }
  }

  if (member.statusText) {
    return {
      Icon: Laptop,
      color: 'var(--space-accent)',
      textColor: 'text-muted',
      label: member.statusText,
      ring: false,
      dot: '#60A5FA',
    }
  }

  if (member.online) {
    return {
      Icon: null,
      color: null,
      textColor: 'text-muted',
      label: 'Online',
      ring: false,
      dot: '#22C55E',
    }
  }

  return {
    Icon: Clock,
    color: '#6B7280',
    textColor: 'text-muted',
    label: seenLabel(member.lastSeen),
    ring: false,
    dot: '#6B7280',
  }
}

export default function PeoplePanel({
  space = null,
  members = [],
  currentUserId,
  onClose,
  onInvite,
  onOpenProfile,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)

  const accent = space?.color || 'var(--space-accent)'
  const memberCount = members.length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => {
      const name = String(m.displayName || '').toLowerCase()
      const handle = String(m.handle || '').toLowerCase()
      return name.includes(q) || handle.includes(q)
    })
  }, [members, query])

  const sections = useMemo(() => {
    const inRoom = []
    const online = []
    const offline = []
    for (const m of filtered) {
      if (m.location?.roomId) inRoom.push(m)
      else if (m.online) online.push(m)
      else offline.push(m)
    }
    return [
      { key: 'room', label: 'Na sala agora', dot: accent, items: sortMembers(inRoom, currentUserId) },
      { key: 'online', label: 'Online', dot: '#22C55E', items: sortMembers(online, currentUserId) },
      { key: 'offline', label: 'Offline', dot: '#6B7280', items: sortMembers(offline, currentUserId) },
    ].filter((s) => s.items.length > 0)
  }, [filtered, currentUserId, accent])

  if (collapsed) {
    return (
      <aside
        className="w-12 shrink-0 h-full bg-[#0B0E11] border-l border-white/[0.06] flex flex-col items-center py-3"
        aria-label="Pessoas (recolhido)"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expandir painel de pessoas"
          aria-label="Expandir painel de pessoas"
          className="w-9 h-9 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
        >
          <Users size={15} />
        </button>
        <span className="text-[10px] text-muted mt-1.5 font-semibold tabular-nums">
          {memberCount}
        </span>
      </aside>
    )
  }

  return (
    <aside
      className="w-full h-full bg-[#0B0E11] border-l border-white/[0.06] flex flex-col overflow-hidden"
      aria-label="Pessoas"
    >
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[15px] font-semibold text-strong tracking-tight">Pessoas</h2>
          {memberCount > 0 && (
            <span className="px-1.5 h-5 min-w-[1.25rem] rounded-full bg-white/[0.06] text-[11px] font-semibold text-muted tabular-nums inline-flex items-center justify-center">
              {memberCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => searchRef.current?.focus()}
            title="Buscar pessoas"
            aria-label="Buscar pessoas"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
          >
            <Search size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={onInvite}
            title="Convidar pessoas"
            aria-label="Convidar pessoas"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
          >
            <UserPlus size={14} strokeWidth={1.8} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Fechar painel"
              aria-label="Fechar painel de pessoas"
              className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 pb-3">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar pessoas..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-[12.5px] text-strong placeholder:text-muted focus:outline-none focus:border-accent/40"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
        {memberCount === 0 ? (
          <p className="text-[12px] text-muted text-center px-4 py-6">
            Ninguém no Space ainda.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-[12px] text-muted text-center px-4 py-6">
            Ninguém com esse nome.
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.key} className="mb-3">
              <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: section.dot }}
                  aria-hidden
                />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  {section.label}
                  <span className="font-semibold tracking-normal"> — {section.items.length}</span>
                </h3>
              </div>
              <ul className="space-y-0.5">
                {section.items.map((m) => (
                  <PersonRow
                    key={m.userId}
                    member={m}
                    space={space}
                    isSelf={m.userId === currentUserId}
                    isCreator={space?.createdBy === m.userId}
                    accent={accent}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Invite CTA */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-t border-white/[0.06]">
        <div className="flex items-start gap-3 mb-3">
          <InviteIllustration accent={accent} />
          <div className="min-w-0 pt-0.5">
            <p className="text-[13px] font-semibold text-strong leading-tight">
              Chame mais alguém
            </p>
            <p className="text-[11px] text-muted leading-snug mt-0.5">
              Boas conversas ficam melhores com companhia.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onInvite}
          className="w-full h-10 rounded-xl inline-flex items-center justify-center gap-2 text-[13px] font-semibold text-strong bg-transparent transition-colors hover:bg-white/[0.03]"
          style={{
            border: `1.5px solid ${accent}`,
            boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent)`,
          }}
        >
          <UserPlus size={15} strokeWidth={1.9} style={{ color: accent }} />
          Convidar pessoas
        </button>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-2.5 border-t border-white/[0.06] flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11.5px] text-muted min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-positive shrink-0" aria-hidden />
          <span className="truncate">
            {memberCount} {memberCount === 1 ? 'pessoa' : 'pessoas'} no Space
          </span>
        </p>
        <button
          type="button"
          onClick={() => (onClose ? onClose() : setCollapsed(true))}
          title="Recolher painel"
          aria-label="Recolher painel de pessoas"
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
      </div>
    </aside>
  )
}

function PersonRow({ member, space, isSelf, isCreator, accent, onOpenProfile }) {
  const status = memberStatus(member, space)
  const name = member.displayName || 'convidado'
  const listening = member.online && !member.location?.roomId && /ouv|listen|música|musica/i.test(String(member.statusText || ''))
  const theme = resolveCardTheme(member.cardThemeId, accent)
  const ringAccent = theme.accent
  const hasCover = typeof member.cover === 'string'
    && (member.cover.startsWith('http') || member.cover.startsWith('data:image/'))
  const themed = !!(member.cardThemeId && member.cardThemeId !== 'default')
  const styled = themed || hasCover

  const StatusIcon = listening ? Headphones : status.Icon

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenProfile?.(member)}
        className="group relative w-full flex items-center gap-2.5 px-2 py-2.5 rounded-xl overflow-hidden transition-colors text-left hover:brightness-110"
        style={styled ? {
          border: `1.5px solid ${theme.popoverBorder}`,
          boxShadow: themed ? `0 0 18px -6px ${theme.popoverGlow}, inset 0 0 24px -12px ${theme.popoverGlow}` : undefined,
          background: theme.bodyBg || undefined,
        } : undefined}
      >
        {hasCover && (
          <img
            src={member.cover}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-[0.28] pointer-events-none"
          />
        )}
        {styled && (
          <span
            className="absolute inset-0 pointer-events-none"
            style={{ background: theme.nameplate }}
            aria-hidden
          />
        )}
        {themed && (
          <CardThemeFx themeId={theme.id || member.cardThemeId} variant="nameplate" />
        )}
        <div className="relative shrink-0 z-[1]">
          <span
            className="block rounded-full p-[2px]"
            style={
              status.ring || isSelf || styled
                ? {
                    background: `linear-gradient(135deg, ${ringAccent}, color-mix(in srgb, ${ringAccent} 40%, #7c3aed))`,
                    boxShadow: `0 0 14px ${theme.popoverGlow}`,
                  }
                : undefined
            }
          >
            <PersonAvatar
              src={member.photoURL}
              name={name}
              userId={member.userId}
              size={34}
              className="ring-2 ring-[#0B0E11]"
            />
          </span>
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0B0E11]"
            style={{ backgroundColor: status.dot }}
            aria-hidden
          />
        </div>

        <div className="relative min-w-0 flex-1 z-[1]">
          <p className="text-[13px] font-semibold text-strong leading-tight truncate flex items-center gap-1">
            <span className="truncate">{name}</span>
            {isSelf && (
              <span className="text-muted font-normal shrink-0">(você)</span>
            )}
            {isCreator && !isSelf && (
              <Crown size={11} className="shrink-0" style={{ color: ringAccent }} strokeWidth={2.4} />
            )}
          </p>
          <p className={`text-[11px] leading-tight mt-0.5 truncate flex items-center gap-1 ${status.textColor}`}>
            {StatusIcon && (
              <StatusIcon size={11} strokeWidth={2} className="shrink-0" style={{ color: status.color || undefined }} />
            )}
            <span className="truncate">{status.label}</span>
          </p>
        </div>

        <span className="relative shrink-0 flex items-center justify-center w-6 h-6 z-[1]">
          <MoreHorizontal
            size={14}
            className="text-muted opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden
          />
        </span>
      </button>
    </li>
  )
}

function InviteIllustration({ accent }) {
  return (
    <svg
      width="44"
      height="40"
      viewBox="0 0 44 40"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <defs>
        <linearGradient id="vcInviteGrad" x1="0" y1="0" x2="44" y2="40">
          <stop stopColor={accent} />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      <circle cx="34" cy="8" r="1.2" fill="url(#vcInviteGrad)" opacity="0.9" />
      <circle cx="40" cy="14" r="0.9" fill="url(#vcInviteGrad)" opacity="0.7" />
      <circle cx="28" cy="4" r="0.8" fill="url(#vcInviteGrad)" opacity="0.6" />
      <path
        d="M36 6.5c2.2-1.8 5.2-.4 5.4 2.2.1 1.4-.7 2.5-1.8 3.1"
        stroke="url(#vcInviteGrad)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="14" cy="12" r="5" stroke="url(#vcInviteGrad)" strokeWidth="1.6" fill="none" />
      <path
        d="M5 30c1.5-5.5 5-8.5 9-8.5s7.5 3 9 8.5"
        stroke="url(#vcInviteGrad)"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="26" cy="14" r="4.2" stroke="url(#vcInviteGrad)" strokeWidth="1.5" fill="none" opacity="0.85" />
      <path
        d="M19.5 30c1.2-4.2 3.8-6.5 6.5-6.5 2 0 3.8 1.1 5.2 3"
        stroke="url(#vcInviteGrad)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  )
}
