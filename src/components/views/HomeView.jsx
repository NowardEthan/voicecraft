/**
 * HomeView — personal home when no Space is selected (rail Home).
 * Layout follows the product mockup; content uses real Spaces / profile data.
 * Mentions / invites inbox are not wired yet — shown as empty states.
 */
import { useMemo } from 'react'
import {
  ArrowRight,
  AtSign,
  Calendar,
  Compass,
  Gamepad2,
  Headphones,
  Mic2,
  Search,
  UserPlus,
} from 'lucide-react'
import SpaceAvatar from '../SpaceAvatar'
import { PersonAvatar } from '../../features/people'
import { getRecentSpaceIds } from '../../features/spaces/model/spacePreferences'
import { resolveSpaceCover } from '../../features/spaces/model/spaceCover'
import NotificationBell from '../../features/notifications/NotificationBell'

function greetingForHour(d = new Date()) {
  const h = d.getHours()
  if (h < 5) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function firstName(full) {
  const s = String(full || '').trim()
  if (!s) return 'você'
  return s.split(/\s+/)[0]
}

function pickContinueSpace(spaces = []) {
  const byId = new Map(spaces.map((s) => [s.id, s]))
  for (const id of getRecentSpaceIds()) {
    if (byId.has(id)) return byId.get(id)
  }
  return spaces[0] || null
}

export default function HomeView({
  spaces = [],
  accountName = '',
  accountPhoto = '',
  onSelectSpace,
  onCreateSpace,
  onOpenHub,
  onOpenAccount,
  onOpenNotifTarget,
  connected = true,
}) {
  const name = firstName(accountName)
  const greeting = greetingForHour()
  const continueSpace = useMemo(() => pickContinueSpace(spaces), [spaces])
  const otherSpaces = useMemo(
    () => spaces.filter((s) => s.id !== continueSpace?.id).slice(0, 5),
    [spaces, continueSpace?.id],
  )

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas">
      <div className="max-w-[1180px] mx-auto w-full px-4 sm:px-6 md:px-8 pt-6 sm:pt-8 pb-10">
        {/* Header */}
        <header className="flex items-start justify-between gap-4 mb-7 sm:mb-9">
          <div>
            <h1 className="text-[28px] sm:text-[34px] font-bold text-strong tracking-tight leading-tight">
              {greeting},{' '}
              <span className="text-accent">{name}</span>
            </h1>
            <p className="mt-1.5 text-[14px] text-muted">
              Aqui está o que está acontecendo.
            </p>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <IconBtn label="Buscar" onClick={onOpenHub}>
              <Search size={18} strokeWidth={1.75} />
            </IconBtn>
            <NotificationBell placement="header" onOpenTarget={onOpenNotifTarget} />
            <button
              type="button"
              onClick={onOpenAccount}
              className="ml-1 flex items-center gap-1.5 rounded-full p-0.5 hover:bg-surface2 transition-colors"
              aria-label="Conta"
            >
              <PersonAvatar
                src={accountPhoto}
                name={accountName || 'você'}
                size={36}
              />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-6 xl:gap-8">
          <div className="min-w-0 space-y-8">
            {/* Continuar */}
            <section>
              <h2 className="text-[15px] font-semibold text-strong mb-3">
                Continuar de onde parou
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 sm:gap-4 min-w-0">
                <ContinueCard
                  space={continueSpace}
                  onOpen={() => continueSpace && onSelectSpace?.(continueSpace.id)}
                  onCreate={onCreateSpace}
                  connected={connected}
                />
                <LiveHintCard
                  space={continueSpace}
                  onOpen={() => continueSpace && onSelectSpace?.(continueSpace.id)}
                />
              </div>
            </section>

            {/* Para você */}
            <section>
              <h2 className="text-[15px] font-semibold text-strong mb-3">
                Para você
              </h2>
              <div className="rounded-card border border-line bg-surface1/80 overflow-hidden divide-y divide-line">
                <FeedEmpty
                  icon={AtSign}
                  title="Nenhuma menção por enquanto"
                  body="Quando alguém te marcar em um Space, aparece aqui."
                />
                <FeedEmpty
                  icon={UserPlus}
                  title="Sem convites pendentes"
                  body="Convites recebidos vão aparecer nesta lista."
                  actionLabel="Explorar Spaces"
                  onAction={onOpenHub}
                />
                <FeedEmpty
                  icon={Calendar}
                  title="Nenhum evento próximo"
                  body="Abra um Space para ver a agenda da comunidade."
                />
              </div>
              <button
                type="button"
                onClick={onOpenHub}
                className="mt-4 inline-flex items-center gap-2 text-[13px] font-medium text-accent hover:opacity-90 transition-opacity"
              >
                <Compass size={15} strokeWidth={2} />
                Explorar Spaces públicos
                <ArrowRight size={14} strokeWidth={2} />
              </button>
            </section>
          </div>

          {/* Pessoas / Spaces online rail */}
          <aside className="min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-strong">
                Seus Spaces
              </h2>
              <button
                type="button"
                onClick={onOpenHub}
                className="text-[12px] font-medium text-accent hover:opacity-90"
              >
                Ver todos
              </button>
            </div>
            <div className="rounded-card border border-line bg-surface1/60 p-2 space-y-0.5">
              {spaces.length === 0 ? (
                <p className="px-3 py-6 text-[13px] text-muted text-center">
                  Entre em um Space para ver atividade aqui.
                </p>
              ) : (
                [continueSpace, ...otherSpaces].filter(Boolean).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectSpace?.(s.id)}
                    className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-surface2 transition-colors text-left"
                  >
                    <SpaceAvatar space={s} size={40} rounded="xl" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold text-strong truncate">
                        {s.name}
                      </span>
                      <span className="block text-[11.5px] text-muted truncate">
                        {s.memberCount || 0} {(s.memberCount || 0) === 1 ? 'pessoa' : 'pessoas'}
                        {s.roomCount ? ` · ${s.roomCount} salas` : ''}
                      </span>
                    </span>
                    <span className="w-2 h-2 rounded-full bg-positive shrink-0" aria-hidden />
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function IconBtn({ children, label, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="
        w-9 h-9 rounded-full flex items-center justify-center
        text-muted hover:text-strong hover:bg-surface2
        disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors
      "
    >
      {children}
    </button>
  )
}

function ContinueCard({ space, onOpen, onCreate, connected }) {
  if (!space) {
    return (
      <div className="relative overflow-hidden rounded-[20px] border border-line bg-surface1 min-h-[220px] flex flex-col justify-end p-5">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 30% 20%, var(--space-accent-glow-24), transparent 55%)',
          }}
        />
        <div className="relative z-10">
          <p className="text-[13px] text-muted mb-2">Nenhum Space ainda</p>
          <h3 className="text-[20px] font-bold text-strong mb-4">
            Crie o seu primeiro lugar
          </h3>
          <button
            type="button"
            onClick={onCreate}
            disabled={!connected}
            className="
              inline-flex items-center gap-2 px-5 py-2.5 rounded-pill
              bg-accent text-strong text-[13.5px] font-semibold
              disabled:opacity-50
            "
          >
            Criar Space
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  const cover = resolveSpaceCover(space)
  const slogan = space.slogan || space.description || 'Sua galera. Todo dia.'

  return (
    <div className="relative overflow-hidden rounded-[20px] border border-line min-h-[220px] group">
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute inset-0 w-full h-full object-cover scale-[1.02] group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(145deg, ${space.color || '#ff3f6c'}55, #0d0f14 70%)`,
          }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(8,10,14,0.25) 0%, rgba(8,10,14,0.72) 55%, rgba(8,10,14,0.92) 100%)',
        }}
      />
      <div className="relative z-10 h-full min-h-[220px] flex flex-col p-5">
        <div className="flex items-center gap-3 mb-auto">
          <SpaceAvatar space={space} size={44} rounded="xl" />
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-white truncate">{space.name}</p>
            <p className="text-[12.5px] text-white/70 truncate">{slogan}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-black/35 border border-white/10 px-3.5 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[12px] text-white/80">
            <Gamepad2 size={14} className="text-accent shrink-0" />
            <span className="truncate">
              {space.roomCount
                ? `${space.roomCount} ${space.roomCount === 1 ? 'sala' : 'salas'} · ${space.memberCount || 0} pessoas`
                : `${space.memberCount || 0} pessoas no Space`}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          className="
            mt-3 w-full inline-flex items-center justify-center gap-2
            px-4 py-3 rounded-pill
            text-[14px] font-semibold text-strong
            bg-gradient-to-r from-accent to-[#ff6b8a]
            shadow-[0_10px_28px_-10px_var(--space-accent-glow-24)]
            hover:opacity-95 active:scale-[0.99] transition-all
          "
        >
          Continuar conversa
          <ArrowRight size={16} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}

function LiveHintCard({ space, onOpen }) {
  return (
    <div className="rounded-[20px] border border-line bg-surface1 min-h-[220px] p-5 flex flex-col overflow-hidden min-w-0">
      <div className="flex items-start justify-between gap-3 mb-4 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-strong truncate">Sala de voz agora</p>
          <p className="text-[12px] text-muted mt-0.5 truncate">
            {space ? `${space.name} · abra para ver quem está ao vivo` : 'Entre em um Space'}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-[11px] font-semibold bg-accent-soft text-accent border border-accent/20">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Ao vivo
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <div className="relative flex items-center justify-center mb-3">
          <div
            aria-hidden
            className="absolute w-24 h-24 rounded-full border border-accent/30 animate-pulse"
          />
          <div
            aria-hidden
            className="absolute w-[4.5rem] h-[4.5rem] rounded-full border border-accent/50"
          />
          <div className="relative w-14 h-14 rounded-full bg-accent-soft text-accent flex items-center justify-center">
            <Mic2 size={26} strokeWidth={1.75} />
          </div>
        </div>
        <p className="text-[12.5px] text-muted text-center max-w-[220px] leading-relaxed">
          A presença ao vivo aparece quando você entra no Space — presença cross-Space chega em breve.
        </p>
        <div className="mt-3 flex items-end gap-1 h-6 opacity-70" aria-hidden>
          {[4, 10, 6, 14, 8, 12, 5, 11, 7].map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-accent"
              style={{ height: h }}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        disabled={!space}
        className="
          mt-auto w-full inline-flex items-center justify-center gap-2
          px-4 py-2.5 rounded-pill
          text-[13.5px] font-semibold
          border border-accent/50 text-accent
          hover:bg-accent-soft disabled:opacity-40 disabled:cursor-not-allowed
          transition-colors
        "
      >
        <Headphones size={16} strokeWidth={1.75} />
        Entrar
      </button>
    </div>
  )
}

function FeedEmpty({ icon: Icon, title, body, actionLabel, onAction }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className="w-9 h-9 rounded-full bg-accent-soft text-accent flex items-center justify-center shrink-0">
        <Icon size={16} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-strong">{title}</p>
        <p className="text-[12.5px] text-muted mt-0.5 leading-relaxed">{body}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 inline-flex px-3 py-1.5 rounded-pill bg-accent text-strong text-[12px] font-semibold"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
