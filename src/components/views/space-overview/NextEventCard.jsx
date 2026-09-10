import { memo } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { formatEventWhen, nextUpcomingEvent } from './overviewHelpers'

const NextEventCard = memo(function NextEventCard({ events = [], onOpenEvents }) {
  const next = nextUpcomingEvent(events)

  return (
    <section className="rounded-[18px] border border-white/[0.07] bg-[#14161c]/90 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays size={14} className="text-accent shrink-0" strokeWidth={1.75} />
          <h2 className="text-[14.5px] font-semibold text-strong tracking-tight">Próximo evento</h2>
        </div>
        {onOpenEvents && (
          <button
            type="button"
            onClick={onOpenEvents}
            className="text-[12.5px] font-semibold text-accent hover:opacity-90 inline-flex items-center gap-1"
          >
            Ver todos
            <ArrowRight size={12} strokeWidth={2.25} />
          </button>
        )}
      </div>

      <div className="px-4 sm:px-5 pb-4 pt-1">
        {!next ? (
          <div className="rounded-[14px] border border-dashed border-white/[0.08] bg-[#0e1016]/55 px-4 py-6 text-center">
            <p className="text-[13.5px] font-semibold text-strong">Nenhum evento marcado</p>
            <p className="text-[12.5px] text-muted mt-1 leading-snug">
              Crie um encontro pra galera se organizar.
            </p>
            {onOpenEvents && (
              <button
                type="button"
                onClick={onOpenEvents}
                className="mt-3.5 h-9 px-3.5 rounded-full text-[12.5px] font-semibold text-ink border border-white/[0.1] hover:bg-white/[0.05]"
              >
                Abrir eventos
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-[14px] border border-white/[0.07] bg-[#0e1016]/70 overflow-hidden flex gap-0">
            <div
              className="w-[88px] sm:w-[100px] shrink-0 bg-gradient-to-br from-accent/50 via-accent/20 to-[#1a0e14]"
              aria-hidden
            />
            <div className="min-w-0 flex-1 px-3.5 py-3">
              <p className="text-[11.5px] font-medium text-muted">
                {formatEventWhen(next.at)}
              </p>
              <p className="text-[14px] font-semibold text-strong mt-1 leading-snug line-clamp-2">
                {next.title || 'Evento'}
              </p>
              {next.note ? (
                <p className="text-[12px] text-muted mt-1 line-clamp-2 leading-snug">{next.note}</p>
              ) : null}
              <button
                type="button"
                onClick={onOpenEvents}
                className="mt-3 h-9 px-3.5 rounded-full text-[12.5px] font-semibold text-ink bg-white/[0.04] border border-white/[0.1] hover:bg-white/[0.08]"
              >
                Ver evento
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
})

export default NextEventCard
