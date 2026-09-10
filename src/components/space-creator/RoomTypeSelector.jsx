/**
 * RoomTypeSelector — compact picker for room kind (texto / voz).
 * Flat glass tiles, no outline rings. Column count follows `types.length`.
 */
import { Check } from 'lucide-react'

export function RoomTypeSelector({ types, value, onChange, ariaLabel = 'Tipo da sala', compact = false }) {
  if (!types || types.length === 0) return null

  const cols = Math.min(Math.max(types.length, 1), 5)

  const onKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = types[(idx + 1) % types.length]
      document.getElementById(`room-type-${next.key}`)?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = types[(idx - 1 + types.length) % types.length]
      document.getElementById(`room-type-${prev.key}`)?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      document.getElementById(`room-type-${types[0].key}`)?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      document.getElementById(`room-type-${types[types.length - 1].key}`)?.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {types.map((t, idx) => {
        const active = value === t.key
        const Icon = t.icon
        return (
          <button
            key={t.key}
            id={`room-type-${t.key}`}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t.label}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={[
              'relative rounded-2xl flex items-center justify-center outline-none',
              compact ? 'h-[72px] flex-col gap-1.5 px-2' : 'h-[64px] gap-2.5 px-3',
              'transition-[transform,background-color,color,box-shadow] duration-200',
              'focus-visible:ring-2 focus-visible:ring-white/20',
              active
                ? 'bg-accent text-strong shadow-[0_12px_28px_-12px_var(--space-accent-glow-40)]'
                : 'bg-white/[0.06] text-white/75 hover:bg-white/[0.10] hover:text-white hover:-translate-y-px active:scale-[0.98]',
            ].join(' ')}
          >
            <Icon
              size={compact ? 20 : 22}
              strokeWidth={1.9}
              className={active ? 'text-strong' : 'text-white/70'}
            />
            <span className={(compact ? 'text-[12px] ' : 'text-[13px] ') + 'font-semibold'}>
              {t.label}
            </span>
            {active && (
              <span
                aria-hidden
                className="
                  absolute top-2 right-2 w-4 h-4 rounded-full bg-black/25 text-strong
                  flex items-center justify-center
                "
              >
                <Check size={10} strokeWidth={3.5} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
