/**
 * RoomTypeSelector — 5-segment compact picker for the first room's type.
 *
 * Spec:
 *   - Single row, 5 segments, equal width, 56–64px tall, 22–24px icons
 *   - 10–12px border-radius, 10px gap, dark charcoal background
 *   - Selected: coral translucent bg + coral border + small check in top-right
 *   - Hover: subtle contrast bump on unselected
 *   - Click + keyboard (Enter/Space) both select; arrow keys move focus
 *
 * Renders nothing when `types` is empty (defensive — caller should always
 * pass the canonical PURPOSES list).
 *
 * Performance: previously used framer-motion's `whileHover`/`whileTap` +
 * `layout` prop. `layout` was triggering a full layout pass on every
 * selection (causing noticeable jank on the wizard). Replaced with
 * CSS transitions on transform/background-color/border-color — visually
 * identical but zero per-frame JS work, no layout pass on selection.
 */
import { Check } from 'lucide-react'

export function RoomTypeSelector({ types, value, onChange, ariaLabel = 'Tipo da sala', compact = false }) {
  if (!types || types.length === 0) return null

  const onKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = types[(idx + 1) % types.length]
      const el = document.getElementById(`room-type-${next.key}`)
      el?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = types[(idx - 1 + types.length) % types.length]
      const el = document.getElementById(`room-type-${prev.key}`)
      el?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      const el = document.getElementById(`room-type-${types[0].key}`)
      el?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      const el = document.getElementById(`room-type-${types[types.length - 1].key}`)
      el?.focus()
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-[10px]"
      style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
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
            className={
              'relative rounded-[11px] border flex items-center justify-center ' +
              (compact
                ? 'h-[64px] flex-col gap-1 px-1.5 '
                : 'h-[60px] gap-2.5 px-3 ') +
              'transition-[transform,background-color,border-color,color,box-shadow] duration-200 outline-none ' +
              'focus-visible:ring-2 focus-visible:ring-accent/50 ' +
              (!active ? 'hover:-translate-y-px hover:bg-[#2a2c34] active:scale-[0.97] ' : '') +
              (active
                ? 'border-accent text-strong shadow-[0_0_18px_-4px_var(--space-accent-glow-32)]'
                : 'border-line bg-[#22232a] text-ink hover:text-strong')
            }
            style={
              active
                ? {
                    background:
                      'linear-gradient(180deg, rgba(255,63,108,0.20) 0%, rgba(255,63,108,0.10) 100%)',
                  }
                : undefined
            }
          >
            <span className="inline-flex">
              <Icon
                size={compact ? 18 : 22}
                strokeWidth={1.8}
                className={active ? 'text-[#ffb3c2]' : 'text-muted'}
              />
            </span>
            <span className={(compact ? 'text-[11px] ' : 'text-[13px] ') + 'font-semibold ' + (active ? 'text-strong' : 'text-ink')}>
              {t.label}
            </span>
            {active && (
              <span
                key="check"
                aria-hidden
                className="
                  absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-accent text-strong
                  flex items-center justify-center
                  shadow-[0_0_10px_-1px_var(--space-accent-glow-32)]
                  animate-modal-in
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
