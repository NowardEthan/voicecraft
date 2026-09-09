/**
 * EditableSummarySection — reusable wrapper for a review summary block.
 *
 * Renders a section title, a discreet "Editar" button on the right, and
 * a list of label/value rows. Used by both IdentitySummary and
 * FirstRoomSummary so the two sections share the exact same layout.
 *
 * Per spec §5/§6: the edit button returns to the originating step and
 * preserves all data. The wizard tracks the "came-from-review" intent
 * so a single press on the edit step's Continuar takes the user back.
 */
import { Pencil } from 'lucide-react'

export function EditableSummarySection({
  title,
  icon: Icon,
  editLabel,
  onEdit,
  rows,
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-strong">
          {Icon ? <Icon size={15} strokeWidth={1.75} className="text-muted" /> : null}
          <h3 className="text-[14px] font-semibold tracking-tight">
            {title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          className="
            inline-flex items-center gap-1.5 px-2 py-1 rounded-md
            text-[12px] font-medium text-accent
            hover:bg-accent/10 transition-colors
            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40
          "
        >
          <Pencil size={12} strokeWidth={1.75} />
          Editar
        </button>
      </header>
      <dl className="space-y-1.5">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-baseline gap-3 py-1 text-[12.5px]"
          >
            <dt className="w-[78px] shrink-0 text-muted">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-ink break-words">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
