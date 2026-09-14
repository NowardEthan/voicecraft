import { useMemo, useState } from 'react'
import { Calendar, Check, Plus, Trash2, Users, X } from 'lucide-react'
import { spaceTokens } from '../model/spaceTokens'
import { useEventRsvps } from '../hooks/useEventRsvps'

function uid() {
  return 'ev_' + Math.random().toString(36).slice(2, 10)
}

export default function SpaceEventsView({ space, onEditSpace, isCreator, canManageEvents = false, currentUserProfile }) {
  const events = Array.isArray(space?.events) ? space.events : []
  const [title, setTitle] = useState('')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const [busyEventId, setBusyEventId] = useState(null)
  const canEdit = !!(canManageEvents || isCreator)

  const { byEvent, goingCount, myRsvp, setRsvp, clearRsvp } = useEventRsvps(space?.id)

  const sorted = useMemo(
    () => [...events].sort((a, b) => (a.at || 0) - (b.at || 0)),
    [events],
  )

  const persist = (next) => {
    onEditSpace?.({ events: next })
  }

  const addEvent = (e) => {
    e?.preventDefault?.()
    const trimmed = title.trim()
    if (!trimmed) return
    const when = at ? new Date(at).getTime() : Date.now()
    persist([
      ...events,
      { id: uid(), title: trimmed, at: when, note: note.trim(), roomId: null },
    ])
    setTitle('')
    setAt('')
    setNote('')
  }

  const removeEvent = (id) => {
    persist(events.filter(ev => ev.id !== id))
  }

  const handleRsvp = async (eventId, status) => {
    if (!eventId || busyEventId) return
    setBusyEventId(eventId)
    try {
      await setRsvp(eventId, status, currentUserProfile)
    } catch (err) {
      console.error('RSVP failed', err)
    } finally {
      setBusyEventId(null)
    }
  }

  const handleClearRsvp = async (eventId) => {
    if (!eventId || busyEventId) return
    setBusyEventId(eventId)
    try {
      await clearRsvp(eventId)
    } finally {
      setBusyEventId(null)
    }
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas" style={spaceTokens(space)}>
      <div className="max-w-3xl mx-auto px-4 sm:px-10 pt-12 sm:pt-8 pb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-accent/15 text-accent flex items-center justify-center">
            <Calendar size={18} />
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-strong tracking-tight">Eventos</h1>
            <p className="text-[12.5px] text-muted">Encontros e horários deste Space.</p>
          </div>
        </div>

        {canEdit && (
          <form
            onSubmit={addEvent}
            className="mb-6 rounded-[16px] border border-line bg-surface1/80 backdrop-blur p-4 space-y-3"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Novo evento</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="Título (ex.: Game night)"
              className="w-full h-10 px-3 rounded-input bg-surface2 border border-line text-[13px] text-strong placeholder:text-muted focus:outline-none focus:border-accent/50"
            />
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
                className="w-full h-10 px-3 rounded-input bg-surface2 border border-line text-[13px] text-strong focus:outline-none focus:border-accent/50"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={160}
                placeholder="Nota opcional"
                className="w-full h-10 px-3 rounded-input bg-surface2 border border-line text-[13px] text-strong focus:outline-none focus:border-accent/50"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-pill bg-accent text-strong text-[12.5px] font-semibold"
            >
              <Plus size={14} />
              Criar evento
            </button>
          </form>
        )}

        {sorted.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-line bg-surface1/50 px-6 py-12 text-center">
            <Calendar size={22} className="mx-auto text-muted mb-3" />
            <p className="text-[14px] font-semibold text-strong">Nenhum evento ainda</p>
            <p className="text-[12.5px] text-muted mt-1">
              {canEdit ? 'Crie o primeiro encontro do Space.' : 'Quando alguém marcar um evento, ele aparece aqui.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sorted.map(ev => (
              <EventRow
                key={ev.id}
                ev={ev}
                canEdit={canEdit}
                onRemove={() => removeEvent(ev.id)}
                attendees={byEvent[ev.id] || []}
                goingCount={goingCount(ev.id)}
                myStatus={myRsvp(ev.id)?.status || null}
                busy={busyEventId === ev.id}
                onRsvp={(status) => handleRsvp(ev.id, status)}
                onClearRsvp={() => handleClearRsvp(ev.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EventRow({ ev, canEdit, onRemove, attendees, goingCount, myStatus, busy, onRsvp, onClearRsvp }) {
  return (
    <li className="rounded-[14px] border border-line bg-surface1/80 backdrop-blur px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
          <Calendar size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-strong truncate">{ev.title}</p>
          <p className="text-[11.5px] text-muted mt-0.5">
            {ev.at ? new Date(ev.at).toLocaleString('pt-BR') : 'Data a definir'}
          </p>
          {ev.note && <p className="text-[12px] text-ink mt-1">{ev.note}</p>}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onRemove}
            className="w-8 h-8 rounded-md text-muted hover:text-danger hover:bg-danger/10"
            aria-label="Remover evento"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <Attendees attendees={attendees} goingCount={goingCount} />

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {myStatus === 'going' ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClearRsvp}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-[12px] font-semibold bg-positive text-on-color hover:opacity-90 disabled:opacity-50"
          >
            <Check size={13} strokeWidth={2.6} />
            Você vai
            <span className="opacity-70 font-normal">· reverter</span>
          </button>
        ) : myStatus === 'not_going' ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClearRsvp}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-[12px] font-semibold bg-danger text-on-color hover:opacity-90 disabled:opacity-50"
          >
            <X size={13} strokeWidth={2.6} />
            Você não vai
            <span className="opacity-70 font-normal">· reverter</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRsvp('going')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-[12px] font-semibold border border-white/[0.08] bg-white/[0.04] text-strong hover:bg-white/[0.08] hover:border-positive/40 disabled:opacity-50"
            >
              <Check size={13} strokeWidth={2.4} />
              Vou participar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRsvp('not_going')}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-[12px] font-semibold border border-white/[0.08] bg-white/[0.04] text-muted hover:bg-white/[0.08] hover:text-strong disabled:opacity-50"
            >
              <X size={13} strokeWidth={2.4} />
              Não vou
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function Attendees({ attendees, goingCount }) {
  const going = attendees.filter((a) => a.status === 'going')
  if (going.length === 0) {
    return (
      <p className="mt-3 text-[11.5px] text-muted inline-flex items-center gap-1.5">
        <Users size={11} />
        Ninguém confirmou ainda
      </p>
    )
  }
  const shown = going.slice(0, 5)
  const extra = going.length - shown.length
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="flex -space-x-2">
        {shown.map((a) => (
          <AttendeeAvatar key={a.id || a.userId} attendee={a} />
        ))}
        {extra > 0 && (
          <span className="w-7 h-7 rounded-full bg-white/[0.06] border-2 border-surface1 text-[10px] font-semibold text-strong flex items-center justify-center">
            +{extra}
          </span>
        )}
      </div>
      <p className="text-[11.5px] text-muted">
        <span className="text-strong font-semibold">{goingCount}</span> confirmado{goingCount === 1 ? '' : 's'}
      </p>
    </div>
  )
}

function AttendeeAvatar({ attendee }) {
  const name = attendee.displayName || '?'
  if (attendee.photoURL) {
    return (
      <img
        src={attendee.photoURL}
        alt={name}
        title={name}
        className="w-7 h-7 rounded-full object-cover border-2 border-surface1"
        loading="lazy"
      />
    )
  }
  const letter = name.trim().slice(0, 1).toUpperCase() || '?'
  const bg = avatarGradient(name)
  return (
    <span
      title={name}
      className="w-7 h-7 rounded-full text-[10px] font-semibold text-white flex items-center justify-center border-2 border-surface1"
      style={{ background: bg }}
    >
      {letter}
    </span>
  )
}

function avatarGradient(name) {
  const palette = [
    'linear-gradient(135deg, #6366f1, #a78bfa)',
    'linear-gradient(135deg, #3b82f6, #60a5fa)',
    'linear-gradient(135deg, #ec4899, #f472b6)',
    'linear-gradient(135deg, #14b8a6, #5eead4)',
    'linear-gradient(135deg, #f59e0b, #fbbf24)',
    'linear-gradient(135deg, #8b5cf6, #c4b5fd)',
    'linear-gradient(135deg, #06b6d4, #67e8f9)',
  ]
  const idx = (name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % palette.length
  return palette[idx]
}
