/**
 * SpaceIconCropModal — interactive pan, zoom, and crop tool for custom Space icon images.
 * Bakes a square 512x512 high-DPI image with preview in real Space avatar contexts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Check, ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon } from 'lucide-react'
import { ref as storageRef, getBlob } from 'firebase/storage'
import { ModalShell } from '../../../shared/motion/ModalShell'
import { auth, storage } from '../../../shared/firebase/app'
import { DEFAULT_COVER_FIT, normalizeCoverFit } from '../model/spaceCover'
import { identitySurfaceStyle } from '../model/spaceTokens'

const OUT_SIZE = 512

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function isRemoteUrl(src) {
  return typeof src === 'string' && /^https?:\/\//i.test(src)
}

function isFirebaseStorageUrl(src) {
  return isRemoteUrl(src) && (
    src.includes('firebasestorage.googleapis.com')
    || src.includes('storage.googleapis.com')
    || src.includes('.firebasestorage.app')
  )
}

function base64ToBlob(base64, contentType) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: contentType || 'image/jpeg' })
}

async function authHeaders() {
  const token = await auth.currentUser?.getIdToken?.().catch(() => null)
  return token ? { Authorization: `Firebase ${token}` } : {}
}

/** Electron main process — no CORS. */
async function fetchViaElectron(src) {
  const api = typeof window !== 'undefined' ? window.electronAPI : null
  if (!api?.fetchStorageImage) return null
  const idToken = await auth.currentUser?.getIdToken?.().catch(() => null)
  const result = await api.fetchStorageImage(src, idToken || '')
  if (!result?.base64) return null
  const blob = base64ToBlob(result.base64, result.contentType)
  const url = URL.createObjectURL(blob)
  return { url, revoke: () => URL.revokeObjectURL(url) }
}

/** Vite same-origin proxy (dev) — avoids browser CORS on Storage. */
async function fetchViaViteProxy(src) {
  if (!isFirebaseStorageUrl(src)) return null
  if (typeof window === 'undefined' || !window.location?.origin?.startsWith('http')) return null
  if (!src.includes('firebasestorage.googleapis.com')) return null
  const proxied = src.replace(
    /^https:\/\/firebasestorage\.googleapis\.com/i,
    `${window.location.origin}/__fb_storage`,
  )
  const res = await fetch(proxied, {
    headers: { Accept: 'image/*,*/*', ...(await authHeaders()) },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  return { url, revoke: () => URL.revokeObjectURL(url) }
}

/**
 * Resolve any icon src to a same-origin drawable URL so canvas export
 * is not tainted (remote Storage URLs otherwise block toDataURL).
 */
async function resolveDrawableSrc(src) {
  if (!src || typeof src !== 'string') throw new Error('Imagem inválida')
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return { url: src, revoke: null }
  }

  if (isRemoteUrl(src)) {
    // 1) Electron main (packaged + most reliable)
    try {
      const viaElectron = await fetchViaElectron(src)
      if (viaElectron) return viaElectron
    } catch { /* fall through */ }

    // 2) Vite proxy in local dev
    try {
      const viaProxy = await fetchViaViteProxy(src)
      if (viaProxy) return viaProxy
    } catch { /* fall through */ }

    // 3) Firebase SDK (needs bucket CORS)
    if (isFirebaseStorageUrl(src)) {
      try {
        const blob = await getBlob(storageRef(storage, src))
        const url = URL.createObjectURL(blob)
        return { url, revoke: () => URL.revokeObjectURL(url) }
      } catch { /* fall through */ }
    }

    // 4) Direct CORS fetch
    try {
      const res = await fetch(src, {
        mode: 'cors',
        credentials: 'omit',
        headers: await authHeaders(),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      return { url, revoke: () => URL.revokeObjectURL(url) }
    } catch {
      throw new Error(
        'Não deu para carregar a imagem do Storage (CORS). Escolha o arquivo de novo no PC.',
      )
    }
  }

  return { url: src, revoke: null }
}

function loadImageElement(url, { crossOrigin = false } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem'))
    img.src = url
  })
}

/** Bake crop (zoom + pan x, y) into a crisp 512x512 data URL. */
export async function cropSpaceIconDataUrl(src, fit, size = OUT_SIZE) {
  const resolved = await resolveDrawableSrc(src)
  try {
    const img = await loadImageElement(resolved.url, {
      crossOrigin: !!resolved.crossOrigin,
    })
    const { x, y, zoom } = normalizeCoverFit(fit)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponível')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const scale = Math.max(size / img.naturalWidth, size / img.naturalHeight) * zoom
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const ox = (x / 100) * size - (x / 100) * drawW
    const oy = (y / 100) * size - (y / 100) * drawH

    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(img, ox, oy, drawW, drawH)

    let quality = 0.94
    let out
    try {
      out = canvas.toDataURL('image/jpeg', quality)
      while (out.length > 800_000 && quality > 0.6) {
        quality -= 0.08
        out = canvas.toDataURL('image/jpeg', quality)
      }
    } catch {
      throw new Error(
        'Não deu para exportar o recorte desta imagem. Escolha o arquivo de novo no PC.',
      )
    }
    return out
  } finally {
    resolved.revoke?.()
  }
}

export function SpaceIconCropModal({
  open,
  src,
  initialFit,
  spaceColor = '#32c48d',
  spaceName = 'Space',
  onCancel,
  onApply,
  onPickAnother,
}) {
  const [fit, setFit] = useState(() => normalizeCoverFit(initialFit || DEFAULT_COVER_FIT))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const frameRef = useRef(null)
  const dragRef = useRef(null)
  const fitRef = useRef(fit)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!open) return
    setFit(normalizeCoverFit(initialFit || DEFAULT_COVER_FIT))
    setBusy(false)
    setError('')
  }, [open, src, initialFit])

  const current = normalizeCoverFit(fit)
  fitRef.current = current

  const commit = useCallback((next) => {
    setFit((prev) => normalizeCoverFit({ ...prev, ...next }))
  }, [])

  // Wheel zoom on the crop frame
  useEffect(() => {
    if (!open) return undefined
    const el = frameRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const prev = fitRef.current
      const delta = e.deltaY > 0 ? -0.12 : 0.12
      const nextZoom = clamp(prev.zoom + delta, 1, 3)
      commit({ zoom: nextZoom })
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
    commit({
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

  const resetFit = () => {
    commit({ x: 50, y: 50, zoom: 1 })
  }

  const apply = async () => {
    if (busy || !src) return
    setBusy(true)
    setError('')
    try {
      const cropped = await cropSpaceIconDataUrl(src, fit)
      await onApply?.({ dataUrl: cropped, fit, rawSrc: src })
    } catch (err) {
      const raw = String(err?.message || '')
      const tainted = /tainted|toDataURL/i.test(raw)
      setError(
        tainted
          ? 'Não deu para exportar o recorte. Escolha o arquivo de novo no PC.'
          : (err?.message || 'Não deu para aplicar o recorte'),
      )
      setBusy(false)
    }
  }

  if (!open || !src) return null

  const surface = identitySurfaceStyle(spaceColor)
  const imgStyle = {
    objectPosition: `${current.x}% ${current.y}%`,
    transform: `scale(${current.zoom})`,
    transformOrigin: `${current.x}% ${current.y}%`,
  }

  return (
    <ModalShell
      open
      onClose={() => { if (!busy) onCancel?.() }}
      labelledBy="space-icon-crop-title"
      maxWidth="lg"
      panelClassName="rounded-[24px] overflow-hidden shadow-2xl border border-white/[0.12]"
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
    >
      <div className="bg-[#13151b] text-white flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 id="space-icon-crop-title" className="text-[17px] font-semibold text-white tracking-tight flex items-center gap-2">
              <ImageIcon size={18} className="text-accent" />
              Ajustar ícone do Space
            </h2>
            <p className="text-[12.5px] text-white/60 mt-0.5">
              Arraste a imagem para enquadrar · Scroll para zoom
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X size={16} />
          </button>
        </header>

        {/* Main Body with Crop Workspace & Live Previews */}
        <div className="p-6 flex flex-col md:flex-row items-center justify-center gap-8">
          {/* Main Interactive Crop Frame */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div
                ref={frameRef}
                className={[
                  'relative w-[240px] h-[240px] sm:w-[260px] sm:h-[260px] rounded-[28px] overflow-hidden',
                  'border-2 border-white/20 bg-[#0a0b0e] shadow-[0_12px_36px_rgba(0,0,0,0.6)] touch-none select-none',
                  dragging ? 'cursor-grabbing' : 'cursor-grab',
                ].join(' ')}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {/* Background color of Space to highlight transparency if any */}
                <div
                  className="absolute inset-0 opacity-15 pointer-events-none"
                  style={{ backgroundColor: spaceColor }}
                />
                <img
                  src={src}
                  alt="Recorte do ícone"
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none transition-transform duration-75 ease-out"
                  style={imgStyle}
                />
                {/* Grid Overlay on Drag for precision */}
                <div
                  className={`absolute inset-0 pointer-events-none transition-opacity duration-200 ${
                    dragging ? 'opacity-40' : 'opacity-10 hover:opacity-25'
                  }`}
                  style={{
                    backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.4) 1px, transparent 1px)',
                    backgroundSize: '33.333% 33.333%',
                  }}
                />
                {/* Inner mask highlight ring */}
                <div
                  className="absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/30 pointer-events-none"
                  aria-hidden
                />
              </div>
            </div>

            {/* Zoom Controls Slider & Buttons */}
            <div className="flex items-center gap-2.5 w-full max-w-[260px] px-1 py-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => commit({ zoom: clamp(current.zoom - 0.15, 1, 3) })}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
                title="Diminuir zoom"
                aria-label="Diminuir zoom"
              >
                <ZoomOut size={14} />
              </button>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={current.zoom}
                onChange={(e) => commit({ zoom: parseFloat(e.target.value) })}
                className="flex-1 h-1.5 rounded-lg bg-white/20 accent-accent cursor-pointer"
                aria-label="Controle de zoom"
              />
              <button
                type="button"
                onClick={() => commit({ zoom: clamp(current.zoom + 0.15, 1, 3) })}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
                title="Aumentar zoom"
                aria-label="Aumentar zoom"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                onClick={resetFit}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 border-l border-white/10 ml-0.5"
                title="Centralizar e resetar zoom"
                aria-label="Centralizar e resetar"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Live Preview Panel */}
          <div className="flex flex-col gap-4 bg-white/[0.03] border border-white/[0.06] p-4 rounded-2xl w-full md:w-[220px]">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">
              Visualização
            </span>

            {/* Preview 1: Sidebar Rail size (48px) */}
            <div className="flex items-center gap-3">
              <div
                className="relative w-12 h-12 rounded-xl overflow-hidden shadow-md ring-2 ring-white/20 shrink-0"
                style={{ backgroundColor: surface.backgroundColor }}
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                  style={imgStyle}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-white truncate">Na barra lateral</p>
                <p className="text-[10.5px] text-white/50">Tamanho 48px</p>
              </div>
            </div>

            {/* Preview 2: Header / Context Panel size (40px) */}
            <div className="flex items-center gap-3">
              <div
                className="relative w-10 h-10 rounded-2xl overflow-hidden shadow-md ring-2 ring-panel shrink-0"
                style={{ backgroundColor: surface.backgroundColor }}
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                  style={imgStyle}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-white truncate">No cabeçalho</p>
                <p className="text-[10.5px] text-white/50">{spaceName || 'Seu Space'}</p>
              </div>
            </div>

            {/* Preview 3: Circle variation (se o usuário estiver ativo na rail) */}
            <div className="flex items-center gap-3 pt-1 border-t border-white/[0.06]">
              <div
                className="relative w-9 h-9 rounded-full overflow-hidden shadow ring-1 ring-white/20 shrink-0"
                style={{ backgroundColor: surface.backgroundColor }}
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
                  style={imgStyle}
                />
              </div>
              <div className="min-w-0">
                <p className="text-[11.5px] font-medium text-white/80 truncate">Miniatura</p>
                <p className="text-[10px] text-white/40">Formato redondo</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-[12px] text-danger text-center px-6 pb-2" role="alert">{error}</p>
        )}

        {/* Footer */}
        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/[0.08] bg-black/20">
          {onPickAnother ? (
            <button
              type="button"
              onClick={onPickAnother}
              disabled={busy}
              className="text-[12px] text-white/70 hover:text-white underline underline-offset-2 transition-colors disabled:opacity-50"
            >
              Escolher outro arquivo
            </button>
          ) : <div />}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="h-9 px-4 rounded-xl text-[12.5px] font-medium text-white/80 bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.1] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-accent text-white hover:brightness-110 shadow-lg inline-flex items-center gap-1.5 disabled:opacity-50 transition-all"
            >
              <Check size={14} strokeWidth={2.4} />
              {busy ? 'Aplicando…' : 'Aplicar imagem'}
            </button>
          </div>
        </footer>
      </div>
    </ModalShell>
  )
}
