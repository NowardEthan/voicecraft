/**
 * Full-screen attachment preview before sending chat images.
 * Supports up to 10 images with a side-swipe carousel.
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Plus, Send, X, FileText } from 'lucide-react'

function formatBytes(n) {
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

const shellStyle = {
  background: 'rgba(255, 255, 255, 0.42)',
  backdropFilter: 'blur(22px) saturate(1.35)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.35)',
}

const hairline = '1px solid rgba(15, 17, 22, 0.08)'

function isImageAtt(att) {
  return att?.kind === 'image' || String(att?.type || '').startsWith('image/')
}

function attSrc(att) {
  return att?.previewUrl || att?.dataUrl || att?.url || null
}

export default function AttachPreviewModal({
  attachments = [],
  index = 0,
  onIndexChange,
  onCancel,
  onSend,
  onRemoveAt,
  onAddMore,
  maxCount = 10,
  sending = false,
  accent = null,
}) {
  const list = Array.isArray(attachments) ? attachments : []
  const safeIndex = Math.min(Math.max(0, index), Math.max(0, list.length - 1))
  const current = list[safeIndex] || null
  const src = attSrc(current)
  const isImage = isImageAtt(current)
  const canAdd = list.length < maxCount && !!onAddMore

  useEffect(() => {
    if (index !== safeIndex) onIndexChange?.(safeIndex)
  }, [index, safeIndex, onIndexChange])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel?.()
      }
      if (e.key === 'ArrowLeft' && list.length > 1) {
        e.preventDefault()
        onIndexChange?.((safeIndex - 1 + list.length) % list.length)
      }
      if (e.key === 'ArrowRight' && list.length > 1) {
        e.preventDefault()
        onIndexChange?.((safeIndex + 1) % list.length)
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !sending) {
        e.preventDefault()
        onSend?.()
      }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onCancel, onSend, onIndexChange, sending, list.length, safeIndex])

  if (!list.length || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex flex-col animate-fade-in"
      style={shellStyle}
      role="dialog"
      aria-modal="true"
      aria-label="Pré-visualizar anexos"
      data-vc-attach-modal="1"
    >
      <div
        className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 shrink-0"
        style={{ borderBottom: hairline }}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-semibold truncate" style={{ color: 'rgba(15, 17, 22, 0.92)' }}>
            {current?.name || (current?.sticker ? 'Sticker' : (isImage ? 'Imagem' : 'Arquivo'))}
            {list.length > 1 ? (
              <span className="ml-2 font-medium" style={{ color: 'rgba(15, 17, 22, 0.45)' }}>
                {safeIndex + 1}/{list.length}
              </span>
            ) : null}
          </p>
          {current?.size ? (
            <p className="text-[11px]" style={{ color: 'rgba(15, 17, 22, 0.45)' }}>
              {formatBytes(current.size)}
              {list.length > 1 ? ` · ${list.length} anexos` : ''}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: 'rgba(15, 17, 22, 0.06)',
            border: '1px solid rgba(15, 17, 22, 0.1)',
            color: 'rgba(15, 17, 22, 0.75)',
          }}
          aria-label="Cancelar anexos"
          title="Cancelar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center p-4 sm:p-8">
        {list.length > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange?.((safeIndex - 1 + list.length) % list.length)}
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

        {isImage && src ? (
          <img
            key={safeIndex + (src || '')}
            src={src}
            alt={current?.name || 'prévia'}
            decoding="async"
            className={
              'max-w-full max-h-full w-auto h-auto object-contain rounded-2xl' +
              (current?.sticker ? ' p-4' : '')
            }
            style={{
              boxShadow: current?.sticker
                ? 'none'
                : '0 24px 64px -16px rgba(15, 17, 22, 0.35), 0 0 0 1px rgba(15, 17, 22, 0.06)',
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3" style={{ color: 'rgba(15, 17, 22, 0.7)' }}>
            <span
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(15, 17, 22, 0.06)' }}
            >
              <FileText size={28} />
            </span>
            <p className="text-[14px] font-medium">{current?.name || 'arquivo'}</p>
          </div>
        )}

        {list.length > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange?.((safeIndex + 1) % list.length)}
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
        <div className="flex justify-center gap-1.5 px-4 pb-2">
          {list.map((att, i) => {
            const thumb = attSrc(att)
            return (
              <button
                key={i}
                type="button"
                onClick={() => onIndexChange?.(i)}
                className="w-11 h-11 rounded-lg overflow-hidden shrink-0"
                style={{
                  border: i === safeIndex
                    ? `2px solid ${accent || 'var(--space-accent, #22c55e)'}`
                    : '2px solid transparent',
                  opacity: i === safeIndex ? 1 : 0.65,
                }}
                aria-label={`Ir para anexo ${i + 1}`}
              >
                {isImageAtt(att) && thumb ? (
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center bg-black/10">
                    <FileText size={14} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div
        className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-4"
        style={{
          borderTop: hairline,
          background: 'rgba(255, 255, 255, 0.45)',
        }}
      >
        <div className="flex items-center gap-2">
          {canAdd && (
            <button
              type="button"
              onClick={onAddMore}
              disabled={sending}
              className="h-10 px-3 rounded-full text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-40"
              style={{
                color: 'rgba(15, 17, 22, 0.75)',
                background: 'rgba(15, 17, 22, 0.06)',
                border: '1px solid rgba(15, 17, 22, 0.1)',
              }}
            >
              <Plus size={15} strokeWidth={2.2} />
              Adicionar
            </button>
          )}
          {list.length > 0 && onRemoveAt && (
            <button
              type="button"
              onClick={() => onRemoveAt(safeIndex)}
              disabled={sending}
              className="h-10 px-3 rounded-full text-[13px] font-medium disabled:opacity-40"
              style={{ color: 'rgba(180, 40, 40, 0.9)' }}
            >
              Remover
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="h-10 px-4 rounded-full text-[13px] font-medium disabled:opacity-40"
            style={{ color: 'rgba(15, 17, 22, 0.65)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="h-10 px-5 rounded-full text-[13px] font-semibold text-black flex items-center gap-2 disabled:opacity-40 shadow-sm"
            style={{ background: accent || 'var(--space-accent, #22c55e)' }}
          >
            <Send size={15} strokeWidth={2.4} />
            {sending ? 'Enviando…' : list.length > 1 ? `Enviar ${list.length}` : 'Enviar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
