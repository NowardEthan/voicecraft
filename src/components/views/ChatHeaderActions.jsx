/**
 * ChatHeaderActions — horizontal row of icon buttons (Pin, Bell,
 * Invite, Search, Density, More).
 *
 * Layout component (Horizontal Layout Group). All buttons share the
 * same `vc-icon-btn` styling. The DensityMenu is hidden at narrow
 * widths but a fallback row appears in the More dropdown.
 *
 * The "More" dropdown owns its own open/close state and closes on
 * outside mousedown.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Pin, Bell, UserPlus, Search, MoreHorizontal,
} from 'lucide-react'
import ChatDensityMenu from './ChatDensityMenu'
import {
  cycleChatDensity,
  normalizeChatDensity,
  resolveChatDensity,
} from './chatDensity'

export default function ChatHeaderActions({
  accent,
  density,
  onDensityChange,
  onInvite,
  onSearchClick,
  onClose,
  pinCount = 0,
  pinsOpen = false,
  onTogglePins,
  pinButtonRef = null,
}) {
  const inviteBg = accent || 'var(--space-accent)'

  return (
    <div className="vc-channel-actions flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto">
      <button
        ref={pinButtonRef}
        type="button"
        onClick={onTogglePins}
        className={[
          'vc-icon-btn relative w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0',
          pinsOpen
            ? 'text-strong bg-white/[0.08]'
            : 'text-muted hover:text-strong hover:bg-white/[0.05]',
        ].join(' ')}
        title={pinCount > 0 ? `Mensagens fixadas (${pinCount})` : 'Mensagens fixadas'}
        aria-label="Mensagens fixadas"
        aria-expanded={pinsOpen}
      >
        <Pin size={15} strokeWidth={pinsOpen || pinCount > 0 ? 2.2 : 1.8} />
        {pinCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold leading-4 text-center"
            style={{
              background: accent || 'var(--space-accent)',
              color: 'var(--vc-on-accent, #fff)',
            }}
          >
            {pinCount > 99 ? '99+' : pinCount}
          </span>
        )}
      </button>

      <button
        type="button"
        className="vc-icon-btn w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors shrink-0"
        title="Notificações"
        aria-label="Configurar notificações"
      >
        <Bell size={15} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        onClick={onSearchClick}
        className="vc-icon-btn w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors shrink-0"
        title="Buscar"
        aria-label="Buscar nesta conversa"
      >
        <Search size={15} strokeWidth={1.8} />
      </button>

      <div className="hidden @[520px]:block shrink-0">
        <ChatDensityMenu
          value={density}
          onChange={onDensityChange}
        />
      </div>

      <MoreMenu
        density={density}
        onDensityChange={onDensityChange}
        onCloseRoom={onClose}
      />

      {/* Convidar — CTA na cor da sala / Space. */}
      <button
        type="button"
        onClick={onInvite}
        className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[12.5px] font-semibold transition-colors"
        style={{
          background: inviteBg,
          color: 'var(--vc-on-accent, #fff)',
          boxShadow: accent
            ? `0 0 0 1px color-mix(in srgb, ${accent} 45%, transparent)`
            : '0 0 0 1px color-mix(in srgb, var(--space-accent) 45%, transparent)',
        }}
        title="Convidar pessoas pra essa sala"
        aria-label="Convidar pessoas pra essa sala"
      >
        <UserPlus size={14} strokeWidth={2} />
        Convidar
      </button>
    </div>
  )
}

/** "More" dropdown — density toggle (narrow widths) + close room.
 *  Portaled so it isn't covered by the message feed. */
function MoreMenu({ density, onDensityChange, onCloseRoom }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return undefined
    }
    const update = () => {
      const el = btnRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const width = 176
      let left = r.right - width
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPos({ top: r.bottom + 6, left, width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative shrink-0" data-header-menu>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="vc-icon-btn w-9 h-9 rounded-full flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.05] transition-colors"
        title="Mais"
        aria-label="Mais opções"
        aria-expanded={open}
      >
        <MoreHorizontal size={15} strokeWidth={1.8} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[200] py-1 rounded-xl bg-surface1 border border-line shadow-2xl animate-fade-in-up"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          <button
            type="button"
            onClick={() => {
              const next = cycleChatDensity(density)
              setOpen(false)
              onDensityChange(next)
            }}
            className="w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-surface2 hover:text-strong"
          >
            Densidade: {resolveChatDensity(normalizeChatDensity(density)).shortLabel}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onCloseRoom?.() }}
            className="w-full px-3 py-1.5 text-left text-[12px] text-ink hover:bg-surface2 hover:text-strong"
          >
            Fechar sala
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
