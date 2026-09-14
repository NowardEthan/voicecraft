/**
 * SoftCover — never leave a black hole.
 *
 * 1) CSS background-image paints from browser cache immediately
 * 2) <img> sits on top for crisp decode / SoftCover consumers
 *
 * Never return null for a valid URL (chat banners / Space chrome).
 */
import { useEffect } from 'react'
import { warmImage } from './imageWarm'

function safeBgUrl(src) {
  return `url("${String(src).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

export function SoftCover({
  src,
  className = '',
  style,
  imgStyle,
  fade: _fade = true,
}) {
  const warmable = typeof src === 'string' && src.length > 0

  useEffect(() => {
    if (!warmable) return undefined
    warmImage(src)
    return undefined
  }, [src, warmable])

  if (!warmable) return null

  const fitStyle = imgStyle || {}
  const underlay = {
    backgroundImage: safeBgUrl(src),
    backgroundSize: fitStyle.objectFit === 'contain' ? 'contain' : 'cover',
    backgroundPosition: fitStyle.objectPosition || 'center',
    backgroundRepeat: 'no-repeat',
    transform: fitStyle.transform,
    transformOrigin: fitStyle.transformOrigin,
    ...style,
  }

  return (
    <>
      <div
        aria-hidden
        className={`absolute inset-0 select-none pointer-events-none ${className}`.trim()}
        style={underlay}
      />
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        fetchpriority="high"
        onLoad={() => { warmImage(src) }}
        className={`absolute inset-0 w-full h-full object-cover select-none pointer-events-none ${className}`.trim()}
        style={{
          ...fitStyle,
          ...style,
        }}
      />
    </>
  )
}
