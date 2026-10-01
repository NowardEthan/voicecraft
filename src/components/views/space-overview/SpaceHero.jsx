import { memo } from 'react'
import {
  ArrowRight, Headphones, Palette, UserPlus, Users,
} from 'lucide-react'
import SpaceAvatar from '../../SpaceAvatar'
import { resolveSpaceCover, bannerGradient, bannerOverlay } from '../../../features/spaces'
import { SpaceCoverLayer } from '../../../features/spaces/components/SpaceCoverLayer'
import { getVisibility } from '../../../features/spaces/model/spacePreferences'
import { useSpaceFonts } from '../../../features/spaces/hooks/useSpaceFonts'
import { fieldFontStyle } from '../../../features/spaces/model/spaceTypography'

const SpaceHero = memo(function SpaceHero({
  space,
  members = [],
  onlineCount = 0,
  activeRoomLabel,
  onJoinActive,
  onInvite,
  onCustomize,
}) {
  useSpaceFonts(space)
  const base = space.color || '#ff3f6c'
  const cover = resolveSpaceCover(space)
  const visibility = getVisibility(space.id)
  const tag = visibility === 'private' ? 'Space privado' : 'Comunidade aberta'
  const description = (space.description || '').trim()
  const slogan = (space.slogan || space.tagline || '').trim()
  const nameFont = fieldFontStyle(space, 'name')
  const descFont = fieldFontStyle(space, 'description')
  const sloganFont = fieldFontStyle(space, 'slogan')

  return (
    <section className="vc-space-hero relative overflow-hidden min-h-[232px] sm:min-h-[252px]">
      {cover ? (
        <SpaceCoverLayer src={cover} fit={space.coverFit} />
      ) : (
        <div className="absolute inset-0" style={{ background: bannerGradient(base) }} />
      )}
      <div
        className="absolute inset-0"
        style={{
          background: cover
            ? 'linear-gradient(90deg, rgba(5,7,11,.95) 0%, rgba(5,7,11,.72) 42%, rgba(5,7,11,.18) 76%, rgba(5,7,11,.08) 100%)'
            : bannerOverlay(base, false),
        }}
      />
      <div className="vc-space-hero__scrim absolute inset-0 pointer-events-none" />

      <div className="relative min-h-[232px] sm:min-h-[252px] flex flex-col p-5 sm:p-6 lg:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="vc-space-hero__eyebrow inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-positive shadow-[0_0_9px_var(--vc-positive)]" />
            Início do Space
            <span aria-hidden>·</span>
            {tag}
          </div>
          {onCustomize && (
            <button
              type="button"
              onClick={onCustomize}
              aria-label="Personalizar Space"
              title="Personalizar identidade do Space"
              className="vc-space-hero__customize"
            >
              <Palette size={14} strokeWidth={1.9} />
              Personalizar
            </button>
          )}
        </div>

        <div className="mt-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(220px,.44fr)] gap-6 items-end">
          <div className="min-w-0">
            <div className="flex items-end gap-3.5 sm:gap-4">
              <SpaceAvatar
                space={space}
                size={56}
                rounded="2xl"
                className="vc-space-hero__avatar shrink-0"
              />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/55 truncate" style={nameFont}>
                  {String(space.name || '').replace(/\s+/g, '')}
                </p>
                <h1 className="vc-space-hero__title break-words mt-1" style={nameFont}>
                  {space.name}
                </h1>
              </div>
            </div>
            {description && (
              <p className="vc-space-hero__description mt-3 max-w-2xl" style={descFont}>
                {description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {onJoinActive && (
                <button type="button" onClick={onJoinActive} className="vc-space-hero__primary">
                  <Headphones size={15} strokeWidth={1.9} />
                  <span className="truncate">{activeRoomLabel}</span>
                  <ArrowRight size={14} strokeWidth={2.4} />
                </button>
              )}
              {onInvite && (
                <button type="button" onClick={onInvite} className="vc-space-hero__secondary">
                  <UserPlus size={14} strokeWidth={1.9} />
                  Convidar
                </button>
              )}
            </div>
          </div>

          <div className="hidden lg:flex flex-col items-end text-right gap-3">
            {slogan ? (
              <p className="vc-space-hero__slogan" style={{ ...sloganFont, whiteSpace: 'pre-line' }}>
                {slogan}
              </p>
            ) : (
              <p className="vc-space-hero__slogan text-white/70">Um lugar para conversar, criar e ficar por perto.</p>
            )}
            <span className="inline-flex items-center gap-2 text-[11px] text-white/60">
              <Users size={12} />
              {members.length} membros · {onlineCount} online
            </span>
          </div>
        </div>
      </div>
    </section>
  )
})

export default SpaceHero
