/**
 * ImageLightbox — full-screen gallery viewer with carousel.
 * Portaled to document.body (avoids overflow/transform traps).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export default function ImageLightbox({
  src = null,
  images = null,
  index = 0,
  onClose,
  onIndexChange = null,
}) {
  const list = Array.isArray(images) && images.length
    ? images.filter(Boolean)
    : (src ? [src] : [])
  const [localIndex, setLocalIndex] = useState(index)

  useEffect(() => {
    setLocalIndex(Math.min(Math.max(0, index), Math.max(0, list.length - 1)))
  }, [index, list.length])

  const safeIndex = Math.min(Math.max(0, localIndex), Math.max(0, list.length - 1))
  const current = list[safeIndex] || null

  const go = (next) => {
    if (!list.length) return
    const i = (next + list.length) % list.length
    setLocalIndex(i)
    onIndexChange?.(i)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
      if (e.key === 'ArrowLeft' && list.length > 1) go(safeIndex - 1)
      if (e.key === 'ArrowRight' && list.length > 1) go(safeIndex + 1)
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, list.length, safeIndex])

  if (!current || typeof document === 'undefined') return null

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[300] flex flex-col animate-fade-in cursor-zoom-out"
      style={{
        background: 'rgba(255, 255, 255, 0.42)',
        backdropFilter: 'blur(22px) saturate(1.35)',
        WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Imagem ampliada"
      data-vc-image-lightbox="1"
    >
      <div
        className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0"
        style={{ borderBottom: '1px solid rgba(15, 17, 22, 0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[13px] font-semibold" style={{ color: 'rgba(15, 17, 22, 0.7)' }}>
          {list.length > 1 ? `${safeIndex + 1} / ${list.length}` : 'Imagem'}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(15, 17, 22, 0.06)',
            border: '1px solid rgba(15, 17, 22, 0.1)',
            color: 'rgba(15, 17, 22, 0.75)',
          }}
          aria-label="Fechar"
          title="Fechar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8">
        {list.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(safeIndex - 1) }}
            className="absolute left-3 sm:left-6 z-10 w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(15,17,22,0.1)',
              color: 'rgba(15,17,22,0.8)',
              boxShadow: '0 8px 24px rgba(15,17,22,0.12)',
            }}
            aria-label="Anterior"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <img
          key={current}
          src={current}
          alt=""
          onClick={(e) => e.stopPropagation()}
          decoding="async"
          className="max-w-full max-h-full w-auto h-auto object-contain rounded-2xl cursor-default select-none"
          style={{
            boxShadow: '0 24px 64px -16px rgba(15, 17, 22, 0.35), 0 0 0 1px rgba(15, 17, 22, 0.06)',
          }}
        />

        {list.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(safeIndex + 1) }}
            className="absolute right-3 sm:right-6 z-10 w-11 h-11 rounded-full flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(15,17,22,0.1)',
              color: 'rgba(15,17,22,0.8)',
              boxShadow: '0 8px 24px rgba(15,17,22,0.12)',
            }}
            aria-label="Próxima"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {list.length > 1 && (
        <div
          className="flex justify-center gap-1.5 px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid rgba(15, 17, 22, 0.08)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {list.map((url, i) => (
            <button
              key={url + i}
              type="button"
              onClick={() => go(i)}
              className="w-12 h-12 rounded-lg overflow-hidden shrink-0"
              style={{
                border: i === safeIndex
                  ? '2px solid rgba(15,17,22,0.55)'
                  : '2px solid transparent',
                opacity: i === safeIndex ? 1 : 0.6,
              }}
              aria-label={`Imagem ${i + 1}`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  )
}
