/**
 * SpaceIconPicker — Phosphor catalog popover used when creating or
 * editing a Space. Anchored to a "Trocar" button (not a centered modal)
 * so the form stays visible. Portaled to document.body to escape overflow.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Briefcase, Check, Clock, Coffee, Cpu, Gamepad2, Globe,
  Home, Mic, Music, Paintbrush, Search, Sparkles, Star, Trophy, Users, X,
} from 'lucide-react'
import { EASE_OUT } from '../../../shared/motion/presets.js'
import {
  SpaceIcon,
  searchSpaceIcons,
  categoryCounts,
  CATEGORY_ORDER,
  useDebouncedValue,
  ensureFullSpaceIcons,
} from '../model/spaceIcons'

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

export function SpaceIconPicker({
  open = true,
  current,
  recents = [],
  onPick,
  onClose,
  anchorRef,
}) {
  return (
    <AnimatePresence>
      {open && (
        <IconPickerPanel
          key="icon-picker"
          current={current}
          recents={recents}
          onPick={onPick}
          onClose={onClose}
          anchorRef={anchorRef}
        />
      )}
    </AnimatePresence>
  )
}

function IconPickerPanel({ current, recents, onPick, onClose, anchorRef }) {
  const [activeCategory, setActiveCategory] = useState(RECENT_CATEGORY_KEY)
  const [activeStyle, setActiveStyle] = useState('outline')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 140)
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'right' })
  const [visibleCount, setVisibleCount] = useState(24)
  const panelRef = useRef(null)
  const searchRef = useRef(null)
  const gridRef = useRef(null)
  const tooltipTimerRef = useRef(null)
  const [hoveredIcon, setHoveredIcon] = useState(null)

  useEffect(() => {
    ensureFullSpaceIcons().catch(() => {})
  }, [])

  useLayoutEffect(() => {
    if (!anchorRef?.current) return
    const compute = () => {
      const anchor = anchorRef.current.getBoundingClientRect()
      const panelW = 580
      const panelH = 500
      const margin = 12
      let left = anchor.right + margin
      let placement = 'right'
      if (left + panelW > window.innerWidth - 16) {
        left = anchor.left - panelW - margin
        placement = 'left'
        if (left < 16) {
          left = Math.max(16, window.innerWidth - panelW - 16)
        }
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
    const t = setTimeout(() => {
      window.addEventListener('mousedown', onClick)
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose, anchorRef])

  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    setVisibleCount(24)
  }, [debouncedSearch, activeCategory, activeStyle])

  const allResults = useMemo(() => {
    return searchSpaceIcons(debouncedSearch, {
      style: activeStyle,
      category: activeCategory === RECENT_CATEGORY_KEY ? null : activeCategory,
      limit: 1000,
    })
  }, [debouncedSearch, activeStyle, activeCategory])

  const displayResults = useMemo(() => {
    if (activeCategory === RECENT_CATEGORY_KEY) {
      return recents
        .filter(v => v.style === activeStyle)
        .map(v => ({
          id: v.id, name: v.name, style: v.style, collection: v.collection,
          label: v.name.replace(/-/g, ' '),
          keywords: [], categories: [],
        }))
    }
    return allResults
  }, [allResults, activeCategory, activeStyle, recents])

  const visible = displayResults.slice(0, visibleCount)
  const hasMore = displayResults.length > visibleCount

  const categoryCountsMap = useMemo(() => categoryCounts(), [])
  const categoryList = useMemo(() => {
    const list = [{
      key: RECENT_CATEGORY_KEY,
      label: 'Recentes',
      icon: Clock,
      count: recents.filter(v => v.style === activeStyle).length,
    }]
    for (const key of CATEGORY_ORDER) {
      if (!CATEGORY_META[key]) continue
      list.push({
        key,
        label: CATEGORY_META[key].label,
        icon: CATEGORY_META[key].icon,
        count: categoryCountsMap[key] || 0,
      })
    }
    return list
  }, [categoryCountsMap, recents, activeStyle])

  const onGridScroll = (e) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && hasMore) {
      setVisibleCount(c => Math.min(c + 24, displayResults.length))
    }
  }

  const onGridKey = (e) => {
    if (!gridRef.current) return
    const tiles = [...gridRef.current.querySelectorAll('[data-icon-tile]')]
    if (tiles.length === 0) return
    const idx = tiles.indexOf(document.activeElement)
    if (idx < 0) return
    let next = idx
    if (e.key === 'ArrowRight') next = Math.min(tiles.length - 1, idx + 1)
    else if (e.key === 'ArrowLeft') next = Math.max(0, idx - 1)
    else if (e.key === 'ArrowDown') next = Math.min(tiles.length - 1, idx + 6)
    else if (e.key === 'ArrowUp') next = Math.max(0, idx - 6)
    else return
    e.preventDefault()
    tiles[next]?.focus()
  }

  const onIconHover = (icon) => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    tooltipTimerRef.current = setTimeout(() => setHoveredIcon(icon), 450)
  }
  const onIconLeave = () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    setHoveredIcon(null)
  }
  useEffect(() => () => {
    if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
  }, [])

  const isSelected = (entry) =>
    current && current.collection === entry.collection && current.id === entry.id && current.style === entry.style

  const panel = (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label="Escolha um ícone"
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -2 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
      className="fixed z-[80] w-[580px] h-[500px] rounded-2xl border border-accent/20 bg-[#1a1a1e] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.6),0_0_24px_-4px_rgba(255,63,108,0.15)] flex flex-col overflow-hidden"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="text-[16px] font-semibold text-strong tracking-tight">
          Escolha um ícone
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ink hover:text-strong hover:bg-white/5 transition-colors"
        >
          <X size={15} strokeWidth={1.75} />
        </button>
      </div>

      <div className="px-5 pb-2.5">
        <div className="flex items-center gap-2.5 h-[46px] px-3.5 bg-[#0f1014] border border-line rounded-[10px] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 transition-colors">
          <Search size={14} className="text-muted shrink-0" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ícone"
            className="flex-1 bg-transparent text-[13.5px] text-strong placeholder:text-muted focus:outline-none"
          />
        </div>
      </div>

      <div className="px-5 pb-2.5">
        <div className="flex items-center gap-1 h-[34px] px-1 bg-[#0f1014] border border-line rounded-[8px]">
          {STYLE_TABS.map(t => {
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

      <div className="px-5 pb-2 text-[11.5px] text-muted flex items-center justify-between">
        <span>
          {activeCategory === RECENT_CATEGORY_KEY
            ? 'Recentes'
            : (CATEGORY_META[activeCategory]?.label || activeCategory)}
          {' · '}
          <span className="text-ink font-medium">{displayResults.length}</span>
          {' ícones'}
        </span>
        {debouncedSearch && (
          <span className="text-muted/70 italic">filtrando por "{debouncedSearch}"</span>
        )}
      </div>

      <div className="flex-1 min-h-0 flex gap-2 px-3 pb-3">
        <div className="w-[150px] shrink-0 overflow-y-auto py-1 flex flex-col gap-0.5">
          {categoryList.map(({ key, label, icon: CatIcon, count }) => {
            const active = activeCategory === key
            const isRecent = key === RECENT_CATEGORY_KEY
            const isEmpty = isRecent && count === 0
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                disabled={isEmpty && key !== RECENT_CATEGORY_KEY}
                className={
                  'flex items-center gap-2 px-2.5 h-[36px] rounded-[8px] text-[12.5px] font-medium transition-colors text-left ' +
                  (active
                    ? 'bg-accent/25 text-strong border border-accent/30'
                    : isEmpty
                      ? 'text-muted/40 cursor-not-allowed'
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
          onKeyDown={onGridKey}
        >
          {displayResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted text-[12.5px] px-4">
              <span>Nenhum ícone encontrado.</span>
              {debouncedSearch && (
                <span className="text-[11px] mt-1 text-muted/70">
                  Tente "voz", "casa", "jogo", "estudo", "trabalho"…
                </span>
              )}
            </div>
          ) : (
            <div
              className="grid gap-[8px] p-1"
              style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
            >
              {visible.map(entry => {
                const active = isSelected(entry)
                return (
                  <button
                    key={`${entry.collection}:${entry.id}:${entry.style}`}
                    data-icon-tile
                    type="button"
                    onClick={() => onPick({
                      id: entry.id,
                      name: entry.name,
                      collection: entry.collection,
                      style: entry.style,
                    })}
                    onMouseEnter={() => onIconHover(entry)}
                    onMouseLeave={onIconLeave}
                    onFocus={() => setHoveredIcon(entry)}
                    onBlur={onIconLeave}
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
                    <SpaceIcon
                      value={entry}
                      size={22}
                      className="pointer-events-none"
                    />
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

      {hoveredIcon && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-md bg-[#0a0a0c] border border-line text-[12px] text-strong shadow-lg pointer-events-none whitespace-nowrap z-10">
          <span className="font-medium">{hoveredIcon.label}</span>
          <span className="text-muted ml-1.5">· Phosphor</span>
        </div>
      )}
    </motion.div>
  )

  return createPortal(panel, document.body)
}
