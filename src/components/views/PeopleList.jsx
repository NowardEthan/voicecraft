/**
 * PeopleDirectory — the "Pessoas" tab (DESIGN_SYSTEM §7.3).
 *
 * Features per spec:
 *   - Search input (filters by display name, case-insensitive)
 *   - Filter chips: Online / Todos / Com função (creator badge)
 *   - "Lista virtualizada" — we render the full list (counts in a real
 *     Space are small) but keep the row layout dense so the scroll
 *     surface stays predictable
 *   - Each person: rich card with avatar XL, name, status, role badge
 *   - Click opens ProfilePopover via the global helper
 */
import { useMemo, useState } from 'react'
import { Users, Search, X } from 'lucide-react'
import EmptyState from '../../shared/ui/EmptyState'
import PersonCard from '../people/PersonCard'

const FILTERS = [
  { key: 'online',   label: 'Online' },
  { key: 'all',      label: 'Todos' },
  { key: 'creators', label: 'Com função' },
]

export default function PeopleDirectory({
  space,
  members = [],
  currentUserId,
  currentRoomId,
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('online')

  // Sort + filter in one pass. Online first (when filter=online), then
  // alphabetical within each group; search applies to all visible sets.
  const { filtered, total } = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = members
    if (filter === 'online') {
      list = list.filter(m => m.online)
    } else if (filter === 'creators') {
      // "com função" = creator role (we only model 'creator' for now).
      list = list.filter(m => space?.createdBy === m.userId)
    }
    if (q) {
      list = list.filter(m => (m.displayName || '').toLowerCase().includes(q))
    }
    list.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    return { filtered: list, total: list.length }
  }, [members, query, filter, space])

  if (!space) return null

  const isFiltered = query.trim().length > 0

  return (
    <div className="py-2">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 pt-2 pb-2">
        <Users size={11} className="text-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-ink/65">
          Pessoas
        </span>
        <span className="text-[10px] text-muted tabular-nums">
          {total}/{members.length}
        </span>
      </div>

      {/* Search input */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="buscar por nome…"
            className="
              w-full pl-8 pr-7 py-1.5 rounded-lg
              bg-surface1 border border-line
              text-[12px] text-strong placeholder:text-muted
              focus:outline-none focus:border-accent/50 focus:bg-surface2
              transition-colors
            "
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-muted hover:text-strong hover:bg-surface2"
              title="Limpar busca"
              aria-label="Limpar busca"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-3 pb-2.5 flex items-center gap-1">
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={
                'px-2 py-1 rounded-full text-[10.5px] font-medium transition-colors border ' +
                (active
                  ? 'bg-accent-soft border-accent/30 text-accent'
                  : 'bg-surface1 border-line text-muted hover:text-ink hover:bg-surface2')
              }
            >
              {f.label}
            </button>
          )
        })}
      </div>

      {/* No results */}
      {filtered.length === 0 && (
        <div className="px-3 pb-3">
          <EmptyState
            icon={Search}
            title={isFiltered ? 'Ninguém combina' : 'Ninguém por aqui ainda'}
            body={isFiltered
              ? `Sem resultados pra "${query}".`
              : filter === 'online'
                ? 'Ninguém online no momento.'
                : 'Convide alguém pro Space — basta compartilhar o nome.'
            }
          />
        </div>
      )}

      {/* Cards */}
      {filtered.length > 0 && (
        <div className="px-2 pb-2 space-y-1">
          {filtered.map(m => (
            <PersonCard
              key={m.userId}
              member={m}
              isSelf={m.userId === currentUserId}
              space={space}
              inCurrentRoom={!!currentRoomId && m.location?.roomId === currentRoomId}
              isCreator={space?.createdBy === m.userId}
            />
          ))}
        </div>
      )}

      <div className="h-3" />
    </div>
  )
}
