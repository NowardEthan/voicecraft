import { colorFromId, initialsOf } from '../../spaces'

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
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-full flex items-center justify-center font-semibold ${textClassName} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        backgroundColor: photo ? '#1a1c22' : colorFromId(userId || name || 'user'),
      }}
      aria-hidden
    >
      {photo
        ? <img src={photo} alt="" className="w-full h-full object-cover" />
        : initialsOf(name)}
    </span>
  )
}
