import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Smile } from 'lucide-react'
import EmojiPicker from '../../../components/ui/EmojiPicker'

/**
 * Smile button that opens the shared EmojiPicker near the trigger.
 * Used by rich-text toolbars and title/caption inputs.
 */
export function EmojiInsertButton({
  onPick,
  title = 'Inserir emoji',
  className = '',
  buttonClassName = '',
  compact = true,
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target)
        && btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setPos(null)
      return undefined
    }
    const place = () => {
      const btn = btnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const width = compact ? 336 : 392
      const height = compact ? 316 : 420
      let left = r.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      let top = r.bottom + 6
      if (top + height > window.innerHeight - 8) {
        top = Math.max(8, r.top - height - 6)
      }
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, compact])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={
          buttonClassName
          || (
            'w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-white/5 '
            + (open ? 'text-ink bg-white/10 ' : '')
            + className
          )
        }
      >
        <Smile size={13} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[120] vc-emoji-panel-portal"
          style={{ top: pos.top, left: pos.left }}
          role="dialog"
          aria-label="Seletor de emoji"
        >
          <EmojiPicker
            compact={compact}
            onPick={(emoji) => {
              onPick?.(emoji)
              setOpen(false)
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

/** Text input with an emoji insert button (cursor-aware). */
export function EmojiTextInput({
  value = '',
  onChange,
  className = '',
  inputClassName = '',
  inputRef: externalRef = null,
  ...inputProps
}) {
  const localRef = useRef(null)
  const setRef = (node) => {
    localRef.current = node
    if (typeof externalRef === 'function') externalRef(node)
    else if (externalRef) externalRef.current = node
  }

  const insertEmoji = (emoji) => {
    const el = localRef.current
    const cur = String(value ?? '')
    if (!el) {
      onChange?.(cur + emoji)
      return
    }
    const start = el.selectionStart ?? cur.length
    const end = el.selectionEnd ?? start
    const next = cur.slice(0, start) + emoji + cur.slice(end)
    onChange?.(next)
    requestAnimationFrame(() => {
      try {
        el.focus()
        const pos = start + emoji.length
        el.setSelectionRange(pos, pos)
      } catch { /* ignore */ }
    })
  }

  return (
    <div className={`relative flex items-center gap-1 w-full ${className}`}>
      <input
        ref={setRef}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={inputClassName || 'flex-1 min-w-0'}
        spellCheck
        lang="pt-BR"
        autoCorrect="on"
        autoCapitalize="sentences"
        {...inputProps}
      />
      <EmojiInsertButton
        onPick={insertEmoji}
        buttonClassName="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-white/5 border border-line bg-[#1a1e28]"
      />
    </div>
  )
}
