/**
 * Composer — text + attachments. Plus / emoji / mic, send pill, Enter hint.
 *
 * Phase 3A additions:
 *   - Ctrl+V of images via `onPaste` handler.
 *   - ArrowUp (textarea empty) → edit last own message (handler prop).
 *   - Esc cancels reply / pending action.
 *
 * Phase 2 (CONTRATO_FASE2_ACEITE.md) additions:
 *   - Mention / room suggestion popover when @ or # is typed.
 *   - Drag-and-drop overlay covering the composer when files are
 *     dragged over it (visual hint).
 *   - Premium gradient + blur container.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Smile, Plus, Send, X, CornerUpLeft, FileText, Image as ImageIcon,
} from 'lucide-react'
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, readFileAsDataUrl } from '../../hooks/useChat'
import EmojiPicker from '../ui/EmojiPicker'
import { flashToast } from '../../shared/utils/toast'
import MentionSuggestions, {
  computeMentionSuggestions,
  detectMentionTrigger,
  applyMentionReplacement,
} from '../../features/chat/MentionSuggestions'

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json'
const IMAGE_ACCEPT = 'image/*'
const TEXTAREA_MAX_PX = 160

export default function Composer({
  disabled = false,
  placeholder = 'Conversar…',
  onSubmit,
  replyTo = null,
  onCancelReply,
  className = '',
  onArrowUpEditLast,
  onTextChange,
  members = [],
  rooms = [],
  currentUserId = null,
  accent = null,
  channelName = null,
}) {
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiPos, setEmojiPos] = useState(null)
  const [sizeError, setSizeError] = useState(null)
  const [sending, setSending] = useState(false)

  /* Mention / room suggestion popover state (CONTRATO_FASE2) */
  const [mention, setMention] = useState(null) // null | { kind, query, queryStart, queryEnd, items, selectedId, anchor }
  const [dragOver, setDragOver] = useState(false)

  /* Derive members / rooms passed to the popover.
   * For members we build a stable id from userId (no duplicates). For
   * rooms we pass the entries as-is.                                   */
  const memberItems = members || []
  const roomItems = (rooms || []).filter((r) => r && r.id && !String(r.id).startsWith('__optimistic__'))

  /* Notify parent of text changes (used by typing tracker) */
  useEffect(() => {
    onTextChange?.(text)
  }, [text, onTextChange])

  const taRef = useRef(null)
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const emojiRef = useRef(null)
  const emojiBtnRef = useRef(null)
  const composerShellRef = useRef(null)

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

  /* Compute picker portal position — anchored ABOVE the composer shell,
   * horizontally centered relative to it. Mirrors the portal technique
   * used by EmojiReactions.jsx, but uses the composer container (not
   * the button) so the picker sits centered on the whole composer.
   *
   * Constants match EmojiPicker default size (width=392, height=420). */
  const computeEmojiPos = useCallback(() => {
    const btn = emojiBtnRef.current
    const shell = composerShellRef.current
    if (!btn || !shell) return null
    const btnRect = btn.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const PICKER_W = 392
    const PICKER_H = 420
    // Horizontal: center on composer shell, clamp to viewport.
    let left = shellRect.left + (shellRect.width - PICKER_W) / 2
    left = Math.max(12, Math.min(left, window.innerWidth - PICKER_W - 12))
    // Vertical: above the composer with 8px gap; fallback below the
    // smile button only if there really isn't room above.
    let top = shellRect.top - PICKER_H - 8
    if (top < 12) top = btnRect.bottom + 8
    top = Math.max(12, Math.min(top, window.innerHeight - PICKER_H - 12))
    return { top, left }
  }, [])

  const toggleEmoji = useCallback(() => {
    if (emojiOpen) {
      setEmojiOpen(false)
      setEmojiPos(null)
      return
    }
    setEmojiOpen(true)
  }, [emojiOpen])

  /* Calculate emojiPos AFTER the CSS transition on the spacer has begun.
   * Two rAFs guarantee the layout flush (first frame after class change)
   * AND the start of the transition (second frame). Without this, the
   * picker appears overlapping the chat feed because getBoundingClientRect
   * returns the pre-transition position. */
  useEffect(() => {
    if (!emojiOpen) {
      setEmojiPos(null)
      return undefined
    }
    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setEmojiPos(computeEmojiPos())
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [emojiOpen, computeEmojiPos])

  /* Reposition the picker portal on scroll/resize so it stays glued to
   * the composer even when the chat scrolls or the window resizes. */
  useEffect(() => {
    if (!emojiOpen) return undefined
    const handler = () => setEmojiPos(computeEmojiPos())
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [emojiOpen, computeEmojiPos])

  /* Compute the popover anchor from the textarea caret position. We
   * use a simple bounding rect approach: the caret's column is the X
   * offset of the *caret*, and Y is the textarea's bottom edge. The
   * MentionSuggestions component flips to "below" if there isn't room
   * above.                                                          */
  const computeAnchor = useCallback(() => {
    const ta = taRef.current
    if (!ta) return null
    const rect = ta.getBoundingClientRect()
    return { left: rect.left + 16, top: rect.top, bottom: rect.bottom }
  }, [])

  /* Re-evaluate the popover on every text update. Trigger detection is
   * a pure helper (detectMentionTrigger) that runs against the caret
   * position read from the textarea DOM element.                     */
  const refreshMention = useCallback((nextText, caretPos) => {
    const ta = taRef.current
    if (!ta) return
    const caret = (caretPos != null) ? caretPos : (ta.selectionStart ?? nextText.length)
    const trig = detectMentionTrigger(nextText, caret)
    if (!trig.active) {
      if (mention) setMention(null)
      return
    }
    const items = computeMentionSuggestions({
      kind: trig.kind,
      query: trig.query,
      members: memberItems,
      rooms: roomItems,
    })
    if (items.length === 0) {
      // Keep the popover open but empty — gives the user feedback.
      setMention((prev) => prev && prev.kind === trig.kind
        ? { ...prev, query: trig.query, items: [], selectedId: null, anchor: computeAnchor() }
        : {
            kind: trig.kind,
            query: trig.query,
            queryStart: trig.queryStart,
            queryEnd: trig.queryEnd,
            triggerStart: trig.triggerStart,
            items: [],
            selectedId: null,
            anchor: computeAnchor(),
          })
      return
    }
    setMention((prev) => {
      const selectedId = items[0].id || items[0].userId
      if (
        prev
        && prev.kind === trig.kind
        && prev.query === trig.query
        && prev.anchor && prev.anchor.left === (computeAnchor()?.left)
      ) {
        // No-op update — same query + same anchor.
        return prev
      }
      return {
        kind: trig.kind,
        query: trig.query,
        queryStart: trig.queryStart,
        queryEnd: trig.queryEnd,
        triggerStart: trig.triggerStart,
        items,
        selectedId,
        anchor: computeAnchor(),
      }
    })
  }, [mention, memberItems, roomItems, computeAnchor])

  /* Selecting a popover item replaces `@query`/`#query` with the
   * official display name and closes the popover.                     */
  const selectMentionItem = useCallback((item) => {
    if (!mention) return
    const ta = taRef.current
    const { newText, newCaret } = applyMentionReplacement(
      text,
      mention.triggerStart,
      mention.queryEnd,
      item,
      mention.kind,
    )
    setText(newText)
    setMention(null)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      try { ta.setSelectionRange(newCaret, newCaret) } catch {}
      // Recompute popover once caret is placed.
      refreshMention(newText, newCaret)
    })
  }, [mention, text, refreshMention])

  /* Close on outside click. */
  useEffect(() => {
    if (!mention) return undefined
    const handler = (e) => {
      if (e.target?.closest?.('.vc-mention-popover')) return
      if (taRef.current && taRef.current.contains(e.target)) return
      setMention(null)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [mention])

  /* Re-anchor on scroll/resize while popover is open. */
  useEffect(() => {
    if (!mention) return undefined
    const handler = () => setMention((prev) => prev ? { ...prev, anchor: computeAnchor() } : prev)
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [mention, computeAnchor])

  const submit = useCallback(async () => {
    if (disabled || sending) return
    const trimmed = text.trim()
    if (!trimmed && !attachment) return

    const payload = {
      text: trimmed,
      attachment,
      replyToId: replyTo?.id || null,
    }
    const prevText = text
    const prevAttachment = attachment

    // Clear immediately — don't wait for network round-trip.
    setText('')
    setAttachment(null)
    setSizeError(null)
    setMention(null)
    onCancelReply?.()
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.style.height = 'auto'
        taRef.current.focus()
      }
    })

    setSending(true)
    try {
      const ok = await onSubmit?.(payload)
      if (ok === false) {
        setText(prevText)
        setAttachment(prevAttachment)
      }
    } catch {
      setText(prevText)
      setAttachment(prevAttachment)
    } finally {
      setSending(false)
    }
  }, [text, attachment, disabled, sending, onSubmit, replyTo, onCancelReply])

  const handleKey = (e) => {
    // Popover open? Then ↑/↓/Enter/Escape are owned by it.
    if (mention && mention.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const idx = mention.items.findIndex((m) => (m.id || m.userId) === mention.selectedId)
        const nextIdx = idx < 0 ? 0 : (idx + 1) % mention.items.length
        setMention((prev) => prev ? { ...prev, selectedId: prev.items[nextIdx].id || prev.items[nextIdx].userId } : prev)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = mention.items.findIndex((m) => (m.id || m.userId) === mention.selectedId)
        const nextIdx = idx <= 0 ? mention.items.length - 1 : idx - 1
        setMention((prev) => prev ? { ...prev, selectedId: prev.items[nextIdx].id || prev.items[nextIdx].userId } : prev)
        return
      }
      if (e.key === 'Enter') {
        const idx = mention.items.findIndex((m) => (m.id || m.userId) === mention.selectedId)
        if (idx >= 0) {
          e.preventDefault()
          selectMentionItem(mention.items[idx])
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }
    if (e.key === 'Escape' && mention) {
      e.preventDefault()
      setMention(null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === 'Escape' && replyTo) {
      e.preventDefault()
      onCancelReply?.()
      return
    }
    if (e.key === 'ArrowUp' && text.length === 0 && !sending && !attachment) {
      e.preventDefault()
      if (onArrowUpEditLast) onArrowUpEditLast()
    }
  }

  const pickFile = () => {
    if (disabled) return
    fileInputRef.current?.click()
  }

  const pickImage = () => {
    if (disabled) return
    imageInputRef.current?.click()
  }

  const ingestFile = useCallback(async (file) => {
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
        name: file.name || 'anexo',
        size: file.size,
        kind: isImage ? 'image' : 'file',
      })
    } catch {
      setSizeError('falha ao ler o arquivo')
    }
  }, [])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await ingestFile(file)
  }

  /* Ctrl+V of images */
  const handlePaste = useCallback(async (e) => {
    if (disabled) return
    const items = e.clipboardData?.items
    if (!items || items.length === 0) return
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file' && it.type?.startsWith('image/')) {
        const file = it.getAsFile?.()
        if (file) {
          e.preventDefault()
          await ingestFile(file)
          // Keep the pasted text (if any) flowing into the textarea normally
          // by NOT calling preventDefault for non-image kinds — but our loop
          // only stops at the first image. If there's also text, the default
          // behavior continues and the textarea receives it. We DO call
          // preventDefault to avoid the browser inserting a "filename" for
          // the image (Discord-style behavior).
          break
        }
      }
    }
  }, [disabled, ingestFile])

  /* Drag-and-drop overlay (CONTRATO_FASE2) — visual hint while the user
   * drags a file over the composer. We do not capture the actual drop
   * here yet (that's a future enhancement); this is just a UI affordance
   * that mirrors Discord's composer-on-hover treatment.            */
  const handleDragOver = useCallback((e) => {
    if (disabled) return
    if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
      e.preventDefault()
      setDragOver(true)
    }
  }, [disabled])
  const handleDragLeave = useCallback(() => setDragOver(false), [])
  const handleDrop = useCallback((e) => {
    if (disabled) return
    const file = e.dataTransfer?.files?.[0]
    if (!file) { setDragOver(false); return }
    e.preventDefault()
    setDragOver(false)
    ingestFile(file)
  }, [disabled, ingestFile])

  const canSend = !disabled && !sending && (text.trim().length > 0 || attachment)

  return (
    <div
      className={`relative z-20 shrink-0 vc-composer-shell ${className} ${
        emojiOpen ? 'vc-composer-shell--picker-open' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Reserved space for the emoji picker — always rendered so the chat
          smoothly grows/shrinks as the picker opens/closes. The picker
          itself is rendered via portal above the composer (absolute position
          via getBoundingClientRect of the row below), so this spacer is what
          physically pushes the chat feed upward when emojiOpen = true. */}
      <div
        aria-hidden
        className="vc-composer-picker-spacer"
      />

      <div
        ref={composerShellRef}
        className="flex items-end gap-3 px-4 sm:px-6 pt-2 pb-4"
      >
        <div className="flex-1 min-w-0">
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface1 border border-line">
              <CornerUpLeft size={12} className="text-accent shrink-0" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="text-[10.5px] text-accent font-semibold">
                  respondendo a {replyTo.authorHandle ? `@${replyTo.authorHandle}` : (replyTo.author || 'peer')}
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

          {emojiOpen && emojiPos && typeof document !== 'undefined' && createPortal(
            <div
              ref={emojiRef}
              className="fixed z-[80] vc-emoji-panel-portal"
              style={{ top: emojiPos.top, left: emojiPos.left }}
              role="dialog"
              aria-label="Seletor de emoji"
              data-vc-emoji="v4-portal"
              onWheel={(e) => e.stopPropagation()}
            >
              <EmojiPicker
                onPick={(em) => {
                  insertEmoji(em)
                  setEmojiOpen(false)
                  setEmojiPos(null)
                }}
              />
            </div>,
            document.body
          )}

          <div
            className="vc-composer-pill flex items-center gap-1 pl-2.5 pr-2 py-2 rounded-full min-h-[52px] relative"
            style={accent ? { '--composer-accent': accent } : undefined}
          >
            {/* Left: + only (anexar) */}
            <button
              type="button"
              onClick={pickFile}
              disabled={disabled}
              className="vc-composer-icon vc-composer-plus w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
              title="Anexar arquivo"
              aria-label="Anexar foto ou documento"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={handleFile}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="hidden"
              onChange={handleFile}
            />

            <div className="relative flex-1 min-w-0 self-center">
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => {
                  const next = e.target.value
                  setText(next)
                  refreshMention(next, e.target.selectionStart)
                }}
                onKeyDown={handleKey}
                onPaste={handlePaste}
                onClick={(e) => refreshMention(text, e.currentTarget.selectionStart)}
                onSelect={(e) => refreshMention(text, e.currentTarget.selectionStart)}
                rows={1}
                disabled={disabled}
                placeholder=""
                className="w-full resize-none bg-transparent text-[14px] text-strong focus:outline-none leading-[1.45] px-2 py-2 overflow-y-auto"
                style={{ maxHeight: TEXTAREA_MAX_PX }}
              />
              {!text && !attachment && (
                <div className="pointer-events-none absolute inset-0 flex items-center px-2 py-2 text-[14px] leading-[1.45] truncate vc-composer-placeholder">
                  {channelName ? (
                    <span>Conversar em #{channelName.toLowerCase().replace(/\s+/g, '-')}…</span>
                  ) : (
                    <span>{placeholder}</span>
                  )}
                </div>
              )}
            </div>

            {/* Right utilities: GIF · image · emoji */}
            <div className="flex items-center gap-0.5 shrink-0 self-center">
              <button
                type="button"
                onClick={() => flashToast('GIFs em breve')}
                disabled={disabled}
                className="vc-composer-icon vc-composer-gif h-8 px-1.5 rounded-md flex items-center justify-center shrink-0 disabled:opacity-40"
                title="GIF"
                aria-label="Inserir GIF"
              >
                <span className="vc-composer-gif-label">GIF</span>
              </button>
              <button
                type="button"
                onClick={pickImage}
                disabled={disabled}
                className="vc-composer-icon w-9 h-9 rounded-full flex items-center justify-center shrink-0 disabled:opacity-40"
                title="Enviar imagem"
                aria-label="Enviar imagem"
              >
                <ImageIcon size={18} strokeWidth={1.75} />
              </button>
              <button
                ref={emojiBtnRef}
                type="button"
                onClick={toggleEmoji}
                className={
                  'vc-composer-icon w-9 h-9 rounded-full flex items-center justify-center shrink-0 ' +
                  (emojiOpen ? 'is-active' : '')
                }
                title="Emoji"
                aria-label="Abrir seletor de emoji"
                aria-expanded={emojiOpen}
              >
                <Smile size={18} strokeWidth={1.75} />
              </button>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="vc-composer-send w-10 h-10 rounded-full flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed self-center ml-0.5"
              aria-label="Enviar mensagem"
              title="Enviar"
            >
              <Send size={16} strokeWidth={2.4} className="vc-composer-send-icon" />
            </button>
          </div>
        </div>
      </div>

      {dragOver && (
        <div className="vc-composer-drop" aria-hidden>
          Solte o arquivo aqui pra anexar
        </div>
      )}

      {mention && mention.anchor && (
        <MentionSuggestions
          anchor={mention.anchor}
          placement="top"
          kind={mention.kind}
          query={mention.query}
          items={mention.items}
          selectedId={mention.selectedId}
          currentUserId={currentUserId}
          onSelect={selectMentionItem}
          onClose={() => setMention(null)}
        />
      )}
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
