/**
 * GlobalRail — narrow vertical strip (72px, per DESIGN_SYSTEM §3.1).
 *
 * Identity of the strip:
 *   - Home button (returns to the welcome state)
 *   - Stacked Space avatars (scrollable when many)
 *   - "Add Space" affordance (menu: create / join)
 *   - Account avatar at the bottom (Conta Lunar)
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Home, Plus, Sparkles, LogIn } from 'lucide-react'
import SpaceAvatar from './SpaceAvatar'
import { AvatarCircle } from '../features/account/components/AccountSidebar'
import { useNotifications, UnreadDot } from '../features/notifications'

export default function GlobalRail({
  spaces = [],
  currentSpaceId,
  switchingSpaceId = null,
  onSelectSpace,
  onAddSpace,
  onOpenSpaceHub,
  onOpenAccount,
  accountOpen = false,
  accountPhoto = '',
  accountName = '',
  compact = false,
  notificationBell = null,
}) {
  const { unreadBySpace } = useNotifications()
  const [hoveredId, setHoveredId] = useState(null)
  const [hoverPos, setHoverPos] = useState({ top: 0, left: 0 })
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const addBtnRef = useRef(null)
  const menuRef = useRef(null)
  const tile = compact ? 'w-10 h-10' : 'w-12 h-12'
  const avatar = compact ? 32 : 40
  const hoveredSpace = hoveredId ? spaces.find((s) => s.id === hoveredId) : null

  const placeMenu = () => {
    const rect = addBtnRef.current?.getBoundingClientRect()
    if (!rect) return
    const menuH = 156
    const menuW = 220
    const pad = 12
    let top = rect.top
    let left = rect.right + 10
    // Prefer opening upward when the + sits near the bottom (above account).
    if (top + menuH > window.innerHeight - pad) {
      top = Math.max(pad, rect.bottom - menuH)
    }
    if (left + menuW > window.innerWidth - pad) {
      left = Math.max(pad, rect.left - menuW - 10)
    }
    setMenuPos({ top, left })
  }

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e) => {
      if (menuRef.current?.contains(e.target) || addBtnRef.current?.contains(e.target)) return
      setMenuOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    const onReposition = () => placeMenu()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
    }
  }, [menuOpen])

  const openMenu = () => {
    placeMenu()
    setMenuOpen((o) => !o)
  }

  return (
    <aside
      className={`${compact ? 'w-14' : 'w-[72px]'} shrink-0 h-full min-h-0 flex flex-col items-center py-2 sm:py-3 gap-1.5 sm:gap-2 bg-rail border-r border-line overflow-visible pb-[max(0.5rem,env(safe-area-inset-bottom))]`}
      aria-label="Spaces"
    >
      <button
        type="button"
        onClick={() => onSelectSpace(null)}
        title="Início"
        aria-label="Início"
        aria-pressed={!currentSpaceId && !accountOpen}
        className={
          `relative ${tile} rounded-2xl flex items-center justify-center shrink-0 ` +
          'transition-[transform,background-color,border-radius,box-shadow] duration-200 ' +
          'hover:scale-[1.04] active:scale-[0.94] ' +
          (!currentSpaceId && !accountOpen
            ? 'bg-accent text-white shadow-[0_0_0_2px_var(--space-accent-glow-24)]'
            : 'bg-surface1 text-ink hover:bg-surface2')
        }
      >
        <Home size={20} strokeWidth={1.75} />
      </button>

      {notificationBell ? (
        <div className="relative shrink-0 flex items-center justify-center w-full px-1 overflow-visible">
          {typeof notificationBell === 'object' && notificationBell?.type
            ? notificationBell
            : notificationBell}
        </div>
      ) : null}

      {spaces.length > 0 && (
        <div className="w-8 h-px my-0.5 bg-line shrink-0" />
      )}

      <div className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden overscroll-contain flex flex-col items-center gap-0.5 py-1.5">
        {spaces.map((space) => {
          const active = currentSpaceId === space.id
          const isSwitching = switchingSpaceId === space.id
          const unread = unreadBySpace[space.id] || 0
          return (
            <div
              key={space.id}
              className="relative shrink-0 p-1"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setHoveredId(space.id)
                setHoverPos({
                  top: rect.top + rect.height / 2,
                  left: rect.right + 4,
                })
              }}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                type="button"
                onClick={() => onSelectSpace(space.id)}
                title={space.name}
                aria-label={unread ? `${space.name}, ${unread} não lidas` : space.name}
                aria-pressed={active}
                aria-busy={isSwitching || undefined}
                className="relative block transition-transform duration-200 hover:scale-[1.05] active:scale-[0.94]"
              >
                <SpaceAvatar
                  space={space}
                  size={compact ? 40 : 48}
                  rounded={active || hoveredId === space.id || isSwitching ? 'xl' : 'full'}
                  withRing={active || isSwitching}
                />
                <UnreadDot count={unread} className="!translate-x-0 !-translate-y-0 !top-0.5 !right-0.5" />
                {isSwitching && (
                  <span
                    className="absolute inset-0 rounded-[inherit] flex items-center justify-center bg-canvas/40 pointer-events-none"
                    aria-hidden
                  >
                    <span className="w-4 h-4 rounded-full border-2 border-line border-t-accent vc-anim-spin" />
                  </span>
                )}
              </button>
            </div>
          )
        })}

        {/* Always sits right under the last Space (Discord-style). */}
        <div className="relative shrink-0 p-1 mt-0.5">
          <button
            ref={addBtnRef}
            type="button"
            onClick={openMenu}
            title="Criar ou entrar"
            aria-label="Criar ou entrar em um Space"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={
              `${tile} rounded-full flex items-center justify-center ` +
              'bg-surface1 text-muted hover:text-strong hover:bg-surface2 ' +
              'transition-[transform,background-color,border-radius] duration-200 ' +
              'hover:scale-[1.04] hover:rounded-2xl active:scale-[0.94] ' +
              'border border-dashed border-line ' +
              (menuOpen ? 'text-strong bg-surface2 rounded-2xl' : '')
            }
          >
            <Plus size={20} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {menuOpen && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[80] w-[220px] rounded-2xl border border-white/[0.08] bg-[#12141a] shadow-2xl p-1.5 animate-fade-in"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            Spaces
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onAddSpace?.()
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left hover:bg-white/[0.06] transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <Sparkles size={15} strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-strong">Criar Space</span>
              <span className="block text-[11px] text-muted">Novo espaço do zero</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onOpenSpaceHub?.()
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left hover:bg-white/[0.06] transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-white/[0.06] text-strong flex items-center justify-center shrink-0">
              <LogIn size={15} strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-strong">Entrar em um Space</span>
              <span className="block text-[11px] text-muted">Convite ou Spaces públicos</span>
            </span>
          </button>
        </div>,
        document.body,
      )}

      {hoveredSpace && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[70] px-2.5 py-1 rounded-lg bg-rail border border-line text-strong text-[12px] font-medium whitespace-nowrap pointer-events-none -translate-y-1/2 shadow-lg"
          style={{ top: hoverPos.top, left: hoverPos.left }}
        >
          {hoveredSpace.name}
        </div>,
        document.body,
      )}

      {onOpenAccount && (
        <div className="shrink-0 mt-auto pb-1 pt-2">
          <button
            type="button"
            onClick={onOpenAccount}
            title="Conta Lunar"
            aria-label="Conta Lunar"
            aria-pressed={accountOpen}
            className={[
              'rounded-full p-[2px] transition-transform duration-200 hover:scale-[1.06] active:scale-[0.94]',
              accountOpen ? 'bg-accent shadow-[0_0_0_2px_var(--space-accent-glow-24)]' : 'bg-transparent hover:bg-white/10',
            ].join(' ')}
          >
            <AvatarCircle src={accountPhoto} name={accountName} size={avatar} className="ring-2 ring-rail" />
          </button>
        </div>
      )}
    </aside>
  )
}
