import { useMemo } from 'react'
import { SpaceIcon, normalizeSpaceIcon, identitySurfaceStyle } from '../features/spaces'

const FALLBACK_COLORS = ['#0A84FF', '#E91E63', '#9B59B6', '#1ABC9C', '#F1C40F', '#E67E22', '#E74C3C', '#2ECC71']

/**
 * SpaceAvatar — identity badge of a Space. Always color + icon.
 * Cover photos are wallpaper/theme only and never replace this badge.
 */
export default function SpaceAvatar({
  space,
  size = 48,
  rounded = '2xl',
  withRing = false,
  className = '',
}) {
  const iconValue = normalizeSpaceIcon(space?.icon)
  const radiusClass =
    rounded === 'full' ? 'rounded-full' :
    rounded === 'xl'  ? 'rounded-xl'  :
    rounded === 'md'  ? 'rounded-md'  :
                        'rounded-2xl'

  const color = useMemo(() => {
    if (space?.color && space.color.startsWith('#')) return space.color
    if (!space?.id) return FALLBACK_COLORS[0]
    const h = Array.from(space.id).reduce((a, c) => a + c.charCodeAt(0), 0)
    return FALLBACK_COLORS[h % FALLBACK_COLORS.length]
  }, [space?.color, space?.id])

  const ringClass = withRing
    ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d0d0e]'
    : ''

  return (
    <div
      className={`relative shrink-0 overflow-hidden flex items-center justify-center transition-all duration-200 ${radiusClass} ${ringClass} ${className}`}
      style={{
        width: size,
        height: size,
        ...identitySurfaceStyle(color),
      }}
      aria-label={space?.name}
    >
      <SpaceIcon
        value={iconValue}
        size={Math.round(size * 0.5)}
        className="relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.20)]"
        style={{ color: 'inherit' }}
      />
    </div>
  )
}
