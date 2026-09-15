import { colorFromId, initialsOf } from '../../spaces'
import { SoftImage } from '../../../shared/media/SoftImage'

/**
 * PersonAvatar — circular avatar.
 *
 * Composition strategy (no black flash):
 *  - Colored monogram from colorFromId(userId) sits at the bottom as a
 *    solid placeholder.
 *  - SoftImage sits on top, preserving the previous decoded avatar until
 *    the new one finishes decoding (never leaves an empty <img>).
 */
export function PersonAvatar({
  src,
  name,
  userId,
  size = 36,
  className = '',
  textClassName = 'text-white',
}) {
  const photo = typeof src === 'string' && (src.startsWith('http') || src.startsWith('data:image/'))
    ? src
    : ''

  const dim = { width: size, height: size }
  const initials = photo ? '' : initialsOf(name)
  const placeholderColor = colorFromId(userId || name || 'user')

  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-full flex items-center justify-center font-semibold ${textClassName} ${className}`}
      style={{
        ...dim,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        backgroundColor: placeholderColor,
      }}
      aria-hidden
    >
      {initials}
      {photo ? (
        <SoftImage
          src={photo}
          alt=""
          imgStyle={{ objectFit: 'cover' }}
          placeholderColor={placeholderColor}
          className="absolute inset-0 w-full h-full"
        />
      ) : null}
    </span>
  )
}
