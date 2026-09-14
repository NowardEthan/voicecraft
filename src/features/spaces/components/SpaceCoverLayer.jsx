/**
 * SpaceCoverLayer — wallpaper fill with optional drag-to-frame + wheel zoom.
 * Fit is a focal point (x/y 0–100) so the same crop works on every banner size.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  COVER_ZOOM_MAX,
  COVER_ZOOM_MIN,
  DEFAULT_COVER_FIT,
  coverImageStyle,
  isDefaultCoverFit,
  normalizeCoverFit,
} from '../model/spaceCover'
import { SoftCover } from '../../../shared/media/SoftImage'
import { warmImage, isImageWarm } from '../../../shared/media/imageWarm'

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

export function SpaceCoverFitControls({ fit, onFitChange, className = '' }) {
  const current = normalizeCoverFit(fit)
  const commit = (next) => onFitChange?.(normalizeCoverFit(next))
  return (
    <div
      data-cover-controls
      className={`flex items-center gap-1 ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 rounded-full bg-black/50 border border-white/15 backdrop-blur-sm p-0.5">
        <button
          type="button"
          aria-label="Afastar capa"
          disabled={current.zoom <= COVER_ZOOM_MIN}
          onClick={() => commit({ ...current, zoom: current.zoom - 0.15 })}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 disabled:opacity-35"
        >
          <Minus size={12} strokeWidth={2.2} />
        </button>
        <span className="min-w-[2.4rem] text-center text-[10.5px] font-medium text-white/85 tabular-nums">
          {current.zoom.toFixed(1)}×
        </span>
        <button
          type="button"
          aria-label="Aproximar capa"
          disabled={current.zoom >= COVER_ZOOM_MAX}
          onClick={() => commit({ ...current, zoom: current.zoom + 0.15 })}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 disabled:opacity-35"
        >
          <Plus size={12} strokeWidth={2.2} />
        </button>
      </div>
      {!isDefaultCoverFit(current) && (
        <button
          type="button"
          aria-label="Redefinir encaixe"
          title="Redefinir"
          onClick={() => commit(DEFAULT_COVER_FIT)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white/90 bg-black/50 border border-white/15 backdrop-blur-sm hover:bg-white/10"
        >
          <RotateCcw size={11} strokeWidth={2.2} />
        </button>
      )}
    </div>
  )
}

export function SpaceCoverLayer({
  src,
  fit,
  interactive = false,
  onFitChange,
  showControls = interactive,
  className = '',
}) {
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const fitRef = useRef(normalizeCoverFit(fit))
  const [dragging, setDragging] = useState(false)
  const current = normalizeCoverFit(fit)
  fitRef.current = current

  const commit = useCallback((next) => {
    onFitChange?.(normalizeCoverFit(next))
  }, [onFitChange])

  useEffect(() => {
    if (!interactive) return undefined
    const el = frameRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const prev = fitRef.current
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      commit({ ...prev, zoom: prev.zoom + delta })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [interactive, commit])

  if (!src) return null

  // Kick decode immediately so SoftCover can paint at full opacity.
  if (!isImageWarm(src)) warmImage(src)

  const onPointerDown = (e) => {
    if (!interactive || e.button !== 0) return
    if (e.target.closest('[data-cover-controls]')) return
    e.preventDefault()
    const el = frameRef.current
    el?.setPointerCapture?.(e.pointerId)
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      fit: { ...current },
      width: el?.clientWidth || 1,
      height: el?.clientHeight || 1,
    }
    setDragging(true)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    drag.fit = {
      ...drag.fit,
      x: clamp(drag.fit.x - (dx / drag.width) * (100 / drag.fit.zoom), 0, 100),
      y: clamp(drag.fit.y - (dy / drag.height) * (100 / drag.fit.zoom), 0, 100),
    }
    commit(drag.fit)
  }

  const endDrag = (e) => {
    if (!dragRef.current) return
    dragRef.current = null
    setDragging(false)
    try { frameRef.current?.releasePointerCapture?.(e.pointerId) } catch { /* already released */ }
  }

  return (
    <div
      ref={frameRef}
      className={[
        'absolute inset-0 overflow-hidden',
        interactive ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : '',
        className,
      ].filter(Boolean).join(' ')}
      style={interactive ? { touchAction: 'none' } : undefined}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? endDrag : undefined}
      onPointerCancel={interactive ? endDrag : undefined}
      onDoubleClick={interactive ? () => commit(DEFAULT_COVER_FIT) : undefined}
    >
      <SoftCover src={src} imgStyle={coverImageStyle(current)} />
      {showControls && (
        <SpaceCoverFitControls
          fit={current}
          onFitChange={onFitChange}
          className="absolute top-2.5 right-2.5 z-10"
        />
      )}
    </div>
  )
}
