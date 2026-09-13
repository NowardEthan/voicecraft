/**
 * ChatDensityMenu — picks Compacto / Confortável / Espaçado.
 * Portaled so the menu never paints under the message feed.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlignJustify, Check, Rows2, Rows3, StretchHorizontal } from 'lucide-react'
import {
  CHAT_DENSITIES,
  CHAT_DENSITY_ORDER,
  normalizeChatDensity,
} from './chatDensity'

const DENSITY_ICONS = {
  compacto: AlignJustify,
  confortavel: Rows3,
  espacado: StretchHorizontal,
}

export default function ChatDensityMenu({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const current = normalizeChatDensity(value)
  const CurrentIcon = DENSITY_ICONS[current] || Rows2

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return undefined
    }
    const update = () => {
      const el = btnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const width = 268
      let left = r.right - width
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPos({ top: r.bottom + 6, left, width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative shrink-0" data-density-menu>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          'vc-icon-btn w-9 h-9 rounded-full flex items-center justify-center transition-colors',
          open
            ? 'text-strong bg-white/[0.08]'
            : 'text-muted hover:text-strong hover:bg-white/[0.05]',
        ].join(' ')}
        title={`Densidade: ${CHAT_DENSITIES[current].label}`}
        aria-label="Densidade das mensagens"
        aria-expanded={open}
      >
        <CurrentIcon size={16} strokeWidth={1.75} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          data-density-menu
          role="menu"
          aria-label="Densidade do chat"
          className="fixed z-[200] py-1.5 rounded-2xl bg-[#15171c] border border-white/[0.1] shadow-[0_20px_50px_-16px_rgba(0,0,0,0.75)] animate-fade-in-up overflow-hidden"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <p className="px-3.5 pt-1.5 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            Densidade das mensagens
          </p>
          {CHAT_DENSITY_ORDER.map((key) => {
            const item = CHAT_DENSITIES[key]
            const on = current === key
            const Icon = DENSITY_ICONS[key] || Rows3
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                className={[
                  'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors',
                  on
                    ? 'bg-accent/12 text-strong'
                    : 'text-ink hover:bg-white/[0.05] hover:text-strong',
                ].join(' ')}
              >
                <span
                  className={[
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 border',
                    on
                      ? 'bg-accent/20 border-accent/30 text-accent'
                      : 'bg-white/[0.04] border-white/[0.08] text-muted',
                  ].join(' ')}
                >
                  <Icon size={15} strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="block text-[13px] font-semibold">{item.label}</span>
                    {on && <Check size={13} strokeWidth={2.4} className="text-accent shrink-0" />}
                  </span>
                  <span className="block text-[11px] text-muted mt-0.5 leading-snug">{item.hint}</span>
                  <span className="mt-1.5 flex items-end gap-[3px] h-3.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="rounded-[2px] bg-current opacity-40"
                        style={{
                          width: 14,
                          height: key === 'compacto' ? 4 + i : key === 'confortavel' ? 6 + i * 1.5 : 8 + i * 2,
                        }}
                      />
                    ))}
                  </span>
                </span>
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
