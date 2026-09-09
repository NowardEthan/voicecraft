/**
 * ConversationSearch — message filter bar (DESIGN_SYSTEM §D).
 *
 * Opens via the magnifying-glass button in the room header. While open,
 * the MessageList filters messages whose text contains the query (case-
 * insensitive). The bar shows how many matches we found and lets the
 * user close it.
 *
 * Implementation note: we don't actually move a focus pointer between
 * matches — we just filter the list. That's intentional. Real "next
 * match" navigation is out of scope for the v1 polish pass.
 */
import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

export default function ConversationSearch({
  open,
  query,
  onQueryChange,
  onClose,
  matchCount = 0,
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      // Focus on open.
      const t = setTimeout(() => inputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="
        w-full max-w-md flex items-center gap-2
        px-3 py-1.5 rounded-input
        bg-surface1 border border-line
        text-[12.5px]
      "
    >
      <Search size={13} className="text-muted shrink-0" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
        placeholder="buscar na conversa…"
        className="flex-1 bg-transparent text-strong placeholder:text-muted focus:outline-none text-[12.5px]"
        aria-label="Buscar na conversa"
      />
      {query && (
        <span className="text-[10.5px] text-muted tabular-nums shrink-0">
          {matchCount} {matchCount === 1 ? 'resultado' : 'resultados'}
        </span>
      )}
      <button
        type="button"
        onClick={onClose}
        className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-strong hover:bg-surface2 transition-colors"
        title="Fechar busca"
        aria-label="Fechar busca"
      >
        <X size={11} />
      </button>
    </div>
  )
}
