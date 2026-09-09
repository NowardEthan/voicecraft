/**
 * EmptyState — a quiet placeholder for sections without content. The icon
 * should be visually distinct but secondary to the title. We avoid the
 * generic "no data" illustration — the title + CTA pair is enough.
 *
 * Props:
 *   icon:     Lucide icon component
 *   title:    string
 *   body:     string (optional explanatory line)
 *   action:   optional { label, onClick }
 *   accent:   boolean — when true, uses --space-accent for icon bg
 */
import { ArrowRight } from 'lucide-react'

export default function EmptyState({ icon: Icon, title, body, action, accent = false }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 rounded-2xl border border-dashed border-line bg-canvas/50">
      <div
        className={
          'w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ' +
          (accent
            ? 'bg-accent-soft ring-1 ring-accent/30 text-accent'
            : 'bg-surface1 ring-1 ring-line text-muted')
        }
      >
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <p className="text-[14px] font-semibold text-strong tracking-tight mb-1">
        {title}
      </p>
      {body && (
        <p className="text-[12.5px] text-muted leading-relaxed max-w-sm mb-5">
          {body}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12.5px] font-medium bg-accent hover:opacity-90 text-strong transition-all active:scale-[0.98] shadow-lg shadow-accent/20"
        >
          {action.label}
          <ArrowRight size={13} strokeWidth={2.25} />
        </button>
      )}
    </div>
  )
}