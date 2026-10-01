/**
 * SoftImage — never leave a black hole.
 *
 * Two-layer strategy to eliminate the flash-preto bug:
 *
 *   1) While the previous image (or a CSS background-image) is visible,
 *      we start loading + decoding the next image *off-screen*.
 *   2) Only after `image.decode()` resolves successfully do we swap
 *      the displayed `src` — so the user never sees an empty frame.
 *
 * When the component first mounts with no cached previous image, we
 * still render a non-empty placeholder (the soft underlay + a decoded
 * img the moment decoding finishes) so there is no time during which
 * a black rectangle is visible.
 *
 * `warmImage()` is also called on mount + on swap so the LRU cache
 * keeps the bitmap resident between renders.
 */
import { useEffect, useState } from 'react'
import { warmImage, isImageWarm } from './imageWarm'

// Single source of truth: the bounded LRU in imageWarm. A separate unbounded
// Set used to drift out of sync with it — a URL could stay "decoded" here after
// its bitmap was evicted there, producing the exact flash this module prevents.
const isDecoded = (src) => isImageWarm(src)

function safeBgUrl(src) {
  return `url("${String(src).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

/**
 * Pre-decode an image into the bitmap cache. Safe to call repeatedly;
 * skipped if already decoded. Used by hover/pointer-down prefetch.
 */
export async function preloadImage(src) {
  if (!src || typeof src !== 'string') return
  if (isDecoded(src)) return
  // warmImage already loads + decodes and records the result in the LRU.
  await warmImage(src)
}

/**
 * Renders an image with a seamless swap (no black flash).
 *
 * - `src` is the URL to display. When it changes, the previous image
 *   stays on screen until the new one is decoded.
 * - `placeholderColor` paints the underlay while the very first image
 *   is decoding — defaults to a soft surface tone, never pure black.
 */
export function SoftImage({
  src,
  className = '',
  style,
  imgStyle,
  placeholderColor = '#0e1015',
  alt = '',
}) {
  const warmable = typeof src === 'string' && src.length > 0
  const [visibleSrc, setVisibleSrc] = useState(() => (warmable ? src : undefined))

  useEffect(() => {
    if (!warmable) {
      setVisibleSrc(undefined)
      return undefined
    }
    if (isDecoded(src)) {
      // Bitmap is resident in the LRU — swap immediately (touches LRU order).
      setVisibleSrc(src)
      return undefined
    }

    let cancelled = false
    // warmImage loads + decodes once and records the result in the LRU.
    // Only swap after it settles — this is what kills the flash. On failure
    // we still assign src so the browser shows its regular <img> fallback.
    warmImage(src).then(() => {
      if (!cancelled) setVisibleSrc(src)
    })

    return () => {
      cancelled = true
    }
    // visibleSrc intentionally omitted: we only want to react to src changes
    // and to mount/unmount cycles; using a ref to track current visibleSrc
    // would just create the same dependency without benefit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, warmable])

  if (!warmable) return null

  const fitStyle = imgStyle || {}
  const underlay = {
    backgroundColor: placeholderColor,
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
        src={visibleSrc || src}
        alt={alt}
        draggable={false}
        decoding="async"
        fetchpriority="high"
        onLoad={() => { warmImage(src) }}
        className={`absolute inset-0 w-full h-full object-cover select-none pointer-events-none ${className}`.trim()}
        style={{
          ...fitStyle,
          ...style,
          opacity: visibleSrc === src ? 1 : 0,
          transition: 'opacity 80ms linear',
        }}
      />
    </>
  )
}

/**
 * Backwards-compatible alias — existing callers imported `SoftCover`.
 */
export const SoftCover = SoftImage
