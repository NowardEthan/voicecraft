/**
 * Focus-trapped mixed attachment preview shown before sending.
 */
import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, FileText, Loader2, Plus, Send, X } from 'lucide-react'
import { ModalShell } from '../../shared/motion/ModalShell'

function formatBytes(value) {
  if (!Number.isFinite(value)) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function isImageAttachment(attachment) {
  return attachment?.kind === 'image' || String(attachment?.type || '').startsWith('image/')
}

function attachmentSource(attachment) {
  return attachment?.previewUrl || attachment?.dataUrl || attachment?.url || null
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
  const source = attachmentSource(current)
  const isImage = isImageAttachment(current)
  const canAdd = list.length < maxCount && !!onAddMore

  useEffect(() => {
    if (index !== safeIndex) onIndexChange?.(safeIndex)
  }, [index, onIndexChange, safeIndex])

  useEffect(() => {
    if (!list.length) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft' && list.length > 1) {
        event.preventDefault()
        onIndexChange?.((safeIndex - 1 + list.length) % list.length)
      } else if (event.key === 'ArrowRight' && list.length > 1) {
        event.preventDefault()
        onIndexChange?.((safeIndex + 1) % list.length)
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !sending) {
        event.preventDefault()
        onSend?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [list.length, onIndexChange, onSend, safeIndex, sending])

  return (
    <ModalShell
      open={list.length > 0}
      onClose={onCancel}
      labelledBy="vc-attachment-preview-title"
      describedBy="vc-attachment-preview-summary"
      maxWidth="4xl"
      panelClassName="vc-attachment-modal"
      contentClassName="vc-attachment-modal__content"
      closeOnBackdrop={!sending}
      closeOnEscape={!sending}
    >
      <div className="vc-attachment-modal__header">
        <div className="min-w-0">
          <h2 id="vc-attachment-preview-title">
            {current?.name || (current?.sticker ? 'Sticker' : (isImage ? 'Imagem' : 'Arquivo'))}
          </h2>
          <p id="vc-attachment-preview-summary">
            {current?.size ? formatBytes(current.size) : (isImage ? 'Midia' : 'Documento')}
            {list.length > 1 ? ` - ${safeIndex + 1} de ${list.length} anexos` : ''}
          </p>
        </div>
        <button type="button" onClick={onCancel} disabled={sending} aria-label="Cancelar anexos">
          <X size={18} />
        </button>
      </div>

      <div className="vc-attachment-modal__stage">
        {list.length > 1 && (
          <button
            type="button"
            className="vc-attachment-modal__previous"
            onClick={() => onIndexChange?.((safeIndex - 1 + list.length) % list.length)}
            aria-label="Anexo anterior"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {isImage && source ? (
          <img
            key={`${safeIndex}-${source}`}
            src={source}
            alt={current?.name || 'Previa do anexo'}
            decoding="async"
            className={current?.sticker ? 'is-sticker' : ''}
          />
        ) : (
          <div className="vc-attachment-modal__document">
            <span><FileText size={30} /></span>
            <strong>{current?.name || 'Arquivo'}</strong>
            {current?.size ? <small>{formatBytes(current.size)}</small> : null}
          </div>
        )}

        {list.length > 1 && (
          <button
            type="button"
            className="vc-attachment-modal__next"
            onClick={() => onIndexChange?.((safeIndex + 1) % list.length)}
            aria-label="Proximo anexo"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {list.length > 1 && (
        <div className="vc-attachment-modal__thumbs" aria-label="Todos os anexos">
          {list.map((attachment, itemIndex) => {
            const thumb = attachmentSource(attachment)
            const image = isImageAttachment(attachment)
            return (
              <button
                key={`${attachment.name || 'anexo'}-${itemIndex}`}
                type="button"
                className={itemIndex === safeIndex ? 'is-active' : ''}
                style={accent ? { '--attachment-accent': accent } : undefined}
                onClick={() => onIndexChange?.(itemIndex)}
                aria-label={`Ir para anexo ${itemIndex + 1}: ${attachment.name || 'sem nome'}`}
                aria-current={itemIndex === safeIndex ? 'true' : undefined}
              >
                {image && thumb
                  ? <img src={thumb} alt="" />
                  : <span><FileText size={15} /></span>}
              </button>
            )
          })}
        </div>
      )}

      <div className="vc-attachment-modal__footer">
        <div>
          {canAdd && (
            <button type="button" onClick={onAddMore} disabled={sending}>
              <Plus size={15} /> Adicionar
            </button>
          )}
          {list.length > 0 && onRemoveAt && (
            <button type="button" className="is-danger" onClick={() => onRemoveAt(safeIndex)} disabled={sending}>
              Remover
            </button>
          )}
        </div>
        <div>
          <button type="button" onClick={onCancel} disabled={sending}>Cancelar</button>
          <button
            type="button"
            className="is-primary"
            onClick={onSend}
            disabled={sending}
            style={accent ? { '--attachment-accent': accent } : undefined}
          >
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {sending ? 'Enviando...' : list.length > 1 ? `Enviar ${list.length}` : 'Enviar'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
