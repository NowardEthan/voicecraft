import { useEffect, useMemo, useRef, useState } from 'react'
import {
  X, ChevronLeft, ChevronRight, Sparkles, Users, Shield, Search, ChevronDown,
  Trash2, UserX, Clock, Eraser, Info, Download,   Megaphone, DoorOpen, ScrollText,
  BarChart3, Timer, ShieldOff, UserMinus,
} from 'lucide-react'
import {
  listUserCommands,
  listAdminCommands,
  listVisibleCommands,
  getVisibleCommand,
  runCommand,
  hasAnyAdminCommand,
  filterCommands,
  COMMAND_CATEGORIES,
} from './registry'
import CommandDetail from './CommandDetail'
import { flashToast } from '../../../shared/utils/toast'

const ICONS = {
  purge_room: Trash2,
  purge_author: UserX,
  purge_older: Clock,
  autopurge: Clock,
  clear_local: Eraser,
  help: Info,
  export_chat: Download,
  announce: Megaphone,
  lobby: DoorOpen,
  rules: ScrollText,
  chat_stats: BarChart3,
  slowmode: Timer,
  lock_channel: ShieldOff,
  kick_member: UserMinus,
}

const PANEL_WIDTH_MIN = 320
const PANEL_WIDTH_MAX = 720
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_KEY = 'voicecraft:commandsPanelWidth'

function panelWidthKey(userId) {
  return userId ? `${PANEL_WIDTH_KEY}:${userId}` : PANEL_WIDTH_KEY
}

function clampPanelWidth(n) {
  const max = typeof window !== 'undefined'
    ? Math.min(PANEL_WIDTH_MAX, Math.floor(window.innerWidth * 0.92))
    : PANEL_WIDTH_MAX
  return Math.round(Math.min(max, Math.max(PANEL_WIDTH_MIN, Number(n) || PANEL_WIDTH_DEFAULT)))
}

function readStoredPanelWidth(userId) {
  try {
    const raw = window.localStorage.getItem(panelWidthKey(userId))
    if (raw == null && userId) {
      const legacy = window.localStorage.getItem(PANEL_WIDTH_KEY)
      if (legacy != null) return clampPanelWidth(legacy)
    }
    return clampPanelWidth(raw ?? PANEL_WIDTH_DEFAULT)
  } catch {
    return PANEL_WIDTH_DEFAULT
  }
}

function writeStoredPanelWidth(userId, width) {
  try {
    window.localStorage.setItem(panelWidthKey(userId), String(clampPanelWidth(width)))
  } catch { /* ignore */ }
}

export default function CommandsPanel({
  open,
  onClose,
  canModerateChat = false,
  canKick = false,
  members = [],
  chat,
  space,
  room,
  signaling,
  currentUserId,
}) {
  const perms = useMemo(
    () => ({ canModerateChat, canKick }),
    [canModerateChat, canKick],
  )
  const [catalogTab, setCatalogTab] = useState('native')
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all') // all | user | admin | danger | config
  const [category, setCategory] = useState('all')
  const [panelWidth, setPanelWidth] = useState(() => readStoredPanelWidth(currentUserId))
  const [resizing, setResizing] = useState(false)
  const searchRef = useRef(null)
  const resizeRef = useRef(null)
  const panelWidthRef = useRef(panelWidth)

  useEffect(() => {
    panelWidthRef.current = panelWidth
  }, [panelWidth])

  useEffect(() => {
    setPanelWidth(readStoredPanelWidth(currentUserId))
  }, [currentUserId])

  const selected = useMemo(
    () => (selectedId ? getVisibleCommand(selectedId, perms) : null),
    [selectedId, perms],
  )

  const showAdmin = hasAnyAdminCommand(perms)
  const visibleAll = useMemo(() => listVisibleCommands(perms), [perms])

  const filterOpts = useMemo(() => ({ query, category, scope }), [query, category, scope])

  const filteredUser = useMemo(
    () => filterCommands(listUserCommands(), filterOpts),
    [filterOpts],
  )
  const filteredAdmin = useMemo(
    () => filterCommands(listAdminCommands(perms), filterOpts),
    [perms, filterOpts],
  )

  const activeCategoryIds = useMemo(() => {
    const ids = new Set(visibleAll.map((c) => c.category).filter(Boolean))
    return COMMAND_CATEGORIES.filter((c) => ids.has(c.id))
  }, [visibleAll])

  const totalFiltered = filteredUser.length + filteredAdmin.length
  const hasActiveFilters = !!(query.trim() || scope !== 'all' || category !== 'all')

  useEffect(() => {
    if (!open) {
      setSelectedId(null)
      setCatalogTab('native')
      setQuery('')
      setScope('all')
      setCategory('all')
    }
  }, [open])

  useEffect(() => {
    if (selectedId && !getVisibleCommand(selectedId, perms)) {
      setSelectedId(null)
    }
  }, [selectedId, perms])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (selectedId) setSelectedId(null)
        else if (query) setQuery('')
        else onClose?.()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !selectedId) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, selectedId, query])

  useEffect(() => {
    if (!resizing) return undefined
    const onMove = (e) => {
      const start = resizeRef.current
      if (!start) return
      const next = clampPanelWidth(start.width + (start.x - e.clientX))
      panelWidthRef.current = next
      setPanelWidth(next)
    }
    const onUp = () => {
      setResizing(false)
      resizeRef.current = null
      writeStoredPanelWidth(currentUserId, panelWidthRef.current)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing, currentUserId])

  const beginResize = (e) => {
    e.preventDefault()
    e.stopPropagation()
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* ignore */ }
    resizeRef.current = { x: e.clientX, width: panelWidthRef.current }
    setResizing(true)
  }

  if (!open) return null

  const ctx = {
    spaceId: space?.id,
    roomId: room?.id,
    roomName: room?.name,
    userId: currentUserId,
    canModerateChat,
    canKick,
    signaling,
    chat,
    postSystem: chat?.postSystem,
    flashToast,
  }

  const handleRun = async (id, params = {}) => {
    setBusy(true)
    try {
      await runCommand(id, ctx, params)
    } catch (err) {
      flashToast(err?.message || 'Falha ao executar comando')
    } finally {
      setBusy(false)
    }
  }

  const clearFilters = () => {
    setQuery('')
    setScope('all')
    setCategory('all')
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fechar painel"
        className="absolute inset-0 z-30 bg-black/35 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        className={[
          'absolute top-0 right-0 bottom-0 z-40',
          'flex flex-col border-l border-line bg-[var(--vc-bg-panel)] shadow-2xl',
          resizing ? '' : 'animate-[vcCmdSlide_180ms_ease-out]',
        ].join(' ')}
        style={{ width: `min(100%, ${panelWidth}px)` }}
        role="dialog"
        aria-label="Comandos do chat"
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar painel de comandos"
          aria-valuenow={panelWidth}
          aria-valuemin={PANEL_WIDTH_MIN}
          aria-valuemax={PANEL_WIDTH_MAX}
          tabIndex={0}
          onPointerDown={beginResize}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              const next = clampPanelWidth(panelWidth + 16)
              setPanelWidth(next)
              writeStoredPanelWidth(currentUserId, next)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              const next = clampPanelWidth(panelWidth - 16)
              setPanelWidth(next)
              writeStoredPanelWidth(currentUserId, next)
            }
          }}
          className={[
            'absolute left-0 top-0 bottom-0 z-50 w-1.5 -translate-x-1/2',
            'cursor-col-resize touch-none group',
            'flex items-center justify-center',
          ].join(' ')}
        >
          <span
            className={[
              'h-12 w-1 rounded-full transition-colors',
              resizing
                ? 'bg-[var(--space-accent,#f5b942)]'
                : 'bg-white/20 group-hover:bg-white/45 group-focus-visible:bg-white/45',
            ].join(' ')}
          />
        </div>

        <header className="flex items-center gap-1.5 px-2.5 h-12 border-b border-line shrink-0">
          {selected ? (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05]"
              aria-label="Voltar"
            >
              <ChevronLeft size={18} />
            </button>
          ) : null}
          <div className="text-[13px] font-semibold text-strong truncate min-w-0">
            {selected ? selected.label : 'Comandos'}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05]"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </header>

        {!selected && (
          <div className="shrink-0 border-b border-line/70 space-y-2 px-3 pt-2.5 pb-2.5">
            <div className="flex gap-1">
              <TabBtn
                active={catalogTab === 'native'}
                onClick={() => setCatalogTab('native')}
                icon={Sparkles}
                label="Nativos"
              />
              <TabBtn
                active={catalogTab === 'community'}
                onClick={() => setCatalogTab('community')}
                icon={Users}
                label="Comunidade"
              />
            </div>

            {catalogTab === 'native' && (
              <>
                <label className="relative block">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar comandos…"
                    className="w-full h-9 rounded-lg bg-surface1 border border-line pl-8 pr-8 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-[var(--space-accent)]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-ink"
                      aria-label="Limpar busca"
                    >
                      <X size={13} />
                    </button>
                  )}
                </label>

                <div className="grid grid-cols-2 gap-1.5">
                  <FilterSelect
                    label="Escopo"
                    value={scope}
                    onChange={setScope}
                    options={[
                      { value: 'all', label: 'Todos' },
                      ...(showAdmin
                        ? [
                            { value: 'user', label: 'Para você' },
                            { value: 'admin', label: 'Admin' },
                            { value: 'danger', label: 'Perigosos' },
                            { value: 'config', label: 'Config' },
                          ]
                        : []),
                    ]}
                  />
                  <FilterSelect
                    label="Categoria"
                    value={category}
                    onChange={setCategory}
                    options={[
                      { value: 'all', label: 'Todas' },
                      ...activeCategoryIds.map((c) => ({ value: c.id, label: c.label })),
                    ]}
                  />
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5">
          {selected ? (
            <CommandDetail
              command={selected}
              members={members}
              busy={busy}
              canModerateChat={canModerateChat}
              canKick={canKick}
              space={space}
              room={room}
              signaling={signaling}
              chat={chat}
              currentUserId={currentUserId}
              onRun={(params) => handleRun(selected.id, params)}
            />
          ) : catalogTab === 'native' ? (
            <div className="space-y-4">
              {totalFiltered === 0 ? (
                <EmptySearch query={query} onClear={clearFilters} />
              ) : (
                <>
                  {(scope === 'all' || scope === 'user' || scope === 'config' || scope === 'danger') && filteredUser.length > 0 && (
                    <CommandSection
                      title={showAdmin ? 'Para você' : null}
                      commands={filteredUser}
                      onSelect={setSelectedId}
                    />
                  )}
                  {showAdmin
                    && (scope === 'all' || scope === 'admin' || scope === 'danger' || scope === 'config')
                    && filteredAdmin.length > 0 && (
                    <CommandSection
                      title="Administração"
                      titleIcon={Shield}
                      commands={filteredAdmin}
                      onSelect={setSelectedId}
                    />
                  )}
                </>
              )}
              {hasActiveFilters && totalFiltered > 0 && (
                <p className="text-[10.5px] text-muted text-center pt-1">
                  {totalFiltered} comando{totalFiltered === 1 ? '' : 's'}
                  {query.trim() ? ` para “${query.trim()}”` : ''}
                </p>
              )}
            </div>
          ) : (
            <CommunityPlaceholder />
          )}
        </div>
      </aside>

      <style>{`
        @keyframes vcCmdSlide {
          from { transform: translateX(12px); opacity: 0.85; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="w-full appearance-none h-8 rounded-lg bg-surface1 border border-line pl-2.5 pr-7 text-[11.5px] text-ink outline-none focus:border-[var(--space-accent)]"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      </div>
    </label>
  )
}

function EmptySearch({ query, onClear }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface1/40 px-4 py-8 text-center space-y-2">
      <Search size={18} className="mx-auto text-muted" />
      <div className="text-[13px] font-semibold text-strong">Nenhum comando</div>
      <p className="text-[11.5px] text-muted leading-relaxed">
        {query.trim()
          ? `Nada encontrado para “${query.trim()}”.`
          : 'Nenhum comando combina com estes filtros.'}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="text-[12px] text-ink font-medium hover:underline"
      >
        Limpar filtros
      </button>
    </div>
  )
}

function CommandSection({ title, titleIcon: TitleIcon, commands, onSelect }) {
  return (
    <section className="space-y-1.5">
      {title && (
        <div className="flex items-center gap-1.5 px-0.5 pt-0.5">
          {TitleIcon && <TitleIcon size={12} className="text-muted" strokeWidth={2} />}
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {title}
          </span>
        </div>
      )}
      <ul className="space-y-1.5">
        {commands.map((cmd) => {
          const Icon = ICONS[cmd.id] || Info
          return (
            <li key={cmd.id}>
              <button
                type="button"
                onClick={() => onSelect(cmd.id)}
                className="w-full text-left rounded-xl border border-line bg-surface1/70 hover:bg-surface2/80 px-3 py-2.5 flex items-center gap-2.5 transition-colors group"
              >
                <div
                  className={[
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                    cmd.danger
                      ? 'bg-[var(--vc-danger)]/10 border-[var(--vc-danger)]/25 text-[var(--vc-danger)]'
                      : 'bg-surface2 border-line text-muted group-hover:text-ink',
                  ].join(' ')}
                >
                  <Icon size={15} strokeWidth={1.9} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[13px] font-semibold text-strong truncate block">
                    {cmd.label}
                  </span>
                  <p className="text-[11px] text-muted leading-snug line-clamp-2 mt-0.5">
                    {cmd.description}
                  </p>
                </div>
                <ChevronRight size={15} className="text-muted shrink-0 opacity-60 group-hover:opacity-100" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CommunityPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface1/40 px-4 py-8 text-center space-y-2">
      <div className="mx-auto w-10 h-10 rounded-full bg-surface2 border border-line flex items-center justify-center text-muted">
        <Users size={18} />
      </div>
      <div className="text-[13px] font-semibold text-strong">Comunidade</div>
      <p className="text-[11.5px] text-muted leading-relaxed max-w-[260px] mx-auto">
        Em breve você poderá instalar e gerenciar comandos criados pela comunidade por aqui.
      </p>
      <span className="inline-flex text-[10.5px] uppercase tracking-wide text-muted/80 border border-line rounded-full px-2 py-0.5">
        Feature futura
      </span>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-medium transition-colors',
        active
          ? 'bg-surface2 text-strong border border-line'
          : 'text-muted hover:text-ink hover:bg-white/[0.03]',
      ].join(' ')}
    >
      <Icon size={13} strokeWidth={2} />
      {label}
    </button>
  )
}
