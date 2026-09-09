/**
 * Pill — a small inline badge used for tags like "3 aqui", "voz ao vivo",
 * "você". We deliberately keep this composable (tone + size) so we don't
 * end up with five bespoke badge components across the app.
 *
 * Tones:
 *   neutral — default soft-white chip
 *   accent  — uses CSS var --space-accent
 *   live    — coral/red, used for "live now" indicators
 *   muted   — very low contrast, for counts
 *
 * Props:
 *   tone:   'neutral' | 'accent' | 'live' | 'muted'
 *   size:   'xs' | 'sm'
 *   icon:   optional Lucide icon component
 *   className: extra classes
 */
export default function Pill({ tone = 'neutral', size = 'sm', icon: Icon, children, className = '' }) {
  const sizeCls = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px] gap-1'
    : 'px-2 py-0.5 text-[11px] gap-1.5'

  const toneCls = {
    neutral: 'bg-surface1 text-ink ring-1 ring-line',
    accent: 'bg-accent-soft text-accent ring-1 ring-accent/30',
    live: 'bg-danger/15 text-danger ring-1 ring-danger/30',
    muted: 'bg-canvas text-muted ring-1 ring-line',
  }[tone] || 'bg-surface1 text-ink ring-1 ring-line'

  return (
    <span
      className={
        'inline-flex items-center font-medium rounded-full whitespace-nowrap ' +
        sizeCls + ' ' + toneCls + ' ' + className
      }
    >
      {Icon && <Icon size={size === 'xs' ? 9 : 10} strokeWidth={2.5} />}
      {children}
    </span>
  )
}