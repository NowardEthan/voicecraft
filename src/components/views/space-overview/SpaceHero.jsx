import { memo } from 'react'
import {
  ArrowRight, Gamepad2, Headphones, MoreHorizontal, UserPlus, Users,
} from 'lucide-react'
import SpaceAvatar from '../../SpaceAvatar'
import { resolveSpaceCover, bannerGradient, bannerOverlay } from '../../../features/spaces'
import { SpaceCoverLayer } from '../../../features/spaces/components/SpaceCoverLayer'
import { getVisibility } from '../../../features/spaces/model/spacePreferences'

const SpaceHero = memo(function SpaceHero({
  space,
  members = [],
  onlineCount = 0,
  activeRoomLabel,
  onJoinActive,
  onInvite,
  onMore,
}) {
  const base = space.color || '#ff3f6c'
  const cover = resolveSpaceCover(space)
  const visibility = getVisibility(space.id)
  const tag = visibility === 'private' ? 'Privado' : 'Comunidade'
  const description = (space.description || '').trim()
    || 'Aquele lugar pra jogar, conversar e compartilhar. Boa gameplay, melhores pessoas.'
  const slogan = (space.slogan || space.tagline || '').trim() || 'Good Games\nBetter People.'

  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-white/[0.07] min-h-[200px] sm:min-h-[220px]"
      style={{ boxShadow: '0 28px 70px -28px rgba(0,0,0,0.8)' }}
    >
      {cover ? (
        <SpaceCoverLayer src={cover} fit={space.coverFit} />
      ) : (
        <div className="absolute inset-0" style={{ background: bannerGradient(base) }} />
      )}
      {/* Softer left wash so the cover still reads on the right */}
      <div
        className="absolute inset-0"
        style={{
          background: cover
            ? 'linear-gradient(90deg, rgba(8,9,12,0.88) 0%, rgba(8,9,12,0.55) 38%, rgba(8,9,12,0.18) 68%, transparent 100%)'
            : bannerOverlay(base, false),
        }}
      />
      {!cover && (
        <div
          className="absolute inset-0"
          style={{ background: bannerOverlay(base, false) }}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(55% 80% at 85% 40%, ${base}22, transparent 70%)`,
        }}
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(180px,0.55fr)] gap-4 px-5 sm:px-7 md:px-8 pt-6 sm:pt-8 pb-5 sm:pb-6">
        <div className="min-w-0">
          <div className="flex items-start gap-3.5 sm:gap-4">
            <SpaceAvatar
              space={space}
              size={64}
              rounded="2xl"
              className="shadow-[0_14px_32px_-8px_rgba(0,0,0,0.55)] ring-[3px] ring-white/12 shrink-0"
            />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/70 truncate">
                {String(space.name || '').replace(/\s+/g, '')}
              </p>
              <h1 className="text-[26px] sm:text-[32px] font-bold text-white tracking-tight leading-[1.1] break-words mt-1">
                {space.name}
              </h1>
              <p className="text-[13px] sm:text-[14px] text-white/75 mt-2 leading-relaxed max-w-xl">
                {description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 mt-5">
            <button
              type="button"
              onClick={onJoinActive}
              className="
                inline-flex items-center justify-center gap-2 h-10 pl-4 pr-4 rounded-full
                text-on-accent text-[13px] font-semibold bg-accent
                shadow-[0_10px_28px_-8px_var(--space-accent-glow-40)]
                hover:brightness-110 active:scale-[0.98] transition
                w-full sm:w-auto
              "
            >
              <Headphones size={15} strokeWidth={1.8} />
              {activeRoomLabel || 'Entrar na sala ativa'}
              <ArrowRight size={14} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              onClick={onInvite}
              className="
                inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full
                text-white text-[13px] font-medium
                bg-black/35 border border-white/15 backdrop-blur-sm
                hover:bg-black/50 active:scale-[0.98] transition
                flex-1 sm:flex-none
              "
            >
              <UserPlus size={14} strokeWidth={1.8} />
              Convidar
            </button>
            {onMore && (
              <button
                type="button"
                onClick={onMore}
                aria-label="Mais ações"
                title="Configurações do Space"
                className="w-10 h-10 rounded-full bg-black/35 border border-white/15 text-white inline-flex items-center justify-center hover:bg-black/50 transition shrink-0"
              >
                <MoreHorizontal size={16} strokeWidth={1.8} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-[12.5px] text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <Users size={13} strokeWidth={1.75} className="opacity-80" />
              {members.length} {members.length === 1 ? 'membro' : 'membros'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden />
              {onlineCount} online
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-semibold">
              <Gamepad2 size={11} strokeWidth={1.75} />
              {tag}
            </span>
          </div>
        </div>

        <div className="hidden lg:flex items-center justify-end pr-1">
          <p
            className="text-right text-[28px] xl:text-[34px] leading-[1.15] font-semibold text-accent/90 max-w-[220px] select-none"
            style={{
              fontFamily: '"Segoe Script", "Apple Chancery", "Comic Sans MS", cursive',
              textShadow: '0 8px 28px rgba(0,0,0,0.45)',
              whiteSpace: 'pre-line',
            }}
          >
            {slogan}
          </p>
        </div>
      </div>
    </div>
  )
})

export default SpaceHero
