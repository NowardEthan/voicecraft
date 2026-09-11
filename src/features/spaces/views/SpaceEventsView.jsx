import { useMemo, useState } from 'react'
import { Calendar, Plus, Trash2 } from 'lucide-react'
import { spaceTokens } from '../model/spaceTokens'

function uid() {
  return 'ev_' + Math.random().toString(36).slice(2, 10)
}

export default function SpaceEventsView({ space, onEditSpace, isCreator, canManageEvents = false }) {
  const events = Array.isArray(space?.events) ? space.events : []
  const [title, setTitle] = useState('')
  const [at, setAt] = useState('')
  const [note, setNote] = useState('')
  const canEdit = !!(canManageEvents || isCreator)

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
                className="w-full h-10 px-3 rounded-input bg-surface2 border border-line text-[13px] text-strong placeholder:text-muted focus:outline-none focus:border-accent/50"
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
              <li
                key={ev.id}
                className="flex items-start gap-3 rounded-[14px] border border-line bg-surface1/80 backdrop-blur px-4 py-3"
              >
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
                    onClick={() => removeEvent(ev.id)}
                    className="w-8 h-8 rounded-md text-muted hover:text-danger hover:bg-danger/10"
                    aria-label="Remover evento"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
