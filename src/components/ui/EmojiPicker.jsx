/**
 * EmojiPicker — premium emoji grid with category sidebar (icons),
 * search, hover scale, and clean rounded look.
 *
 * Categorias em ordem Discord-style: smileys, gestos, corações, pessoas,
 * animais, comida, lugares, objetos, símbolos. Busca por substring
 * atravessa todas as categorias.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Smile, Hand, Heart, Users, PawPrint, Pizza, MapPin, Lightbulb, Hash, Search as SearchIcon,
} from 'lucide-react'

export const EMOJI_CATEGORIES = [
  {
    key: 'smileys',
    label: 'Rostos',
    icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '😉', '😍', '🥰', '😘', '😗', '🥲', '😋', '😜', '🤪',
      '😎', '🤩', '🥳', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏',
      '😴', '🤤', '😷', '🤒', '🤯', '🤠', '😈', '👿', '💀', '👻',
      '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀',
    ],
  },
  {
    key: 'gestures',
    label: 'Gestos',
    icon: Hand,
    emojis: [
      '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👏', '🙌',
      '🤝', '🙏', '💪', '🫶', '👋', '🤚', '✋', '🖐️', '👆', '👇',
      '👈', '👉', '✊', '👊', '🤛', '🤜', '✍️', '💅', '🤳', '🫵',
    ],
  },
  {
    key: 'hearts',
    label: 'Corações',
    icon: Heart,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '✨',
    ],
  },
  {
    key: 'people',
    label: 'Pessoas',
    icon: Users,
    emojis: [
      '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵',
      '🙅', '🙆', '💁', '🙋', '🧏', '🙇', '🤦', '🤷', '👮', '🕵️',
      '💂', '👷', '🤴', '👸', '👳', '👲', '🧕', '🤵', '👰', '🤰',
    ],
  },
  {
    key: 'animals',
    label: 'Animais',
    icon: PawPrint,
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
      '🦅', '🦉', '🦄', '🐝', '🦋', '🐌', '🐞', '🐢', '🐍', '🦖',
    ],
  },
  {
    key: 'food',
    label: 'Comida',
    icon: Pizza,
    emojis: [
      '🍎', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑',
      '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🌽', '🥕',
      '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥗', '🍣', '🍰',
    ],
  },
  {
    key: 'places',
    label: 'Lugares',
    icon: MapPin,
    emojis: [
      '🌍', '🌎', '🌏', '🌐', '🗺️', '🏔️', '⛰️', '🌋', '🗻', '🏕️',
      '🏖️', '🏜️', '🏝️', '🏟️', '🏛️', '🏗️', '🏘️', '🏚️', '🏠', '🏡',
      '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬',
    ],
  },
  {
    key: 'objects',
    label: 'Objetos',
    icon: Lightbulb,
    emojis: [
      '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🎯', '🎮', '🎲', '🎸',
      '🎵', '📚', '💻', '📱', '⌚', '📷', '💡', '🔥', '⭐', '🌟',
      '⚡', '☀️', '🌙', '🌈', '☕', '🍕', '🍔', '🍰', '🍺', '🚀',
    ],
  },
  {
    key: 'symbols',
    label: 'Símbolos',
    icon: Hash,
    emojis: [
      '✅', '❌', '❗', '❓', '💯', '🔔', '📌', '📎', '🔗', '💬',
      '💭', '👀', '🧠', '➡️', '⬅️', '⬆️', '⬇️', '♻️', '⚠️', '🆗',
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
  const gridRef = useRef(null)
  const catsRef = useRef(null)
  const rootRef = useRef(null)
  const searchRef = useRef(null)

  const active = EMOJI_CATEGORIES.find((c) => c.key === category) || EMOJI_CATEGORIES[0]
  const list = useMemo(() => {
    const q = query.trim()
    if (!q) return { list: active.emojis }
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis)
    const filtered = all.filter((e) => e.includes(q))
    return { list: filtered }
  }, [active, query])

  useContainWheel(rootRef)
  useContainWheel(gridRef)
  useContainWheel(catsRef)

  /* When category changes and search is active, drop the search so the
   * newly-selected category shows its own emojis. */
  const handleCategory = (key) => {
    setCategory(key)
    if (query) setQuery('')
  }

  const sidebar = (
    <div
      ref={catsRef}
      className={
        (compact
          ? 'w-[68px] shrink-0 border-r border-white/[0.06] p-1.5 flex flex-col items-stretch gap-0.5 overflow-y-auto overscroll-contain bg-[rgba(15,16,20,0.5)]'
          : 'w-[56px] shrink-0 border-r border-white/[0.06] p-1 flex flex-col items-stretch gap-0.5 overflow-y-auto overscroll-contain bg-[rgba(15,16,20,0.5)]')
      }
    >
      {EMOJI_CATEGORIES.map((cat) => {
        const on = !query && cat.key === category
        const Icon = cat.icon
        return (
          <button
            key={cat.key}
            type="button"
            onClick={() => handleCategory(cat.key)}
            title={cat.label}
            aria-label={cat.label}
            aria-pressed={on}
            className={
              'vc-emoji-cat flex items-center justify-center rounded-lg transition-all ' +
              (compact ? 'h-9 w-full' : 'h-10 w-full') +
              ' ' +
              (on
                ? 'bg-[color-mix(in_srgb,var(--vc-warning)_22%,transparent)] text-[var(--vc-warning)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--vc-warning)_45%,transparent)]'
                : 'text-muted hover:text-strong hover:bg-white/[0.06]')
            }
          >
            <Icon size={16} strokeWidth={1.8} />
          </button>
        )
      })}
    </div>
  )

  return (
    <div
      ref={rootRef}
      className={
        'flex rounded-2xl bg-[#1a1c22] border border-white/[0.08] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.7)] overflow-hidden ' +
        (compact ? 'w-[336px] h-[316px]' : 'w-[360px] sm:w-[392px]') +
        ' ' + className
      }
    >
      {sidebar}

      <div className="flex flex-col min-w-0 flex-1">
        <div className="shrink-0 px-2.5 pt-2 pb-1.5 border-b border-white/[0.06]">
          <div className="relative">
            <SearchIcon size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar emoji…"
              className="w-full h-8 pl-7 pr-2.5 rounded-lg bg-[#0f1014] border border-white/[0.06] text-[12px] text-strong placeholder:text-muted focus:outline-none focus:border-[color-mix(in_srgb,var(--vc-warning)_55%,transparent)] transition-colors"
            />
          </div>
        </div>

        <div
          ref={gridRef}
          className={
            'min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 ' +
            (compact ? '' : '')
          }
        >
          {list.list.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-1.5 py-6">
              <SearchIcon size={20} className="text-muted/60" />
              <p className="text-[12px] text-muted">Nenhum emoji pra essa busca.</p>
            </div>
          ) : (
            <div className={'grid gap-0.5 ' + (compact ? 'grid-cols-7' : 'grid-cols-8')}>
              {list.list.map((em, i) => (
                <button
                  key={`${em}-${i}`}
                  type="button"
                  onClick={() => onPick?.(em)}
                  className="vc-emoji-cell h-9 rounded-lg flex items-center justify-center text-[22px] hover:bg-[color-mix(in_srgb,var(--vc-warning)_15%,transparent)] active:scale-90 transition-all duration-100"
                  aria-label={em}
                  title={em}
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
