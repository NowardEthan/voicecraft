/**
 * RoomThemeControl — popover with file picker to set / clear the room's
 * background image. Rendered as a portal so the popover can escape the
 * header's overflow rules.
 *
 * The control is intentionally compact: a small file button + a
 * "Remover" button when a cover is already set. We use a hidden
 * <input type="file"> to keep the native OS picker; the visible button
 * triggers it programmatically.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, Trash2, Image as ImageIcon, Check } from 'lucide-react'
import { flashToast } from '../../../../../shared/utils/toast'
import { setRoomCover, readFileAsDataUrl } from '../../../model/roomCover'

export function RoomThemeControl({ roomId, currentCover, onCoverChange, anchorRef }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const popRef = useRef(null)
  const fileRef = useRef(null)
  const triggerRef = useRef(null)

  // Close on outside click / Escape. Don't close when the click is on
  // the anchor (the user might re-click to toggle).
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return
      if (anchorRef?.current?.contains(e.target)) return
      if (triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, anchorRef])

  const openPop = () => {
    const anchor = triggerRef.current || anchorRef?.current
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 280) })
    setOpen(o => !o)
  }

  const handlePick = () => fileRef.current?.click()

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file || !roomId) return
    setBusy(true)
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const ok = setRoomCover(roomId, dataUrl)
      if (!ok) {
        flashToast('Não foi possível salvar a imagem — armazenamento cheio?')
        return
      }
      onCoverChange?.(dataUrl)
      setOpen(false)
    } catch (err) {
      flashToast(err.message || 'Falha ao carregar imagem')
    } finally {
      setBusy(false)
    }
  }

  const handleClear = () => {
    if (!roomId) return
    setRoomCover(roomId, null)
    onCoverChange?.(null)
    setOpen(false)
  }

  const node = open ? (
    <div
      ref={popRef}
      role="dialog"
      aria-label="Tema da sala"
      className="
        fixed z-50 w-[280px] rounded-card bg-surface1 border border-line
        shadow-2xl p-3
        animate-fade-in-up
      "
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center gap-2 mb-2">
        <ImageIcon size={13} className="text-muted" />
        <p className="text-[11.5px] font-semibold text-strong">Tema da sala</p>
      </div>
      <p className="text-[11px] text-muted leading-snug mb-3">
        Escolha uma imagem do seu computador para usar como fundo desta
        sala. JPG, PNG, WebP ou GIF. Até 4 MB.
      </p>

      {/* Preview thumbnail — only if a cover is set */}
      {currentCover && (
        <div className="mb-3 rounded-input overflow-hidden border border-line h-20 bg-canvas">
          <img
            src={currentCover}
            alt="Pré-visualização do tema"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={handlePick}
          disabled={busy}
          className="
            flex-1 inline-flex items-center justify-center gap-1.5
            h-8 px-3 rounded-input text-[12px] font-medium
            bg-white/[0.06] hover:bg-white/[0.10] text-strong
            border border-white/[0.10]
            transition-colors duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          <ImagePlus size={13} />
          {busy ? 'Carregando…' : (currentCover ? 'Trocar imagem' : 'Escolher imagem')}
        </button>
        {currentCover && (
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="
              inline-flex items-center justify-center
              h-8 w-8 rounded-input text-muted hover:text-danger
              bg-white/[0.04] hover:bg-danger/10 border border-white/[0.08]
              transition-colors duration-150
              disabled:opacity-50
            "
            aria-label="Remover tema da sala"
            title="Remover tema da sala"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFile}
        className="hidden"
        aria-hidden
      />

      {currentCover && (
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-positive">
          <Check size={10} />
          <span>Tema personalizado ativo</span>
        </div>
      )}
    </div>
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={openPop}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Tema da sala"
        title="Tema da sala"
        className={[
          'w-9 h-9 rounded-full inline-flex items-center justify-center',
          'backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
          'transition-[background-color,color,transform] duration-150',
          'hover:scale-[1.03] active:scale-[0.97]',
          currentCover
            ? 'bg-accent text-strong shadow-[0_10px_22px_-10px_var(--space-accent-glow-40)]'
            : 'bg-black/35 hover:bg-black/50 text-white/85 hover:text-white',
        ].join(' ')}
      >
        <ImageIcon size={15} strokeWidth={1.9} />
      </button>
      {typeof document !== 'undefined' && createPortal(node, document.body)}
    </>
  )
}
