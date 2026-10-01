/**
 * PeoplePanel — right-side member list matching the Pessoas mockup:
 * Convidar CTA, tabs Pessoas/Detalhes, live call widget, online/offline.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  UserPlus, Users, X, Search, Crown, Headphones, MoreHorizontal,
  Laptop, Clock, Gamepad2, MessageCircle, BookOpen, Music, Radio,
  ChevronLeft, Phone, PhoneOff, Rows3, Layers3, XCircle,
} from 'lucide-react'
import { PersonAvatar } from '../../features/people'
import SpaceAvatar from '../SpaceAvatar'
import { UserTagChips } from '../../features/people/components/UserTagChips'
import {
  memberPresenceKind,
  PRESENCE_DOT,
} from '../../features/people/model/presenceKind'
import { PURPOSE_BY_KEY } from '../../features/rooms'
import { resolveCardTheme } from '../../features/account/model/profileCardThemes'
import { CardThemeFx } from '../../features/account/components/CardThemeFx'
import { Appear, AppearList, AppearItem } from '../../shared/motion/Appear'
import { TabIndicator, TabPanelSwap } from '../../shared/motion/Transitions.jsx'

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
      dot: member.online ? PRESENCE_DOT.online : (member.appOnline ? PRESENCE_DOT.away : '#60A5FA'),
    }
  }

  const kind = memberPresenceKind(member)
  if (kind === 'online') {
    return {
      Icon: null,
      color: null,
      textColor: 'text-muted',
      label: 'Online',
      ring: false,
      dot: PRESENCE_DOT.online,
    }
  }

  if (kind === 'away') {
    return {
      Icon: Headphones,
      color: PRESENCE_DOT.away,
      textColor: 'text-muted',
      label: 'Ausente',
      ring: false,
      dot: PRESENCE_DOT.away,
    }
  }

  return {
    Icon: Clock,
    color: '#6B7280',
    textColor: 'text-muted',
    label: seenLabel(member.lastSeen),
    ring: false,
    dot: PRESENCE_DOT.offline,
  }
}

export default function PeoplePanel({
  space = null,
  members = [],
  currentUserId,
  onClose,
  onInvite,
  onOpenProfile,
  voiceRoom = null,
  onFocusVoice = null,
  onLeaveCall = null,
  voicePeerCount = 0,
  voicePeers = [],
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('people') // people | details
  const [memberFilter, setMemberFilter] = useState('all')
  const [density, setDensity] = useState('compact')
  const searchRef = useRef(null)

  // O painel agora persiste entre Spaces (presenceKey estável): zera o
  // contexto de busca/aba para não vazar filtros de um Space para outro.
  useEffect(() => {
    setQuery('')
    setMemberFilter('all')
    setTab('people')
  }, [space?.id])

  useEffect(() => {
    if (!space?.id || typeof window === 'undefined') return
    try { setDensity(window.localStorage.getItem(`voicecraft:people-density:${space.id}`) || 'compact') }
    catch { setDensity('compact') }
  }, [space?.id])

  const toggleDensity = () => {
    const next = density === 'compact' ? 'comfortable' : 'compact'
    setDensity(next)
    try { window.localStorage.setItem(`voicecraft:people-density:${space?.id || 'default'}`, next) } catch {}
  }

  const accent = space?.color || 'var(--space-accent)'
  const memberCount = members.length
  const memberCounts = useMemo(() => ({
    all: members.length,
    online: members.filter((m) => memberPresenceKind(m) !== 'offline').length,
    room: members.filter((m) => !!m.location?.roomId).length,
    liveRooms: new Set(members.map((m) => m.location?.roomId).filter(Boolean)).size,
  }), [members])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      const matchesText = !q
        || String(m.displayName || '').toLowerCase().includes(q)
        || String(m.handle || '').toLowerCase().includes(q)
      const kind = memberPresenceKind(m)
      const matchesFilter = memberFilter === 'all'
        || (memberFilter === 'online' && kind !== 'offline')
        || (memberFilter === 'room' && !!m.location?.roomId)
      return matchesText && matchesFilter
    })
  }, [members, query, memberFilter])

  const sections = useMemo(() => {
    const inRoom = []
    const online = []
    const away = []
    const offline = []
    for (const m of filtered) {
      const kind = memberPresenceKind(m)
      if (kind === 'in_room') inRoom.push(m)
      else if (kind === 'online') online.push(m)
      else if (kind === 'away') away.push(m)
      else offline.push(m)
    }
    return [
      { key: 'room', label: 'Na sala agora', dot: accent, items: sortMembers(inRoom, currentUserId) },
      { key: 'online', label: 'Online', dot: PRESENCE_DOT.online, items: sortMembers(online, currentUserId) },
      { key: 'away', label: 'Ausente', dot: PRESENCE_DOT.away, items: sortMembers(away, currentUserId) },
      { key: 'offline', label: 'Offline', dot: PRESENCE_DOT.offline, items: sortMembers(offline, currentUserId) },
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
      className={`vc-people-panel vc-people-panel--${density} w-full h-full bg-[#0B0E11] border-l border-white/[0.06] flex flex-col overflow-hidden`}
      aria-label="Pessoas"
    >
      <header className="vc-people-header shrink-0">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2.5">
          <span className="vc-people-header__icon"><Users size={14} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-strong leading-tight">Pessoas</p>
            <p className="text-[10px] text-muted mt-0.5">{memberCount} no Space</p>
          </div>
          {onInvite && (
            <button
              type="button"
              onClick={onInvite}
              className="vc-people-invite-compact"
              style={{ color: accent }}
              title="Convidar"
              aria-label="Convidar pessoas"
            >
              <UserPlus size={14} strokeWidth={2.2} />
            </button>
          )}
          {onClose && (
            <button type="button" onClick={onClose} title="Fechar painel" aria-label="Fechar painel de pessoas" className="vc-people-header__button">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="vc-people-tabs px-3 flex items-center gap-4">
          {[
            { id: 'people', label: 'Pessoas' },
            { id: 'details', label: 'Detalhes' },
          ].map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={'relative h-8 text-[11.5px] font-semibold transition-colors ' + (active ? 'text-strong' : 'text-muted hover:text-ink')}
              >
                {t.label}
                {active && <TabIndicator layoutId="people-tab-indicator" className="vc-people-tabs__active" style={{ background: 'var(--space-accent)' }} />}
              </button>
            )
          })}
        </div>
      </header>

      <TabPanelSwap activeKey={tab} className="flex-1 min-h-0 flex flex-col" role="tabpanel">
      {tab === 'details' ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
          <section className="vc-people-details-identity" style={{ '--details-accent': accent }}>
            <SpaceAvatar space={space} size={48} rounded="xl" className="shrink-0 ring-1 ring-white/15" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-strong truncate">{space?.name || 'Space'}</p>
              <p className="text-[10.5px] text-muted mt-0.5">Identidade da comunidade</p>
            </div>
          </section>
          <div className="vc-people-details-metrics">
            <DetailMetric value={memberCount} label="membros" />
            <DetailMetric value={memberCounts.online} label="online" />
            <DetailMetric value={(space?.rooms || []).length} label="salas" />
            <DetailMetric value={memberCounts.liveRooms} label="ao vivo" />
          </div>
          <section className="vc-people-details-copy">
            <h3>Sobre este Space</h3>
            <p>{space?.description || 'Este Space ainda não tem uma descrição.'}</p>
          </section>
          {onInvite && <button type="button" onClick={onInvite} className="vc-people-details-invite"><UserPlus size={14} /> Convidar pessoas</button>}
        </div>
      ) : (
        <>
          {/* Live call widget */}
          {voiceRoom && (
            <Appear delay={0.04} y={6} className="shrink-0 px-3 pt-3">
              <div className="vc-live-call-card rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 space-y-2.5">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="shrink-0 flex items-center justify-center mt-0.5"
                    style={{ color: 'var(--space-accent)' }}
                    aria-hidden
                  >
                    <Phone size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-positive flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
                      Bate-papo ao vivo
                    </p>
                    <p className="text-[13px] font-semibold text-strong truncate mt-0.5">
                      {voiceRoom.name}
                    </p>
                    {voicePeerCount > 0 && (
                      <p className="text-[11px] text-muted mt-0.5">
                        {voicePeerCount} {voicePeerCount === 1 ? 'pessoa' : 'pessoas'} na call
                      </p>
                    )}
                  </div>
                </div>
                {voicePeers.length > 0 && (
                  <div className="flex items-center -space-x-1.5 pl-0.5">
                    {voicePeers.slice(0, 5).map((m) => (
                      <PersonAvatar
                        key={m.userId}
                        src={m.photoURL}
                        name={m.displayName || '?'}
                        userId={m.userId}
                        size={22}
                        className="ring-2 ring-[#0B0E11]"
                      />
                    ))}
                    {voicePeers.length > 5 && (
                      <span className="ml-2 text-[10px] font-semibold text-muted tabular-nums">
                        +{voicePeers.length - 5}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onFocusVoice}
                    className="flex-1 h-8 rounded-lg text-[12px] font-semibold transition-colors hover:brightness-110"
                    style={{
                      color: 'var(--space-accent)',
                      boxShadow: 'inset 0 0 0 1.5px var(--space-accent)',
                      background: 'color-mix(in srgb, var(--space-accent) 10%, transparent)',
                    }}
                  >
                    Entrar
                  </button>
                  {onLeaveCall && (
                    <button
                      type="button"
                      onClick={onLeaveCall}
                      title="Sair da call"
                      aria-label="Sair da call"
                      className="h-8 px-2.5 rounded-lg text-danger hover:bg-danger/10 inline-flex items-center gap-1 text-[11px] font-semibold"
                    >
                      <PhoneOff size={12} strokeWidth={2.2} />
                      Sair
                    </button>
                  )}
                </div>
              </div>
            </Appear>
          )}

          {/* Search */}
          <Appear key={`people-s-${space?.id || 'x'}`} delay={0.05} y={6} className="shrink-0 px-3 py-3">
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
                className="w-full h-9 pl-9 pr-9 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[12.5px] text-strong placeholder:text-muted focus:outline-none focus:border-[color-mix(in_srgb,var(--space-accent)_40%,transparent)]"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="vc-field-clear" aria-label="Limpar busca" title="Limpar busca"><X size={12} /></button>}
            </div>
            <div className="vc-people-filterbar" aria-label="Filtrar pessoas">
              {[
                { id: 'all', label: 'Todos', count: memberCounts.all },
                { id: 'online', label: 'Online', count: memberCounts.online },
                { id: 'room', label: 'Em sala', count: memberCounts.room },
              ].map((item) => <button key={item.id} type="button" aria-pressed={memberFilter === item.id} onClick={() => setMemberFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}
              <button type="button" onClick={toggleDensity} className="vc-density-toggle" title={density === 'compact' ? 'Usar visual confortável' : 'Usar visual compacto'} aria-label="Alternar densidade">
                {density === 'compact' ? <Layers3 size={13} /> : <Rows3 size={13} />}
              </button>
            </div>
          </Appear>

          {/* List */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2">
            {memberCount === 0 ? (
              <Appear key={`empty-${space?.id}`} delay={0.08} y={6}>
                <p className="text-[12px] text-muted text-center px-4 py-6">
                  Ninguém no Space ainda.
                </p>
              </Appear>
            ) : filtered.length === 0 ? (
              <Appear key={`none-${space?.id}`} delay={0.08} y={6}>
                <div className="vc-filter-empty"><XCircle size={19} /><p>Ninguém corresponde a esta busca ou filtro.</p><button type="button" onClick={() => { setQuery(''); setMemberFilter('all') }}>Limpar filtros</button></div>
              </Appear>
            ) : (
              <div key={`list-${space?.id || 'people'}`}>
                {sections.map((section, sectionIdx) => (
                  <section key={section.key} className="mb-3">
                    <Appear delay={0.05 + sectionIdx * 0.025} y={4}>
                      <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-1.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: section.dot }}
                          aria-hidden
                        />
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">
                          {section.label}
                          <span className="font-semibold tracking-normal text-strong/70"> — {section.items.length}</span>
                        </h3>
                      </div>
                    </Appear>
                    <AppearList className="space-y-0.5" stagger={0.032} delayChildren={0.06 + sectionIdx * 0.03}>
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
                    </AppearList>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      </TabPanelSwap>

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

function DetailMetric({ value, label }) {
  return <div><strong>{value}</strong><span>{label}</span></div>
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
    <AppearItem>
      <button
        type="button"
        onClick={() => onOpenProfile?.(member)}
        className="vc-people-row group relative w-full flex items-center gap-2 px-2 py-1.5 rounded-lg overflow-hidden transition-colors text-left"
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
          <CardThemeFx
            themeId={theme.id || member.cardThemeId}
            variant="nameplate"
            className="z-0 opacity-90"
          />
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
              size={32}
              className="ring-2 ring-[#0B0E11]"
            />
          </span>
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0B0E11]"
            style={{ backgroundColor: status.dot }}
            aria-hidden
          />
        </div>

        <div className="relative min-w-0 flex-1 z-[1] flex flex-col justify-center gap-0.5 overflow-hidden">
          <p className="text-[13px] font-semibold text-strong leading-none truncate flex items-center gap-1 min-h-[14px]">
            <span className="truncate">{name}</span>
            {isSelf && (
              <span className="text-muted font-normal shrink-0">(você)</span>
            )}
            {isCreator && !isSelf && (
              <Crown size={11} className="shrink-0" style={{ color: ringAccent }} strokeWidth={2.4} />
            )}
          </p>
          {member.tags?.length > 0 && (
            <UserTagChips tags={member.tags} size="xs" marquee className="shrink-0" />
          )}
          <p className={`text-[11px] leading-none truncate flex items-center gap-1 min-h-[12px] ${status.textColor}`}>
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
    </AppearItem>
  )
}

