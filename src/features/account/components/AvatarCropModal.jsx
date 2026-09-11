/**
 * Circular avatar crop — pan / zoom before applying.
 * Bakes a square JPEG so every client sees the same crop.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check } from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import {
  COVER_ZOOM_MAX,
  COVER_ZOOM_MIN,
  DEFAULT_COVER_FIT,
  normalizeCoverFit,
} from '../../spaces/model/spaceCover'
import { SpaceCoverFitControls } from '../../spaces/components/SpaceCoverLayer'

const OUT_SIZE = 512

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem'))
    img.src = src
  })
}

/** Bake object-cover + object-position + zoom into a square JPEG. */
export async function cropAvatarDataUrl(src, fit, size = OUT_SIZE) {
  const img = await loadImage(src)
  const { x, y, zoom } = normalizeCoverFit(fit)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')

  const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight) * zoom
  const drawW = img.naturalWidth * scale
  const drawH = img.naturalHeight * scale
  const ox = (x / 100) * size - (x / 100) * drawW
  const oy = (y / 100) * size - (y / 100) * drawH

  ctx.fillStyle = '#0d0e12'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(img, ox, oy, drawW, drawH)

  let quality = 0.92
  let out = canvas.toDataURL('image/jpeg', quality)
  while (out.length > 900_000 && quality > 0.55) {
    quality -= 0.08
    out = canvas.toDataURL('image/jpeg', quality)
  }
  return out
}

export function AvatarCropModal({
  open,
  src,
  onCancel,
  onApply,
}) {
  const [fit, setFit] = useState(DEFAULT_COVER_FIT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const fitRef = useRef(normalizeCoverFit(DEFAULT_COVER_FIT))
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    setFit(DEFAULT_COVER_FIT)
    setBusy(false)
    setError('')
  }, [open, src])

  const current = normalizeCoverFit(fit)
  fitRef.current = current

  const commit = useCallback((next) => {
    setFit(normalizeCoverFit(next))
  }, [])

  useEffect(() => {
    if (!open) return undefined
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
  }, [open, commit])

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const prev = fitRef.current
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: prev.x,
      originY: prev.y,
    }
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const dx = ((e.clientX - drag.startX) / Math.max(1, rect.width)) * 100
    const dy = ((e.clientY - drag.startY) / Math.max(1, rect.height)) * 100
    // Dragging the image: move opposite to finger so it feels natural.
    commit({
      ...fitRef.current,
      x: clamp(drag.originX - dx, 0, 100),
      y: clamp(drag.originY - dy, 0, 100),
    })
  }

  const endDrag = (e) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }
  }

  const apply = async () => {
    if (busy || !src) return
    setBusy(true)
    setError('')
    try {
      const cropped = await cropAvatarDataUrl(src, fit)
      await onApply?.(cropped)
    } catch (err) {
      setError(err?.message || 'Não deu pra aplicar o recorte')
      setBusy(false)
    }
  }

  if (!open || !src) return null

  const node = (
    <ModalShell
      open
      onClose={() => { if (!busy) onCancel?.() }}
      labelledBy="avatar-crop-title"
      maxWidth="md"
      panelClassName="rounded-[20px] overflow-hidden"
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
    >
      <div className="bg-[#14161b] border border-white/[0.08] rounded-[20px] overflow-hidden">
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 id="avatar-crop-title" className="text-[16px] font-semibold text-strong">
              Ajustar foto
            </h2>
            <p className="text-[12px] text-muted mt-0.5">
              Arraste para mover · scroll ou botões para zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="px-5 pb-4 flex flex-col items-center gap-3">
          <div
            ref={frameRef}
            className={[
              'relative w-[240px] h-[240px] rounded-full overflow-hidden border border-white/15 bg-black/40 touch-none select-none',
              dragging ? 'cursor-grabbing' : 'cursor-grab',
            ].join(' ')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <img
              src={src}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{
                objectPosition: `${current.x}% ${current.y}%`,
                transform: `scale(${current.zoom})`,
                transformOrigin: `${current.x}% ${current.y}%`,
              }}
            />
            <div
              className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/20 pointer-events-none"
              aria-hidden
            />
          </div>

          <SpaceCoverFitControls fit={fit} onFitChange={commit} />

          {error && (
            <p className="text-[12px] text-danger text-center" role="alert">{error}</p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 px-3.5 rounded-xl text-[12.5px] font-medium text-ink bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-accent text-strong inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check size={14} strokeWidth={2.4} />
            {busy ? 'Aplicando…' : 'Aplicar foto'}
          </button>
        </footer>
      </div>
    </ModalShell>
  )

  return typeof document !== 'undefined' ? createPortal(node, document.body) : node
}
