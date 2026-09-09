import { useEffect, useState } from 'react'
import { Check, Rows3 } from 'lucide-react'
import { CHAT_DENSITIES, CHAT_DENSITY_ORDER } from './chatDensity'

export default function ChatDensityMenu({ value, onChange }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (e.target.closest?.('[data-density-menu]')) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative shrink-0" data-density-menu>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors"
        title="Densidade das mensagens"
        aria-label="Densidade das mensagens"
        aria-expanded={open}
      >
        <Rows3 size={16} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-48 py-1 rounded-xl bg-surface1 border border-line shadow-2xl vc-anim-fade-in-up">
          <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Visualização
          </p>
          {CHAT_DENSITY_ORDER.map((key) => {
            const item = CHAT_DENSITIES[key]
            const on = value === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
                className={
                  'w-full flex items-start gap-2 px-3 py-1.5 text-left transition-colors ' +
                  (on ? 'bg-accent/10 text-strong' : 'text-ink hover:bg-surface2 hover:text-strong')
                }
              >
                <span className="w-3.5 pt-0.5 shrink-0">
                  {on && <Check size={13} strokeWidth={2.4} className="text-accent" />}
                </span>
                <span>
                  <span className="block text-[12.5px] font-medium">{item.label}</span>
                  <span className="block text-[10.5px] text-muted">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
