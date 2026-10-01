/** Search workspace for the currently loaded conversation. */
import { useEffect, useRef } from 'react'
import { ChevronDown, ChevronUp, Paperclip, Pin, Search, X } from 'lucide-react'

export default function ConversationSearch({
  open,
  query,
  onQueryChange,
  onClose,
  matchCount = 0,
  activeIndex = -1,
  onNext,
  onPrevious,
  filters = {},
  onFiltersChange,
  authors = [],
  restoreFocusRef = null,
}) {
  const inputRef = useRef(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      const frame = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(frame)
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false
      restoreFocusRef?.current?.focus()
    }
    return undefined
  }, [open, restoreFocusRef])

  if (!open) return null
  const patch = (next) => onFiltersChange?.({ ...filters, ...next })

  return (
    <div className="vc-conversation-search" role="search" aria-label="Buscar nesta conversa">
      <div className="vc-search-query">
        <Search size={16} aria-hidden />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); onClose?.() }
            if (event.key === 'Enter') { event.preventDefault(); event.shiftKey ? onPrevious?.() : onNext?.() }
          }}
          placeholder="Buscar nesta conversa…"
          aria-label="Texto da busca"
        />
        <span className="vc-search-counter" aria-live="polite">{matchCount ? `${activeIndex >= 0 ? activeIndex + 1 : 0}/${matchCount}` : '0 resultados'}</span>
        <button type="button" onClick={onPrevious} disabled={!matchCount} aria-label="Resultado anterior" title="Resultado anterior"><ChevronUp size={16} /></button>
        <button type="button" onClick={onNext} disabled={!matchCount} aria-label="Próximo resultado" title="Próximo resultado"><ChevronDown size={16} /></button>
        <button type="button" onClick={onClose} aria-label="Fechar busca" title="Fechar busca"><X size={16} /></button>
      </div>
      <div className="vc-search-filters" aria-label="Filtros da busca">
        <select value={filters.authorId || ''} onChange={(event) => patch({ authorId: event.target.value })} aria-label="Filtrar por autor">
          <option value="">Todos os autores</option>
          {authors.map((author) => <option key={author.id} value={author.id}>{author.label}</option>)}
        </select>
        <select value={filters.period || 'all'} onChange={(event) => patch({ period: event.target.value })} aria-label="Filtrar por período">
          <option value="all">Qualquer período</option><option value="day">Últimas 24 horas</option><option value="week">Últimos 7 dias</option><option value="month">Últimos 30 dias</option>
        </select>
        <button type="button" className={filters.attachments ? 'is-active' : ''} aria-pressed={!!filters.attachments} onClick={() => patch({ attachments: !filters.attachments })}><Paperclip size={14} /> Anexos</button>
        <button type="button" className={filters.pinned ? 'is-active' : ''} aria-pressed={!!filters.pinned} onClick={() => patch({ pinned: !filters.pinned })}><Pin size={14} /> Fixadas</button>
      </div>
    </div>
  )
}
