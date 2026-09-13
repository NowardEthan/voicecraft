/**
 * EmojiReactions — counts under a bubble. The picker portals to body so
 * it is never clipped by the message scroller or the chat header.
 */
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Smile } from 'lucide-react'
import EmojiPicker from './EmojiPicker'

const PICKER_W = 300
const PICKER_H = 264

export default function EmojiReactions({
  reactions = {},
  onToggle,
  onPick,
  className = '',
  hideAdd = false,
  hideList = false,
  registerOpen,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const pickerRef = useRef(null)
  const pickerBtnRef = useRef(null)

  const placePicker = (el) => {
    const rect = el?.getBoundingClientRect?.() || pickerBtnRef.current?.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0 && !el)) return
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceAbove > PICKER_H + 12 || spaceAbove > spaceBelow
    let top = openUp ? rect.top - PICKER_H - 8 : rect.bottom + 8
    let left = rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - PICKER_W - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - PICKER_H - 8))
    setPos({ top, left })
  }

  const togglePicker = (el) => {
    if (pickerOpen) {
      setPickerOpen(false)
      return
    }
    placePicker(el)
    setPickerOpen(true)
  }

  useEffect(() => {
    registerOpen?.((el) => togglePicker(el))
  })

  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        pickerBtnRef.current && !pickerBtnRef.current.contains(e.target)
      ) {
        setPickerOpen(false)
      }
    }
    const onReposition = () => placePicker()
    const onScroll = (e) => {
      if (pickerRef.current?.contains(e.target)) return
      setPickerOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [pickerOpen])

  const entries = Object.entries(reactions).filter(([, v]) => v && v.count > 0)
  const prevRef = useRef(null)
  const [pop, setPop] = useState({})

  useEffect(() => {
    const counts = Object.fromEntries(entries.map(([e, i]) => [e, i.count]))
    if (prevRef.current == null) {
      prevRef.current = counts
      return
    }
    const next = {}
    for (const [emoji, info] of entries) {
      const prev = prevRef.current[emoji] || 0
      if (info.count > prev) next[emoji] = Date.now()
    }
    prevRef.current = counts
    if (Object.keys(next).length) setPop((p) => ({ ...p, ...next }))
  }, [reactions])

  const portal =
    pickerOpen && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={pickerRef}
            className="fixed z-[80] animate-fade-in-up"
            style={{ top: pos.top, left: pos.left, width: PICKER_W }}
            onWheel={(e) => e.stopPropagation()}
          >
            <EmojiPicker
              compact
              onPick={(em) => {
                onPick?.(em)
                setPickerOpen(false)
              }}
            />
          </div>,
          document.body,
        )
      : null

  return (
    <div className={`flex flex-wrap items-center gap-1 ${entries.length ? 'mt-0.5' : ''} ${className}`}>
      {!hideList && entries.map(([emoji, info]) => {
        const mine = !!info.mine
        return (
          <button
            key={`${emoji}-${pop[emoji] || 0}`}
            type="button"
            data-emoji={emoji}
            onClick={() => onToggle?.(emoji)}
            aria-pressed={mine}
            aria-label={`${emoji}, ${info.count} ${info.count === 1 ? 'reação' : 'reações'}`}
            className={
              'vc-react-pill relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ' +
              'border transition-all duration-150 overflow-visible ' +
              (mine
                ? 'vc-react-pill--mine bg-[color-mix(in_srgb,var(--vc-warning)_18%,var(--vc-surface-1))] border-[color-mix(in_srgb,var(--vc-warning)_55%,transparent)] text-strong shadow-[0_0_10px_-2px_color-mix(in_srgb,var(--vc-warning)_35%,transparent)]'
                : 'bg-[var(--vc-surface-1)] border-[color-mix(in_srgb,#ffffff_10%,transparent)] text-ink hover:bg-[var(--vc-surface-2)] hover:scale-[1.05] hover:border-[color-mix(in_srgb,var(--vc-warning)_30%,transparent)]') +
              (pop[emoji] ? ' vc-react-pop' : '')
            }
          >
            {pop[emoji] ? (
              <span className="vc-react-burst" aria-hidden>{emoji}</span>
            ) : null}
            <span className="vc-react-face text-[13px] leading-none">{emoji}</span>
            <span className="tabular-nums font-semibold">{info.count}</span>
          </button>
        )
      })}

      <div className={
        hideAdd
          ? 'w-0 h-0 overflow-hidden'
          : (entries.length === 0 && !pickerOpen ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100' : '')
      }>
        <button
          ref={pickerBtnRef}
          type="button"
          onClick={togglePicker}
          className="
            vc-react-pill-add w-7 h-7 rounded-full border border-white/[0.08] bg-white/[0.04]
            flex items-center justify-center text-muted hover:text-[var(--vc-warning)]
            hover:bg-[color-mix(in_srgb,var(--vc-warning)_12%,transparent)]
            hover:border-[color-mix(in_srgb,var(--vc-warning)_45%,transparent)]
            hover:scale-[1.08] transition-all
          "
          title="Adicionar reação"
          aria-label="Adicionar reação"
          aria-expanded={pickerOpen}
        >
          <Smile size={13} strokeWidth={1.9} />
        </button>
      </div>
      {portal}
    </div>
  )
}
