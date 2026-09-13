/**
 * SpaceIconPicker — Phosphor icons + optional emoji catalog.
 * Recentes: all styles (not filtered by active style tab).
 * Todos: full catalog for current style / all emojis.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Briefcase, Check, Clock, Coffee, Cpu, Gamepad2, Globe,
  Grid3X3, Home, Mic, Music, Paintbrush, Search, Smile, Sparkles, Star, Trophy, Users, X, Upload,
} from 'lucide-react'
import { EASE_OUT } from '../../../shared/motion/presets.js'
import {
  SpaceIcon,
  searchSpaceIcons,
  categoryCounts,
  CATEGORY_ORDER,
  useDebouncedValue,
  ensureFullSpaceIcons,
  getRecentIcons,
  pushRecentIcon,
} from '../model/spaceIcons'
import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  pushRecentEmoji,
  searchEmojis,
} from '../model/emojiCatalog'

const CATEGORY_META = {
  community: { label: 'Comunidade', icon: Users },
  voice:     { label: 'Voz', icon: Mic },
  work:      { label: 'Trabalho', icon: Briefcase },
  leisure:   { label: 'Lazer', icon: Gamepad2 },
  games:     { label: 'Jogos', icon: Gamepad2 },
  music:     { label: 'Música', icon: Music },
  study:     { label: 'Estudos', icon: BookOpen },
  tech:      { label: 'Tecnologia', icon: Cpu },
  art:       { label: 'Arte', icon: Paintbrush },
  home:      { label: 'Casa', icon: Home },
  sports:    { label: 'Esportes', icon: Trophy },
  nature:    { label: 'Natureza', icon: Globe },
  travel:    { label: 'Viagem', icon: Globe },
  food:      { label: 'Comida', icon: Coffee },
  events:    { label: 'Eventos', icon: Sparkles },
  symbols:   { label: 'Símbolos', icon: Star },
}

const STYLE_TABS = [
  { key: 'outline',  label: 'Linha' },
  { key: 'rounded',  label: 'Arredondado' },
  { key: 'filled',   label: 'Preenchido' },
  { key: 'duotone',  label: 'Duotone' },
]

const RECENT_CATEGORY_KEY = '__recent'
const ALL_CATEGORY_KEY = '__all'

export function SpaceIconPicker({
  open = true,
  current,
  currentEmoji = null,
  recents = [],
  onPick,
  onPickEmoji,
  onClose,
  anchorRef,
  enableEmojis = true,
  onUploadImage = null,
}) {
  return (
    <AnimatePresence>
      {open && (
        <IconPickerPanel
          key="icon-picker"
          current={current}
          currentEmoji={currentEmoji}
          recents={recents}
          onPick={onPick}
          onPickEmoji={onPickEmoji}
          onClose={onClose}
          anchorRef={anchorRef}
          enableEmojis={enableEmojis}
          onUploadImage={onUploadImage}
        />
      )}
    </AnimatePresence>
  )
}

function IconPickerPanel({
  current,
  currentEmoji,
  recents: recentsProp,
  onPick,
  onPickEmoji,
  onClose,
  anchorRef,
  enableEmojis,
  onUploadImage,
}) {
  const [mode, setMode] = useState('icons') // 'icons' | 'emojis'
  const [activeCategory, setActiveCategory] = useState(RECENT_CATEGORY_KEY)
  const [activeStyle, setActiveStyle] = useState('outline')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 140)
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'right' })
  const [visibleCount, setVisibleCount] = useState(48)
  const [liveRecents, setLiveRecents] = useState(() => getRecentIcons())
  const [liveEmojiRecents, setLiveEmojiRecents] = useState(() => getRecentEmojis())
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const gridRef = useRef(null)
  const tooltipTimerRef = useRef(null)
  const [hoveredIcon, setHoveredIcon] = useState(null)

  useEffect(() => {
    ensureFullSpaceIcons().catch(() => {})
    setLiveRecents(getRecentIcons())
    setLiveEmojiRecents(getRecentEmojis())
  }, [])

  const iconRecents = useMemo(() => {
    const fromStore = liveRecents.length ? liveRecents : getRecentIcons()
    const fromProp = Array.isArray(recentsProp) ? recentsProp : []
    const map = new Map()
    for (const item of [...fromStore, ...fromProp]) {
      if (!item?.id && !item?.name) continue
      const key = `${item.name || item.id}::${item.style || 'outline'}`
      if (!map.has(key)) map.set(key, item)
    }
    return [...map.values()]
  }, [liveRecents, recentsProp])

  useLayoutEffect(() => {
    if (!anchorRef?.current) {
      // Centered fallback when no anchor (modal usage)
      const panelW = 580
      const panelH = 520
      setPos({
        top: Math.max(16, (window.innerHeight - panelH) / 2),
        left: Math.max(16, (window.innerWidth - panelW) / 2),
        placement: 'center',
      })
      return undefined
    }
    const compute = () => {
      const anchor = anchorRef.current.getBoundingClientRect()
      const panelW = 580
      const panelH = 520
      const margin = 12
      let left = anchor.right + margin
      let placement = 'right'
      if (left + panelW > window.innerWidth - 16) {
        left = anchor.left - panelW - margin
        placement = 'left'
        if (left < 16) left = Math.max(16, window.innerWidth - panelW - 16)
      }
      let top = anchor.top - 40
      if (top + panelH > window.innerHeight - 16) {
        top = Math.max(16, window.innerHeight - panelH - 16)
      }
      if (top < 16) top = 16
      setPos({ top, left, placement })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [anchorRef])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    const onClick = (e) => {
      if (panelRef.current && panelRef.current.contains(e.target)) return
      if (anchorRef?.current && anchorRef.current.contains(e.target)) return
      onClose()
    }
    const t = setTimeout(() => window.addEventListener('mousedown', onClick), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose, anchorRef])

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [mode])

  useEffect(() => {
    setVisibleCount(48)
  }, [debouncedSearch, activeCategory, activeStyle, mode])

  useEffect(() => {
    setActiveCategory(RECENT_CATEGORY_KEY)
    setSearch('')
  }, [mode])

  const allIconResults = useMemo(() => {
    if (mode !== 'icons') return []
    return searchSpaceIcons(debouncedSearch, {
      style: activeStyle,
      category: (activeCategory === RECENT_CATEGORY_KEY || activeCategory === ALL_CATEGORY_KEY)
        ? null
        : activeCategory,
      limit: 2000,
    })
  }, [debouncedSearch, activeStyle, activeCategory, mode])

  const displayIcons = useMemo(() => {
    if (mode !== 'icons') return []
    if (activeCategory === RECENT_CATEGORY_KEY) {
      // Show every recent regardless of style tab — use each item's own style.
      let list = iconRecents.map((v) => ({
        id: v.id,
        name: v.name,
        style: v.style,
        collection: v.collection || 'ph',
        label: String(v.name || v.id || '').replace(/-/g, ' '),
        keywords: [],
        categories: [],
      }))
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        list = list.filter((v) => (v.label || '').toLowerCase().includes(q) || (v.name || '').includes(q))
      }
      return list
    }
    return allIconResults
  }, [mode, activeCategory, iconRecents, allIconResults, debouncedSearch])

  const displayEmojis = useMemo(() => {
    if (mode !== 'emojis') return []
    if (activeCategory === RECENT_CATEGORY_KEY) {
      let list = [...liveEmojiRecents]
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase()
        list = list.filter((e) => e.includes(q))
      }
      return list
    }
    return searchEmojis(debouncedSearch, {
      category: activeCategory === ALL_CATEGORY_KEY ? '__all' : activeCategory,
      limit: 800,
    })
  }, [mode, activeCategory, liveEmojiRecents, debouncedSearch])

  const displayResults = mode === 'icons' ? displayIcons : displayEmojis
  const visible = displayResults.slice(0, visibleCount)
  const hasMore = displayResults.length > visibleCount

  const categoryCountsMap = useMemo(() => categoryCounts(), [])
  const categoryList = useMemo(() => {
    if (mode === 'emojis') {
      return [
        { key: RECENT_CATEGORY_KEY, label: 'Recentes', icon: Clock, count: liveEmojiRecents.length },
        { key: ALL_CATEGORY_KEY, label: 'Todos', icon: Grid3X3, count: searchEmojis('', { category: '__all', limit: 9999 }).length },
        ...EMOJI_CATEGORIES.map((c) => ({
          key: c.key,
          label: c.label,
          icon: Smile,
          count: c.emojis.length,
        })),
      ]
    }
    return [
      { key: RECENT_CATEGORY_KEY, label: 'Recentes', icon: Clock, count: iconRecents.length },
      { key: ALL_CATEGORY_KEY, label: 'Todos', icon: Grid3X3, count: allIconResults.length || categoryCountsMap.__all || 0 },
      ...CATEGORY_ORDER.filter((key) => CATEGORY_META[key]).map((key) => ({
        key,
        label: CATEGORY_META[key].label,
        icon: CATEGORY_META[key].icon,
        count: categoryCountsMap[key] || 0,
      })),
    ]
  }, [mode, liveEmojiRecents, iconRecents, allIconResults, categoryCountsMap])

  // When on Todos with empty search, refresh count from search without category filter
  const todosCount = useMemo(() => {
    if (mode !== 'icons') return 0
    return searchSpaceIcons('', { style: activeStyle, category: null, limit: 5000 }).length
  }, [mode, activeStyle])

  const categoryListWithTodos = useMemo(() => {
    if (mode !== 'icons') return categoryList
    return categoryList.map((c) => (
      c.key === ALL_CATEGORY_KEY ? { ...c, count: todosCount } : c
    ))
  }, [categoryList, mode, todosCount])

  const handlePickIcon = (entry) => {
    const value = {
      id: entry.id,
      name: entry.name,
      collection: entry.collection,
      style: entry.style,
    }
    const next = pushRecentIcon(value)
    setLiveRecents(next)
    onPick?.(value)
  }

  const handlePickEmoji = (emoji) => {
    const next = pushRecentEmoji(emoji)
    setLiveEmojiRecents(next)
    if (typeof onPickEmoji === 'function') onPickEmoji(emoji)
    else onPick?.({ type: 'emoji', emoji })
  }

  const onGridScroll = (e) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && hasMore) {
      setVisibleCount((c) => Math.min(c + 48, displayResults.length))
    }
  }

  const isSelectedIcon = (entry) =>
    current && current.collection === entry.collection && current.id === entry.id && current.style === entry.style

  const activeCategoryLabel = (() => {
    if (activeCategory === RECENT_CATEGORY_KEY) return 'Recentes'
    if (activeCategory === ALL_CATEGORY_KEY) return 'Todos'
    if (mode === 'emojis') {
      return EMOJI_CATEGORIES.find((c) => c.key === activeCategory)?.label || activeCategory
    }
    return CATEGORY_META[activeCategory]?.label || activeCategory
  })()

  const panel = (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label="Escolha um ícone"
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -2 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="fixed z-[80] w-[580px] h-[520px] rounded-2xl border border-accent/20 bg-[#1a1a1e] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.6),0_0_24px_-4px_rgba(255,63,108,0.15)] flex flex-col overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <h2 className="text-[16px] font-semibold text-strong tracking-tight">
            Escolha um ícone
          </h2>
          {onUploadImage && (
            <button
              type="button"
              onClick={() => {
                onClose?.()
                onUploadImage?.()
              }}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11.5px] font-medium bg-accent/15 text-accent hover:bg-accent/25 border border-accent/25 transition-all active:scale-95"
              title="Fazer upload de foto do computador"
            >
              <Upload size={12} strokeWidth={2.2} />
              <span>Enviar imagem (PNG, JPG)</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink hover:text-strong hover:bg-white/5 transition-colors"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      {enableEmojis && (
        <div className="px-5 pb-2">
          <div className="flex items-center gap-1 h-[34px] px-1 bg-[#0f1014] border border-line rounded-[8px]">
            {[
              { key: 'icons', label: 'Ícones' },
              { key: 'emojis', label: 'Emojis' },
            ].map((t) => {
              const active = mode === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMode(t.key)}
                  aria-pressed={active}
                  className={
                    'flex-1 h-[26px] inline-flex items-center justify-center rounded-[6px] text-[12px] font-medium transition-colors ' +
                    (active ? 'bg-accent/25 text-strong' : 'text-muted hover:text-ink')
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="px-5 pb-2.5">
        <div className="flex items-center gap-2.5 h-[46px] px-3.5 bg-[#0f1014] border border-line rounded-[10px] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 transition-colors">
          <Search size={14} className="text-muted shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={mode === 'emojis' ? 'Buscar emoji ou categoria' : 'Buscar ícone'}
            className="flex-1 bg-transparent text-[13.5px] text-strong placeholder:text-muted focus:outline-none"
          />
        </div>
      </div>

      {mode === 'icons' && (
        <div className="px-5 pb-2.5">
          <div className="flex items-center gap-1 h-[34px] px-1 bg-[#0f1014] border border-line rounded-[8px]">
            {STYLE_TABS.map((t) => {
              const active = activeStyle === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveStyle(t.key)}
                  aria-pressed={active}
                  className={
                    'flex-1 h-[26px] inline-flex items-center justify-center gap-1.5 rounded-[6px] text-[12px] font-medium transition-colors ' +
                    (active
                      ? 'bg-accent/25 text-strong border-b-2 border-accent'
                      : 'text-muted hover:text-ink border-b-2 border-transparent')
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="px-5 pb-2 text-[11.5px] text-muted flex items-center justify-between">
        <span>
          {activeCategoryLabel}
          {' · '}
          <span className="text-ink font-medium">{displayResults.length}</span>
          {mode === 'emojis' ? ' emojis' : ' ícones'}
        </span>
        {debouncedSearch && (
          <span className="text-muted/70 italic">filtrando por "{debouncedSearch}"</span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-2 px-3 pb-3">
        <div className="w-[150px] shrink-0 overflow-y-auto py-1 flex flex-col gap-0.5">
          {categoryListWithTodos.map(({ key, label, icon: CatIcon, count }) => {
            const active = activeCategory === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                className={
                  'flex items-center gap-2 px-2.5 h-[36px] rounded-[8px] text-[12.5px] font-medium transition-colors text-left ' +
                  (active
                    ? 'bg-accent/25 text-strong border border-accent/30'
                    : 'text-ink hover:bg-white/5 hover:text-strong border border-transparent')
                }
              >
                <CatIcon size={13} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate flex-1">{label}</span>
                <span className="text-[10px] text-muted/60 tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>

        <div
          ref={gridRef}
          className="flex-1 min-w-0 overflow-y-auto"
          onScroll={onGridScroll}
        >
          {displayResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted text-[12.5px] px-4">
              <span>
                {activeCategory === RECENT_CATEGORY_KEY
                  ? (mode === 'emojis' ? 'Nenhum emoji recente ainda.' : 'Nenhum ícone recente ainda.')
                  : (mode === 'emojis' ? 'Nenhum emoji encontrado.' : 'Nenhum ícone encontrado.')}
              </span>
              {activeCategory === RECENT_CATEGORY_KEY && (
                <span className="text-[11px] mt-1 text-muted/70">
                  Escolha algo em Todos — aparece aqui depois.
                </span>
              )}
            </div>
          ) : mode === 'emojis' ? (
            <div
              className="grid gap-[6px] p-1"
              style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))' }}
            >
              {visible.map((emoji) => {
                const active = currentEmoji === emoji
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handlePickEmoji(emoji)}
                    aria-label={emoji}
                    aria-pressed={active}
                    className={
                      'relative flex items-center justify-center rounded-[10px] transition-all duration-150 ' +
                      'h-[44px] w-full border text-[22px] leading-none ' +
                      (active
                        ? 'bg-accent/15 border-accent'
                        : 'bg-[#22232a] border-line hover:bg-[#2a2c34]')
                    }
                  >
                    {emoji}
                  </button>
                )
              })}
            </div>
          ) : (
            <div
              className="grid gap-[8px] p-1"
              style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
            >
              {visible.map((entry) => {
                const active = isSelectedIcon(entry)
                return (
                  <button
                    key={`${entry.collection}:${entry.id}:${entry.style}`}
                    data-icon-tile
                    type="button"
                    onClick={() => handlePickIcon(entry)}
                    onMouseEnter={() => {
                      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
                      tooltipTimerRef.current = setTimeout(() => setHoveredIcon(entry), 450)
                    }}
                    onMouseLeave={() => {
                      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
                      setHoveredIcon(null)
                    }}
                    aria-label={entry.label}
                    aria-pressed={active}
                    className={
                      'relative flex items-center justify-center rounded-[10px] transition-all duration-150 ' +
                      'h-[54px] w-full border ' +
                      (active
                        ? 'bg-accent/15 text-accent border-accent shadow-[0_0_14px_-2px_var(--space-accent-glow-24)]'
                        : 'bg-[#22232a] text-muted hover:bg-[#2a2c34] hover:text-ink border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40')
                    }
                  >
                    <SpaceIcon value={entry} size={22} className="pointer-events-none" />
                    {active && (
                      <span
                        aria-hidden
                        className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-accent text-strong flex items-center justify-center"
                      >
                        <Check size={9} strokeWidth={3.5} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center py-3 text-[11.5px] text-muted">
              <span>Role para ver mais ({displayResults.length - visibleCount} restantes)</span>
            </div>
          )}
        </div>
      </div>

      {hoveredIcon && mode === 'icons' && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-md bg-[#0a0a0c] border border-line text-[12px] text-strong shadow-lg pointer-events-none whitespace-nowrap z-10">
          <span className="font-medium">{hoveredIcon.label}</span>
          <span className="text-muted ml-1.5">· {hoveredIcon.style}</span>
        </div>
      )}
    </motion.div>
  )

  return createPortal(panel, document.body)
}
