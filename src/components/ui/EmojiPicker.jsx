/**
 * EmojiPicker — organized emoji grid with category tabs.
 * Scroll stays inside the picker (overscroll-contain + wheel stop)
 * so the chat list does not steal the wheel.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

export const EMOJI_CATEGORIES = [
  {
    key: 'smileys',
    label: 'Rostos',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '😉', '😍', '🥰', '😘', '😗', '🥲', '😋', '😜', '🤪',
      '😎', '🤩', '🥳', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏',
      '😴', '🤤', '😷', '🤒', '🤯', '🤠', '😈', '👿', '💀', '👻',
    ],
  },
  {
    key: 'gestures',
    label: 'Gestos',
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👏', '🙌',
      '🤝', '🙏', '💪', '🫶', '👋', '🤚', '✋', '🖐️', '👆', '👇',
      '👈', '👉', '✊', '👊', '🤛', '🤜', '✍️', '💅',
    ],
  },
  {
    key: 'hearts',
    label: 'Corações',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '✨',
    ],
  },
  {
    key: 'objects',
    label: 'Objetos',
    emojis: [
      '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🎯', '🎮', '🎲', '🎸',
      '🎵', '📚', '💻', '📱', '⌚', '📷', '💡', '🔥', '⭐', '🌟',
      '⚡', '☀️', '🌙', '🌈', '☕', '🍕', '🍔', '🍰', '🍺', '🚀',
    ],
  },
  {
    key: 'symbols',
    label: 'Símbolos',
    emojis: [
      '✅', '❌', '❗', '❓', '💯', '🔔', '📌', '📎', '🔗', '💬',
      '💭', '👀', '🧠', '💬', '➡️', '⬅️', '⬆️', '⬇️', '♻️', '⚠️',
    ],
  },
]

function useContainWheel(ref, { horizontal = false } = {}) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e) => {
      e.stopPropagation()
      if (!horizontal) return
      if (el.scrollWidth <= el.clientWidth) return
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: !horizontal })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, horizontal])
}

export default function EmojiPicker({ onPick, className = '', compact = false }) {
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0].key)
  const [query, setQuery] = useState('')
  const tabsRef = useRef(null)
  const gridRef = useRef(null)
  const catsRef = useRef(null)
  const rootRef = useRef(null)

  const active = EMOJI_CATEGORIES.find((c) => c.key === category) || EMOJI_CATEGORIES[0]
  const list = useMemo(() => {
    const q = query.trim()
    if (!q) return active.emojis
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis)
    return all.filter((em) => em.includes(q))
  }, [active, query])

  useContainWheel(rootRef)
  useContainWheel(gridRef)
  useContainWheel(catsRef)
  useContainWheel(tabsRef, { horizontal: !compact })

  const categoryButtons = EMOJI_CATEGORIES.map((cat) => {
    const on = !query && cat.key === category
    return (
      <button
        key={cat.key}
        type="button"
        onClick={() => { setCategory(cat.key); setQuery('') }}
        className={
          (compact
            ? 'w-full px-2 py-1.5 rounded-lg text-[11px] font-semibold text-left '
            : 'shrink-0 px-2 py-1 rounded-lg text-[11px] font-semibold ') +
          'transition-colors ' +
          (on ? 'bg-accent/15 text-accent' : 'text-muted hover:text-strong hover:bg-white/[0.05]')
        }
      >
        {cat.label}
      </button>
    )
  })

  return (
    <div
      ref={rootRef}
      className={
        'flex flex-col rounded-2xl bg-[#1a1c22] border border-white/[0.08] shadow-2xl overflow-hidden ' +
        (compact ? 'w-[300px]' : 'w-[320px] sm:w-[360px]') +
        ' ' + className
      }
    >
      {!compact && (
        <div className="shrink-0 px-2.5 pt-2.5 pb-2 border-b border-white/[0.06]">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar emoji…"
            className="w-full h-8 mb-2 px-2.5 rounded-lg bg-[#0f1014] border border-white/[0.06] text-[12px] text-strong placeholder:text-muted focus:outline-none focus:border-accent/50"
          />
          <div
            ref={tabsRef}
            className="flex items-center gap-1 overflow-x-auto overscroll-contain [scrollbar-width:thin]"
          >
            {categoryButtons}
          </div>
        </div>
      )}

      <div className={'flex min-h-0 ' + (compact ? 'h-[248px]' : '')}>
        {compact && (
          <div
            ref={catsRef}
            className="w-[76px] shrink-0 overflow-y-auto overscroll-contain border-r border-white/[0.06] p-1.5 flex flex-col gap-0.5"
          >
            {categoryButtons}
          </div>
        )}
        <div
          ref={gridRef}
          className={
            'min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 ' +
            (compact ? '' : 'h-[220px]')
          }
        >
          {list.length === 0 ? (
            <p className="text-[12px] text-muted text-center py-8">Nenhum emoji nessa busca.</p>
          ) : (
            <div className={'grid gap-0.5 ' + (compact ? 'grid-cols-6' : 'grid-cols-8')}>
              {list.map((em, i) => (
                <button
                  key={`${em}-${i}`}
                  type="button"
                  onClick={() => onPick?.(em)}
                  className="h-9 rounded-lg flex items-center justify-center text-[22px] hover:bg-white/[0.07] active:scale-95 transition-all"
                  aria-label={em}
                >
                  {em}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
