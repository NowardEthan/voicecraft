/**
 * PersonRichCard — themed profile card for any person (friend, suggestion,
 * activity). Same cover + theme system as Space member nameplates / account
 * CardPreview: cardThemeId + optional cover/coverFit + CardThemeFx.
 *
 * Variants:
 *   - 'row' (default): horizontal nameplate for lists / sidebar
 *   - 'tile': banner card for grids (suggestions, activity)
 */
import { motion } from 'framer-motion'
import {
  Briefcase,
  Gamepad2,
  Music2,
  Phone,
  Sparkles,
} from 'lucide-react'
import { PersonAvatar } from './PersonAvatar'
import { CardThemeFx } from '../../account/components/CardThemeFx'
import {
  PROFILE_CARD_THEMES,
  resolveCardTheme,
} from '../../account/model/profileCardThemes'
import { SpaceCoverLayer } from '../../spaces/components/SpaceCoverLayer'
import { coverImageStyle } from '../../spaces/model/spaceCover'
import { SoftCover } from '../../../shared/media/SoftImage'
import {
  friendPresenceDotColor,
  friendPresenceKind,
  presenceLabel,
} from '../model/presenceKind'

const STATUS_ICON = {
  work: Briefcase,
  call: Phone,
  play: Gamepad2,
  music: Music2,
  space: Sparkles,
  online: null,
  away: null,
  in_room: null,
  offline: null,
}

function hasPersonCover(person) {
  const cover = person?.cover
  return typeof cover === 'string'
    && (cover.startsWith('http') || cover.startsWith('data:image/'))
}

function PresenceDot({ person, className = '' }) {
  const color = friendPresenceDotColor(person)
  const kind = friendPresenceKind(person)
  return (
    <span
      className={`rounded-full border-2 border-[#12141a] ${className}`}
      style={{ backgroundColor: color }}
      title={presenceLabel(kind)}
      aria-label={presenceLabel(kind)}
    />
  )
}

export function PersonRichCard({
  person,
  variant = 'row',
  onClick,
  showHandle = true,
  showStatus = true,
  trailing = null,
  avatarSize,
  className = '',
}) {
  if (!person) return null
  const name = person.name || person.displayName || '?'
  const handle = person.handle || ''
  const theme = resolveCardTheme(person.cardThemeId || 'default')
  const presenceKind = friendPresenceKind(person)
  const online = presenceKind !== 'offline'
  const status = person.status || (online
    ? { kind: presenceKind, label: presenceLabel(presenceKind) }
    : null)
  const Icon = STATUS_ICON[status?.kind] || null
  const cover = hasPersonCover(person) ? person.cover : ''
  const themed = !!(person.cardThemeId && person.cardThemeId !== 'default')
  const styled = themed || !!cover

  // Use div+role so we can nest real <button>s in the trailing slot
  // (Adicionar, Aceitar, etc.) without invalid HTML.
  const handleKeyDown = (e) => {
    if (!onClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(e)
    }
  }

  if (variant === 'tile') {
    return (
      <motion.div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        whileHover={{ y: -2 }}
        className={
          'group relative overflow-hidden rounded-[18px] text-left w-full cursor-pointer ' +
          'border border-white/[0.08] ' +
          'hover:border-[#3b82f6]/35 transition-colors focus:outline-none focus-visible:border-[#3b82f6]/45 ' +
          className
        }
        style={{
          background: theme.bodyBg || '#12141a',
          ...(styled ? { borderColor: theme.popoverBorder } : {}),
          boxShadow: styled
            ? `0 14px 36px -16px ${theme.popoverGlow || 'rgba(0,0,0,0.5)'}, 0 0 28px -10px ${theme.popoverGlow || 'transparent'}`
            : `0 14px 36px -16px ${theme.popoverGlow || 'rgba(0,0,0,0.5)'}`,
        }}
      >
        <CardThemeFx themeId={theme.id} variant="card" className="opacity-80" />

        {/* Themed banner + optional personal cover */}
        <div
          className="relative h-[88px] overflow-hidden z-[1]"
          style={{ background: theme.bannerGradient }}
        >
          {cover ? (
            <SpaceCoverLayer src={cover} fit={person.coverFit} />
          ) : (
            <CardThemeFx themeId={theme.id} variant="thumb" className="opacity-90" />
          )}
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{ background: theme.coverTint || `linear-gradient(135deg, ${theme.accent || '#3b82f6'}44, transparent 58%)` }}
          />
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{ background: `linear-gradient(to bottom, transparent 40%, ${theme.bodyBg || '#12141a'})` }}
          />
          <PresenceDot person={person} className="absolute top-2 right-2 z-[2] w-2.5 h-2.5" />
          <div className="absolute -bottom-6 left-4 z-[2]">
            <div
              className="rounded-full p-[2px] shadow-[0_8px_24px_-8px_var(--space-accent-glow-24)]"
              style={{
                background: theme.nameplate || `linear-gradient(135deg, ${theme.accent || '#3b82f6'}, #ffffff22)`,
                boxShadow: `0 0 0 3px ${theme.bodyBg || '#12141a'}, 0 6px 18px ${theme.popoverGlow || 'transparent'}`,
              }}
            >
              <PersonAvatar
                src={person.photo || person.photoURL}
                name={name}
                userId={person.id || person.userId || person.otherUserId || person.uid}
                size={avatarSize || 56}
                className="ring-2 ring-[#12141a]"
              />
            </div>
          </div>
        </div>

        <div className="relative z-[2] px-4 pt-8 pb-3.5">
          <p className="text-[14px] font-semibold text-strong truncate">{name}</p>
          {showHandle && handle && (
            <p className="text-[11.5px] text-muted truncate">@{handle}</p>
          )}
          {showStatus && status?.label && (
            <p className="mt-1.5 text-[11.5px] text-muted inline-flex items-center gap-1.5 min-w-0">
              {Icon ? <Icon size={11} className="text-[#60a5fa] shrink-0" /> : (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: friendPresenceDotColor(person) }}
                />
              )}
              <span className="truncate">
                {status.label}
                {status.space ? (
                  <span className="text-muted"> · {status.space}</span>
                ) : null}
              </span>
            </p>
          )}
          {!online && person.lastSeen && showStatus && (
            <p className="mt-1 text-[11.5px] text-muted inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted/50" />
              {person.lastSeen}
            </p>
          )}
          {trailing && <div className="mt-3">{trailing}</div>}
        </div>
      </motion.div>
    )
  }

  // 'row' variant — Space nameplate style (full-bleed cover + theme)
  return (
    <motion.div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      whileHover={{ y: -1 }}
      className={
        'group relative flex items-center gap-3 w-full text-left ' +
        'px-3 py-2.5 rounded-[14px] overflow-hidden cursor-pointer ' +
        'border border-white/[0.08] ' +
        'hover:brightness-110 transition-[filter,border-color] focus:outline-none focus-visible:border-[#3b82f6]/45 ' +
        className
      }
      style={{
        background: styled ? (theme.bodyBg || '#12141a') : '#12141a',
        ...(styled ? {
          borderColor: theme.popoverBorder,
          boxShadow: themed
            ? `0 0 18px -6px ${theme.popoverGlow}, inset 0 0 24px -12px ${theme.popoverGlow}`
            : `0 8px 22px -14px ${theme.popoverGlow || 'rgba(0,0,0,0.5)'}`,
        } : {
          boxShadow: `0 8px 22px -14px ${theme.popoverGlow || 'rgba(0,0,0,0.5)'}`,
        }),
      }}
    >
      {cover ? (
        <SoftCover
          src={cover}
          className="opacity-[0.28]"
          imgStyle={coverImageStyle(person.coverFit)}
        />
      ) : null}
      {styled && (
        <span
          className="absolute inset-0 pointer-events-none"
          style={{ background: theme.nameplate }}
          aria-hidden
        />
      )}
      {themed && (
        <CardThemeFx
          themeId={theme.id || person.cardThemeId}
          variant="nameplate"
          className="z-0 opacity-90"
        />
      )}
      {!styled && (
        <div
          className="absolute left-0 top-0 bottom-0 w-[64px] overflow-hidden"
          style={{ background: theme.bannerGradient }}
          aria-hidden
        >
          <CardThemeFx themeId={theme.id} variant="nameplate" className="opacity-90" />
        </div>
      )}

      <div className="relative shrink-0 pl-1.5 z-[1]">
        <div
          className="rounded-full p-[2px]"
          style={{
            background: theme.nameplate || `linear-gradient(135deg, ${theme.accent || '#3b82f6'}, #ffffff22)`,
            boxShadow: styled ? `0 0 14px ${theme.popoverGlow}` : '0 8px 22px -10px var(--space-accent-glow-24)',
          }}
        >
          <PersonAvatar
            src={person.photo || person.photoURL}
            name={name}
            userId={person.id || person.userId || person.otherUserId || person.uid}
            size={avatarSize || 44}
            className="ring-2 ring-[#12141a]"
          />
        </div>
        <PresenceDot person={person} className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5" />
      </div>

      <div className="relative flex-1 min-w-0 z-[1]">
        <p className="text-[13.5px] font-semibold text-strong truncate">{name}</p>
        {showHandle && handle && (
          <p className="text-[11px] text-muted truncate">@{handle}</p>
        )}
        {showStatus && status?.label && (
          <p className="mt-0.5 text-[11px] text-muted inline-flex items-center gap-1.5 min-w-0">
            {Icon ? <Icon size={10} className="text-[#60a5fa] shrink-0" /> : (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: friendPresenceDotColor(person) }}
              />
            )}
            <span className="truncate">
              {status.label}
              {status.space ? <span className="text-muted"> · {status.space}</span> : null}
            </span>
          </p>
        )}
        {!online && person.lastSeen && showStatus && (
          <p className="mt-0.5 text-[11px] text-muted inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted/50" />
            {person.lastSeen}
          </p>
        )}
      </div>

      {trailing && <div className="relative shrink-0 z-[1]">{trailing}</div>}
    </motion.div>
  )
}

export { PROFILE_CARD_THEMES }
