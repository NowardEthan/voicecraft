/** Progressive conversation actions: search and invite stay visible; secondary tools live in More. */
import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bell, BellOff, MoreHorizontal, Pin, Search, Terminal, UserPlus, X } from 'lucide-react'
import ChatDensityMenu from './ChatDensityMenu'
import { AnchoredOverlay } from '../../shared/motion/AnchoredOverlay.jsx'

const NOTIFY_OPTIONS = [
  { value: 'all', label: 'Todas as mensagens' },
  { value: 'mentions', label: 'Somente menções' },
  { value: 'muted', label: 'Silenciado' },
]

function prefKey(key) { return `voicecraft:channel-notifications:${key || 'default'}` }
function readPref(key) { try { return localStorage.getItem(prefKey(key)) || 'all' } catch { return 'all' } }

export default function ChatHeaderActions({
  accent,
  density,
  onDensityChange,
  onInvite,
  onSearchClick,
  searchButtonRef,
  onClose,
  pinCount = 0,
  pinsOpen = false,
  onTogglePins,
  pinButtonRef,
  notificationKey,
  commandsOpen = false,
  onToggleCommands,
}) {
  return (
    <div className="vc-channel-actions">
      <ActionButton ref={searchButtonRef} onClick={onSearchClick} label="Buscar nesta conversa">
        <Search size={17} />
      </ActionButton>
      <button
        type="button"
        onClick={onInvite}
        className="vc-header-invite"
        style={{ '--vc-action-accent': accent || 'var(--space-accent)' }}
      >
        <UserPlus size={16} />
        <span className="hidden @[480px]:inline">Convidar</span>
      </button>
      <MoreMenu
        density={density}
        onDensityChange={onDensityChange}
        onCloseRoom={onClose}
        pinCount={pinCount}
        pinsOpen={pinsOpen}
        onTogglePins={onTogglePins}
        anchorRef={pinButtonRef}
        notificationKey={notificationKey}
        commandsOpen={commandsOpen}
        onToggleCommands={onToggleCommands}
      />
    </div>
  )
}

const ActionButton = forwardRef(function ActionButton({ children, onClick, active, label }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`vc-icon-btn${active ? ' is-active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active || undefined}
    >
      {children}
    </button>
  )
})

function MoreMenu({
  density,
  onDensityChange,
  onCloseRoom,
  pinCount,
  pinsOpen,
  onTogglePins,
  anchorRef,
  notificationKey,
  commandsOpen,
  onToggleCommands,
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const [notifyMode, setNotifyMode] = useState(() => readPref(notificationKey))
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const commandsWasOpenRef = useRef(false)

  const setButtonRef = (node) => {
    btnRef.current = node
    if (anchorRef) anchorRef.current = node
  }

  useEffect(() => {
    setNotifyMode(readPref(notificationKey))
    setOpen(false)
  }, [notificationKey])

  useEffect(() => {
    if (commandsWasOpenRef.current && !commandsOpen) btnRef.current?.focus()
    commandsWasOpenRef.current = commandsOpen
  }, [commandsOpen])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined }
    const update = () => {
      const rect = btnRef.current?.getBoundingClientRect()
      if (!rect) return
      const width = Math.min(300, window.innerWidth - 16)
      const maxHeight = Math.max(240, window.innerHeight - rect.bottom - 16)
      setPos({
        top: Math.min(rect.bottom + 8, window.innerHeight - 248),
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        width,
        maxHeight,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open])


  const saveNotify = (value) => {
    setNotifyMode(value)
    try { localStorage.setItem(prefKey(notificationKey), value) } catch {}
    window.dispatchEvent(new CustomEvent('voicecraft:channel-notifications-changed', {
      detail: { key: notificationKey, mode: value },
    }))
  }

  const handleMenuKeys = (event) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = [...menuRef.current.querySelectorAll('button:not(:disabled)')]
    if (!items.length) return
    event.preventDefault()
    const current = Math.max(0, items.indexOf(document.activeElement))
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  const BellIcon = notifyMode === 'muted' ? BellOff : Bell

  return (
    <>
      <button
        ref={setButtonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`vc-icon-btn${open || pinsOpen || commandsOpen ? ' is-active' : ''}`}
        aria-label="Mais opções da conversa"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={18} />
        {pinCount > 0 && <span className="vc-header-count">{pinCount > 99 ? '99+' : pinCount}</span>}
      </button>
      <AnchoredOverlay
        open={open && !!pos}
        ref={menuRef}
        anchorRef={btnRef}
        onClose={() => setOpen(false)}
        placement="top"
        initialFocus
        className="vc-conversation-popover vc-conversation-more-menu fixed"
        style={pos || undefined}
        role="menu"
        aria-label="Mais opções da conversa"
        onKeyDown={handleMenuKeys}
      >
          <p className="vc-conversation-menu__eyebrow">Conversa</p>
          <button type="button" role="menuitem" className={pinsOpen ? 'is-active' : ''} onClick={() => { setOpen(false); onTogglePins?.() }}>
            <span className="vc-conversation-menu__icon"><Pin size={16} /></span>
            <span className="vc-conversation-menu__copy"><strong>Mensagens fixadas</strong><small>{pinCount ? `${pinCount} nesta sala` : 'Nenhuma nesta sala'}</small></span>
          </button>
          <button type="button" role="menuitem" className={commandsOpen ? 'is-active' : ''} onClick={() => { setOpen(false); onToggleCommands?.() }}>
            <span className="vc-conversation-menu__icon"><Terminal size={16} /></span>
            <span className="vc-conversation-menu__copy"><strong>Ferramentas e comandos</strong><small>Ações da conversa e moderação</small></span>
          </button>

          <div className="vc-conversation-menu__section" role="group" aria-label="Notificações">
            <p><BellIcon size={13} /> Notificações</p>
            {NOTIFY_OPTIONS.map((option) => (
              <button key={option.value} type="button" role="menuitemradio" aria-checked={notifyMode === option.value} className={notifyMode === option.value ? 'is-active' : ''} onClick={() => saveNotify(option.value)}>
                <span>{option.label}</span><span className="vc-conversation-radio" aria-hidden />
              </button>
            ))}
          </div>

          <div className="vc-conversation-menu__section" role="group" aria-label="Densidade">
            <p>Densidade</p>
            <ChatDensityMenu value={density} onChange={onDensityChange} embedded />
          </div>

          {onCloseRoom && (
            <div className="vc-conversation-menu__section">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); onCloseRoom() }}>
                <span className="vc-conversation-menu__icon"><X size={16} /></span>
                <span className="vc-conversation-menu__copy"><strong>Fechar sala</strong></span>
              </button>
            </div>
          )}
      </AnchoredOverlay>
    </>
  )
}
