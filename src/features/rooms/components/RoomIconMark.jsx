/**
 * RoomIconMark — emoji, custom Phosphor icon, or purpose fallback.
 */
import { SpaceIcon } from '../../spaces'
import { PURPOSE_BY_KEY } from '../model/roomPurposes'

export function RoomIconMark({ room, size = 13, className = '' }) {
  const purpose = PURPOSE_BY_KEY[room?.purpose] || PURPOSE_BY_KEY.conversation
  const PurposeIcon = purpose.icon
  const emoji = typeof room?.emoji === 'string' && room.emoji.trim() ? room.emoji.trim() : null

  if (emoji) {
    return (
      <span
        className={className}
        style={{ fontSize: Math.max(11, size), lineHeight: 1 }}
        aria-hidden
      >
        {emoji}
      </span>
    )
  }

  if (room?.icon) {
    return <SpaceIcon value={room.icon} size={size} className={className} />
  }

  return <PurposeIcon size={size} strokeWidth={1.8} className={className} />
}

export function roomAccentColor(room) {
  if (typeof room?.color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(room.color.trim())) {
    const hex = room.color.trim()
    return hex.startsWith('#') ? hex : `#${hex}`
  }
  const purpose = PURPOSE_BY_KEY[room?.purpose] || PURPOSE_BY_KEY.conversation
  return purpose.color
}

export function roomSoftColor(room) {
  const purpose = PURPOSE_BY_KEY[room?.purpose] || PURPOSE_BY_KEY.conversation
  if (room?.color) {
    return `color-mix(in srgb, ${roomAccentColor(room)} 18%, transparent)`
  }
  return purpose.soft
}
