import { memo } from 'react'
import { CalendarDays, Check, Pin } from 'lucide-react'
import { PersonAvatar } from '../../../features/people/components/PersonAvatar'
import { formatEventWhen, nextUpcomingEvent } from './overviewHelpers'

/**
 * Mockup "pinned" strip — surfaces the next real event when one exists.
 * Hidden when there is nothing to show (no fake pins).
 */
const EventSpotlightBar = memo(function EventSpotlightBar({
  events = [],
  members = [],
  onOpenEvents,
}) {
  const next = nextUpcomingEvent(events)
  if (!next) return null

  const host = members.find((m) => m.userId === next.createdBy)
    || members.find((m) => m.online)
    || members[0]

  return (
    <div className="rounded-[14px] border border-white/[0.07] bg-[#14161c]/95 px-3.5 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="relative shrink-0">
          <PersonAvatar
            src={host?.photoURL}
            name={host?.displayName || 'Space'}
            userId={host?.userId || 'space'}
            size={36}
          />
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-on-accent flex items-center justify-center ring-2 ring-[#14161c]">
            <Pin size={9} strokeWidth={2.5} />
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted truncate">
            Em destaque · {formatEventWhen(next.at)}
          </p>
          <p className="text-[13.5px] font-semibold text-strong truncate mt-0.5">
            {next.title || 'Evento'}
          </p>
          {next.note ? (
            <p className="text-[12px] text-muted line-clamp-1 mt-0.5">{next.note}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 sm:pl-2">
        <button
          type="button"
          onClick={onOpenEvents}
          className="h-9 px-3.5 rounded-full text-[12.5px] font-semibold text-on-accent bg-accent hover:brightness-110 inline-flex items-center gap-1.5"
        >
          <Check size={13} strokeWidth={2.25} />
          Ver evento
        </button>
        <button
          type="button"
          onClick={onOpenEvents}
          className="h-9 px-3.5 rounded-full text-[12.5px] font-semibold text-ink bg-white/[0.04] border border-white/[0.1] hover:bg-white/[0.08] inline-flex items-center gap-1.5"
        >
          <CalendarDays size={13} />
          Detalhes
        </button>
      </div>
    </div>
  )
})

export default EventSpotlightBar
