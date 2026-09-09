/**
 * Composer — text + attachments. Mockup: plus / emoji / mic, send pill,
 * Enter hint sitting to the right of the bar.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Smile, Plus, Send, X, CornerUpLeft, FileText, Mic,
} from 'lucide-react'
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, readFileAsDataUrl } from '../../hooks/useChat'
import EmojiPicker from '../ui/EmojiPicker'

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json'
const TEXTAREA_MAX_PX = 160

export default function Composer({
  disabled = false,
  placeholder = 'Conversar…',
  onSubmit,
  replyTo = null,
  onCancelReply,
  className = '',
}) {
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [sizeError, setSizeError] = useState(null)
  const [sending, setSending] = useState(false)

  const taRef = useRef(null)
  const fileInputRef = useRef(null)
  const emojiRef = useRef(null)
  const emojiBtnRef = useRef(null)

  useEffect(() => {
    if (!emojiOpen) return
    const handler = (e) => {
      if (
        emojiRef.current && !emojiRef.current.contains(e.target) &&
        emojiBtnRef.current && !emojiBtnRef.current.contains(e.target)
      ) {
        setEmojiOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [emojiOpen])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, TEXTAREA_MAX_PX) + 'px'
  }, [text])

  useEffect(() => {
    if (replyTo) {
      const t = setTimeout(() => taRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [replyTo])

  const insertEmoji = useCallback((emoji) => {
    const ta = taRef.current
    if (!ta) {
      setText(prev => prev + emoji)
      return
    }
    const start = ta.selectionStart ?? text.length
    const end = ta.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + emoji.length
      ta.setSelectionRange(pos, pos)
    })
  }, [text])

  const submit = useCallback(async () => {
    if (disabled || sending) return
    const trimmed = text.trim()
    if (!trimmed && !attachment) return
    setSending(true)
    try {
      const ok = await onSubmit?.({
        text: trimmed,
        attachment,
        replyToId: replyTo?.id || null,
      })
      if (ok !== false) {
        setText('')
        setAttachment(null)
        setSizeError(null)
        onCancelReply?.()
        requestAnimationFrame(() => {
          if (taRef.current) taRef.current.style.height = 'auto'
        })
      }
    } finally {
      setSending(false)
    }
  }, [text, attachment, disabled, sending, onSubmit, replyTo, onCancelReply])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const pickFile = () => {
    if (disabled) return
    fileInputRef.current?.click()
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSizeError(null)
    const isImage = file.type.startsWith('image/')
    const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
    if (file.size > limit) {
      const mb = (limit / 1024 / 1024).toFixed(0)
      setSizeError(`${isImage ? 'imagem' : 'arquivo'} maior que ${mb}MB`)
      return
    }
    try {
      const dataUrl = isImage ? await readFileAsDataUrl(file) : null
      setAttachment({
        file,
        dataUrl,
        type: file.type || 'application/octet-stream',
        name: file.name,
        size: file.size,
        kind: isImage ? 'image' : 'file',
      })
    } catch {
      setSizeError('falha ao ler o arquivo')
    }
  }

  const canSend = !disabled && !sending && (text.trim().length > 0 || attachment)

  return (
    <div className={`relative z-20 shrink-0 ${className}`}>
      <div className="flex items-end gap-3 px-4 sm:px-6 pt-2 pb-4">
        <div className="flex-1 min-w-0">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface1 border border-line">
              <CornerUpLeft size={12} className="text-accent shrink-0" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="text-[10.5px] text-accent font-semibold">
                  respondendo a {replyTo.author || 'peer'}
                </p>
                <p className="text-[11px] text-muted truncate">
                  {replyTo.deleted
                    ? 'mensagem apagada'
                    : (replyTo.text || (isImageAttachment(replyTo.attachment) ? '' : replyTo.attachment?.name) || '')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCancelReply?.()}
                className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-strong hover:bg-surface2"
                title="Cancelar resposta"
                aria-label="Cancelar resposta"
              >
                <X size={11} />
              </button>
            </div>
          )}

          {attachment && (
            <div className="mb-2 flex items-center gap-2">
              {attachment.kind === 'image' && attachment.dataUrl ? (
                <div className="relative">
                  <img
                    src={attachment.dataUrl}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover bg-black/30 border border-line"
                  />
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    aria-label="Remover imagem"
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-surface1 border border-line flex items-center justify-center text-muted hover:text-danger hover:bg-danger/15"
                    title="Remover"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface1 border border-line flex-1 min-w-0">
                  <span className="h-11 w-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <FileText size={16} strokeWidth={1.8} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-strong truncate">{attachment.name}</p>
                    <p className="text-[10px] text-muted">{formatBytes(attachment.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    aria-label="Remover anexo"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/15 transition-colors shrink-0"
                    title="Remover"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {sizeError && (
            <p className="mb-1.5 px-1 text-[11px] text-danger">{sizeError}</p>
          )}

          <div className="flex items-end gap-0.5 px-2 py-1.5 rounded-[26px] bg-[#1a1c22] border border-white/[0.07] min-h-[52px]">
            <button
              type="button"
              onClick={pickFile}
              disabled={disabled}
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors shrink-0 disabled:opacity-40"
              title="Anexar foto ou documento"
              aria-label="Anexar foto ou documento"
            >
              <Plus size={18} strokeWidth={1.75} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={handleFile}
            />

            <div className="relative self-end">
              <button
                ref={emojiBtnRef}
                type="button"
                onClick={() => setEmojiOpen(o => !o)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors shrink-0"
                title="Emoji"
                aria-label="Abrir seletor de emoji"
                aria-expanded={emojiOpen}
              >
                <Smile size={17} strokeWidth={1.75} />
              </button>
              {emojiOpen && (
                <div ref={emojiRef} className="absolute bottom-full left-0 mb-2 z-40 vc-anim-fade-in-up">
                  <EmojiPicker
                    onPick={(em) => {
                      insertEmoji(em)
                      setEmojiOpen(false)
                    }}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors shrink-0"
              title="Áudio em breve"
              aria-label="Áudio em breve"
            >
              <Mic size={17} strokeWidth={1.75} />
            </button>

            <textarea
              ref={taRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={disabled}
              placeholder={placeholder}
              className="flex-1 resize-none bg-transparent text-[14px] text-strong placeholder:text-muted/70 focus:outline-none leading-[1.45] px-1.5 py-2 overflow-y-auto"
              style={{ maxHeight: TEXTAREA_MAX_PX }}
            />

            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="w-10 h-10 rounded-full flex items-center justify-center text-strong transition-all shrink-0 disabled:opacity-35 disabled:cursor-not-allowed self-end"
              style={{
                backgroundColor: 'var(--space-accent)',
                boxShadow: canSend ? '0 6px 20px -8px var(--space-accent-glow-24)' : 'none',
              }}
              aria-label="Enviar mensagem"
              title="Enviar"
            >
              <Send size={15} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <p className="hidden lg:block w-[120px] shrink-0 pb-1.5 text-[10px] text-muted/80 leading-[1.45]">
          Enter para enviar
          <br />
          Shift+Enter nova linha
        </p>
      </div>
    </div>
  )
}

function isImageAttachment(att) {
  if (!att) return false
  return att.kind === 'image' || String(att.type || '').startsWith('image/')
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
