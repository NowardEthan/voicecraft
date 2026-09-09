/**
 * SpaceOverview — main-area "Visão geral" for a Space.
 *
 * Rendered in two places:
 *   - As a tab inside SpaceContextPanel (when the contextual sidebar is open)
 *   - As the full main view (OverviewMain) when no room is open
 *
 * Composition (top → bottom), per spec:
 *   1. Hero — atmospheric banner with theme + icon + name + actions + stats
 *   2. "Comece por aqui" — two-column section:
 *        - Featured card for the first room (with embedded composer preview)
 *        - "Primeiros passos" card (3 follow-up actions)
 *
 * Reads:
 *   - space (Space): for identity, theme, icon, description, rooms[]
 *   - members[]: for "1 membro", "1 online" stats and People panel
 *   - currentUserId / Name: for greeting + composer sender
 *
 * Behaviour:
 *   - Never renders "0 salas" / "Nenhuma sala ainda" when the wizard just
 *     created a first room — the empty state is only for the genuine case
 *     where the Space has zero rooms and no firstRoom was set.
 *   - All buttons are real: "Abrir conversa geral" navigates into the
 *     TextRoomView; "Convidar pessoas" opens the InviteModal; "Criar outra
 *     sala" opens the create-room flow.
 */
import { memo, useMemo } from 'react'
import {
  ArrowRight, MoreHorizontal, Smile, Send, Pencil, UserPlus, Plus,
  Radio, Sparkles, MessageCircle,
} from 'lucide-react'
import SpaceAvatar from '../../SpaceAvatar'
import { PURPOSE_BY_KEY } from '../../../features/rooms'
import { SectionTitle } from '../RoomCard'
import EmptyState from '../../../shared/ui/EmptyState'
import { colorFromId, initialsOf, hexToRgba, resolveSpaceCover, bannerGradient, bannerOverlay } from '../../../features/spaces'
import { SpaceCoverLayer } from '../../../features/spaces/components/SpaceCoverLayer'

/** Compact stat chip used inside the hero. */
function HeroStat({ icon: Icon, label, tone = 'muted' }) {
  const dotClass = tone === 'positive' ? 'bg-positive' : 'bg-muted/60'
  return (
    <div className="inline-flex items-center gap-1.5 text-[12px] text-strong/85">
      {tone === 'positive' ? (
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} aria-hidden />
      ) : (
        <Icon size={12} strokeWidth={1.75} className="text-strong/65" />
      )}
      <span>{label}</span>
    </div>
  )
}

/** Hero — atmospheric banner with theme color, waves, identity, and actions. */
const SpaceHero = memo(function SpaceHero({ space, members, onlineCount, onOpenConversation, onInvite, onMore }) {
  const base = space.color || '#ff3f6c'
  const cover = resolveSpaceCover(space)
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-white/[0.06] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]">
      {/* Layered background: cover photo or gradient + radial glow + 2 SVG wave layers */}
      {cover ? (
        <SpaceCoverLayer src={cover} fit={space.coverFit} />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: bannerGradient(base) }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: bannerOverlay(base, !!cover) }}
      />
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(80% 60% at 20% 0%, rgba(255,180,200,0.18), transparent 70%)' }}
      />
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full opacity-80 mix-blend-screen"
        viewBox="0 0 800 220"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="heroWaveA" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="heroWaveB" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.30" />
          </linearGradient>
        </defs>
        <path
          d="M 0 120 C 120 80, 260 150, 400 110 S 660 60, 800 120 L 800 220 L 0 220 Z"
          fill="url(#heroWaveA)"
        />
        <path
          d="M 0 160 C 160 120, 300 180, 460 150 S 720 110, 800 160 L 800 220 L 0 220 Z"
          fill="url(#heroWaveB)"
        />
      </svg>

      <div className="relative px-6 sm:px-8 pt-7 pb-6 sm:pb-7">
        <div className="flex items-start gap-4 sm:gap-5">
          <SpaceAvatar
            space={space}
            size={64}
            rounded="2xl"
            className="shadow-[0_12px_28px_-6px_rgba(0,0,0,0.45)] ring-2 ring-white/15 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden />
              <p className="text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/85">
                {space.name}
              </p>
            </div>
            <h1 className="text-[24px] sm:text-[28px] font-bold text-white tracking-tight leading-tight">
              {space.name}
            </h1>
            <p className="text-[14px] text-white/85 mt-1.5 leading-snug">
              Seu espaço está pronto.
            </p>
            <p className="text-[12.5px] text-white/60 leading-snug mt-0.5">
              Comece pela sala geral ou convide alguém para participar.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2.5 mt-5">
          <button
            type="button"
            onClick={onOpenConversation}
            className="
              inline-flex items-center gap-2 h-[40px] pl-4 pr-5 rounded-pill
              text-on-accent text-[13px] font-semibold
              bg-gradient-to-r from-accent to-accent
              shadow-[0_8px_22px_-6px_var(--space-accent-glow-32),inset_0_0_0_1px_rgba(255,255,255,0.10)]
              transition-[transform,box-shadow] duration-200
              hover:scale-[1.02] hover:-translate-y-px active:scale-[0.97]
            "
          >
            <MessageCircle size={14} strokeWidth={1.8} />
            Abrir conversa geral
            <ArrowRight size={13} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={onInvite}
            className="
              inline-flex items-center gap-2 h-[40px] px-4 rounded-pill
              text-strong text-[13px] font-medium
              bg-white/[0.06] border border-white/[0.10]
              hover:bg-white/[0.10] hover:scale-[1.02] hover:-translate-y-px
              active:scale-[0.97]
              transition-[transform,background-color] duration-200
            "
          >
            <UserPlus size={13} strokeWidth={1.8} />
            Convidar pessoas
          </button>
          <button
            type="button"
            onClick={onMore}
            aria-label="Mais ações"
            title="Mais ações"
            className="
              w-10 h-10 rounded-pill
              bg-white/[0.06] border border-white/[0.10]
              hover:bg-white/[0.10] text-strong
              inline-flex items-center justify-center transition-colors
            "
          >
            <MoreHorizontal size={15} strokeWidth={1.8} />
          </button>
        </div>

        {/* Compact stats — single row, not repeated elsewhere */}
        <div className="flex items-center gap-5 mt-5 pt-4 border-t border-white/10">
          <HeroStat icon={Sparkles}   label={`${members.length} ${members.length === 1 ? 'membro' : 'membros'}`} />
          <HeroStat icon={Radio}       label={`${(space.rooms || []).length} ${(space.rooms || []).length === 1 ? 'sala' : 'salas'}`} />
          <HeroStat icon={Radio}       label={`${onlineCount} online`} tone="positive" />
        </div>
      </div>
    </div>
  )
})

/** "A sala criada no assistente" card with an embedded composer preview. */
const FirstRoomCard = memo(function FirstRoomCard({ room, onOpen }) {
  const purpose = PURPOSE_BY_KEY[room.purpose] || PURPOSE_BY_KEY.conversation
  const Icon = purpose.icon
  return (
    <div className="rounded-[16px] border border-line bg-surface1 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: purpose.soft, color: purpose.color }}
          >
            <Icon size={16} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold text-strong tracking-tight truncate">
                {room.name || purpose.label}
              </h3>
              <span
                className="px-1.5 py-0.5 rounded-pill text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: purpose.soft, color: purpose.color }}
              >
                {purpose.label}
              </span>
            </div>
            <p className="text-[11.5px] text-muted mt-0.5">
              A sala criada no assistente
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="
            inline-flex items-center gap-1.5 h-[34px] pl-3.5 pr-3 rounded-pill
            text-on-accent text-[12.5px] font-semibold
            bg-gradient-to-r from-accent to-accent
            shadow-[0_6px_18px_-6px_var(--space-accent-glow-32),inset_0_0_0_1px_rgba(255,255,255,0.10)]
            transition-[transform,box-shadow] duration-200
            hover:scale-[1.02] hover:-translate-y-px active:scale-[0.97]
          "
        >
          Abrir conversa
          <ArrowRight size={12} strokeWidth={2.25} />
        </button>
      </div>

      {/* Embedded preview: not a second empty state, but a "first message" affordance. */}
      <div className="px-5 pb-5 pt-1">
        <div className="rounded-[12px] border border-line bg-[#0f1014] overflow-hidden">
          <div className="flex flex-col items-center justify-center text-center px-6 py-7 gap-2.5">
            <div className="relative">
              <div
                className="absolute inset-0 -m-3 rounded-full"
                style={{ background: 'radial-gradient(closest-side, rgba(255,63,108,0.18), transparent 70%)' }}
              />
              <div
                className="relative w-12 h-12 rounded-[12px] flex items-center justify-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,63,108,0.30) 0%, rgba(255,63,108,0.14) 100%)',
                  boxShadow: 'inset 0 0 0 1px rgba(255,63,108,0.35)',
                }}
              >
                <MessageCircle size={20} strokeWidth={1.6} className="text-[#ffb3c2]" />
              </div>
            </div>
            <div>
              <h4 className="text-[13px] font-semibold text-strong">
                Tudo pronto para conversar!
              </h4>
              <p className="text-[11.5px] text-muted leading-snug mt-1 max-w-[260px]">
                Seja o primeiro a enviar uma mensagem e dar as boas-vindas ao seu espaço.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-line">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-white/5 transition-colors shrink-0"
            >
              <Smile size={15} strokeWidth={1.75} />
            </button>
            <div className="flex-1 h-8 rounded-md bg-canvas border border-line flex items-center px-3 text-[12px] text-muted">
              Enviar uma mensagem em #{room.name || 'geral'}…
            </div>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="w-7 h-7 rounded-md flex items-center justify-center text-accent hover:bg-accent/10 transition-colors shrink-0"
            >
              <Send size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})

/** Card with three follow-up actions: edit description, invite, create room. */
const FirstStepsCard = memo(function FirstStepsCard({ space, onEditDescription, onInvite, onCreateRoom }) {
  const items = [
    {
      icon: Pencil,
      title: 'Personalize a descrição',
      body: 'Conte para a galera do que se trata este espaço.',
      onClick: onEditDescription,
    },
    {
      icon: UserPlus,
      title: 'Convide pessoas',
      body: 'Chame seus amigos para participar.',
      onClick: onInvite,
    },
    {
      icon: Plus,
      title: 'Crie outra sala',
      body: 'Adicione novas salas para diferentes tipos de conversa.',
      onClick: () => onCreateRoom?.('conversation'),
    },
  ]
  return (
    <div className="rounded-[16px] border border-line bg-surface1 overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-0.5">
          <Sparkles size={12} className="text-accent" strokeWidth={1.75} />
          <h3 className="text-[13px] font-semibold text-strong tracking-tight">
            Primeiros passos
          </h3>
        </div>
        <p className="text-[11.5px] text-muted leading-snug">
          Deixe seu espaço ainda mais completo.
        </p>
      </div>
      <ul className="px-2 pb-2">
        {items.map((it, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={it.onClick}
              className="
                w-full text-left flex items-start gap-3 px-3 py-2.5
                rounded-[10px] hover:bg-surface2
                transition-[transform,background-color] duration-200
                hover:translate-x-0.5
                group
              "
            >
              <span
                className="
                  w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0
                  bg-[#0f1014] border border-line text-ink
                  group-hover:text-accent group-hover:border-accent/30
                  transition-colors
                "
              >
                <it.icon size={14} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-semibold text-strong leading-snug">
                  {it.title}
                </p>
                <p className="text-[11.5px] text-muted leading-snug mt-0.5">
                  {it.body}
                </p>
              </div>
              <ArrowRight
                size={12}
                strokeWidth={1.75}
                className="text-muted mt-2 group-hover:text-accent transition-colors"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
})

/** Optional: when no room exists, show a clear path forward (no double empty state). */
const NoRoomFallback = memo(function NoRoomFallback({ onCreateRoom }) {
  return (
    <EmptyState
      icon={MessageCircle}
      title="Crie sua primeira sala"
      body="Adicione uma sala de conversa, voz, estudo, jogo ou música para começar."
      action={{ label: 'Criar sala', onClick: () => onCreateRoom?.('conversation') }}
      accent
    />
  )
})

/**
 * Main export — pulls the data together.
 *
 * `onSelectRoom` is the App-level handler that opens the TextRoomView.
 * `onEditDescription` opens the Space edit flow (out of scope here; left
 * as a hook so the panel can plug in a real implementation).
 */
const SpaceOverview = memo(function SpaceOverview({
  space,
  members = [],
  currentUserId,
  currentUserName,
  onSelectRoom,
  onCreateRoom,
  onInvite,
  onEditDescription,
  onMore,
  optimisticFirstRoom,
}) {
  if (!space) return null

  // Merge the real rooms with the optimistic first-room placeholder so the
  // "Comece por aqui" card shows the wizard's sala immediately, even
  // before the server's roomChangedCallback('created') arrives.
  const realRooms = space.rooms || []
  const hasMatchingReal = optimisticFirstRoom
    ? realRooms.some(r => r.name === optimisticFirstRoom.name)
    : true
  const rooms = hasMatchingReal
    ? realRooms
    : [...realRooms, { ...optimisticFirstRoom, id: '__optimistic__' }]
  const onlineCount = members.filter(m => m.online).length

  // Sort rooms by purpose to give the first room a stable pick. Conversation
  // comes first because that's the default wizard choice.
  const sortedRooms = useMemo(() => {
    const order = ['conversation', 'voice', 'study', 'games', 'music']
    return [...rooms].sort((a, b) => {
      const ai = order.indexOf(a.purpose) === -1 ? 99 : order.indexOf(a.purpose)
      const bi = order.indexOf(b.purpose) === -1 ? 99 : order.indexOf(b.purpose)
      return ai - bi
    })
  }, [rooms])

  const firstRoom = sortedRooms[0] || null
  const onOpenConversation = firstRoom
    ? () => onSelectRoom?.(firstRoom)
    : () => onCreateRoom?.('conversation')
  const onOpenRoom = (room) => () => onSelectRoom?.(room)

  return (
    <div className="px-4 sm:px-5 pt-4 pb-6 space-y-6">
      <SpaceHero
        space={space}
        members={members}
        onlineCount={onlineCount}
        onOpenConversation={onOpenConversation}
        onInvite={onInvite}
        onMore={onMore}
      />

      {/* "Comece por aqui" — first room card + first-steps card */}
      <section>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <h2 className="text-[16px] font-bold text-strong tracking-tight">
              Comece por aqui
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              Aqui está a sua sala. Entre, converse e faça seu espaço ganhar vida.
            </p>
          </div>
        </div>

        {firstRoom ? (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}
          >
            <FirstRoomCard room={firstRoom} onOpen={onOpenRoom(firstRoom)} />
            <FirstStepsCard
              space={space}
              onEditDescription={onEditDescription}
              onInvite={onInvite}
              onCreateRoom={onCreateRoom}
            />
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
          >
            <NoRoomFallback onCreateRoom={onCreateRoom} />
            <FirstStepsCard
              space={space}
              onEditDescription={onEditDescription}
              onInvite={onInvite}
              onCreateRoom={onCreateRoom}
            />
          </div>
        )}
      </section>
    </div>
  )
})

// Re-export so the full-width OverviewMain (in SpaceHome) can build its
// own column composition with the same primitives.
export default SpaceOverview
export {
  SpaceHero,
  FirstRoomCard,
  FirstStepsCard,
  NoRoomFallback,
  hexToRgba,
  colorFromId,
  initialsOf,
}
