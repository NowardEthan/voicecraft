/**
 * SpaceContextPanel — the left-side sidebar of a Space (between the
 * global rail and the main content area).
 *
 * IMPORTANT: this component only renders *navigation and identity* —
 * it does NOT render the SpaceOverview (Visão geral page). The main
 * column renders that. This avoids the double-mount that was happening
 * previously.
 *
 * Composition (top → bottom):
 *   1. Identity banner — avatar + name + description + meta
 *   2. Vertical navigation list (Visão geral | Eventos)
 *   3. SALAS section — always visible, with "Criar sala" + room list
 *   4. SelfControls — pinned bottom: avatar + name + mic + audio + settings
 *
 * Width: 280 px (within the spec's 260–300 px band).
 */
import { useState, useRef, useEffect, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Settings, LogOut, Trash2, Plus, Mic, Headphones,
  LayoutGrid, Calendar, UserPlus, PanelLeftClose,
} from 'lucide-react'
import SpaceAvatar from '../SpaceAvatar'
import { PersonAvatar } from '../../features/people'
import { resolveSpaceCover, spaceTokens } from '../../features/spaces'
import { SpaceCoverLayer } from '../../features/spaces/components/SpaceCoverLayer'
import SpaceSettingsModal from '../../features/spaces/components/SpaceSettingsModal'
import { useNotifications } from '../../features/notifications'
import VoiceActiveBar from '../../features/rooms/views/voice/components/VoiceActiveBar'
import { SpaceRoomsNav } from '../../features/rooms/views/SpaceRoomsNav'

const NAV_ITEMS = [
  { key: 'overview', label: 'Visão geral', icon: LayoutGrid },
  { key: 'events',   label: 'Eventos',     icon: Calendar },
]

export default function SpaceContextPanel({
  space,
  activeView = 'overview',     // 'overview' | 'events' | 'room' — only affects highlight
  onChangeView,                // optional — sidebar can request to change view
  onSelectRoom,
  onCreateRoom,
  onEditRoom,
  onDeleteRoom,
  members = [],
  currentUserId,
  currentUserName,
  currentRoomId,
  selectedRoomId,
  isCreator,
  canEditSpace = false,
  canManageRooms = false,
  onLeaveSpace,
  onDeleteSpace,
  onEditSpace,
  onInvite,
  onCollapse,
  onOpenSettings,
  optimisticFirstRoom,
  voiceRoom = null,
  onFocusVoice,
  onLeaveCall,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)  // { top, right } in viewport coords
  // Whether the Space identity editor (name / description / color) is
  // open. Wired to the "Configurações do Space" item in the gear popover
  // and rendered as a modal at the bottom of this component.
  const [spaceSettingsOpen, setSpaceSettingsOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const { unreadByRoom, roomKey } = useNotifications()
  const menuRef = useRef(null)        // the gear button (toggle)
  const popoverRef = useRef(null)     // the portal-rendered popover

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      // Click is "inside" if it landed in the gear button OR the popover
      // itself. Without checking the popover too, every click on a menu
      // item registers as "outside" and the menu closes before the
      // item's onClick fires.
      const target = e.target
      const inMenu = menuRef.current && menuRef.current.contains(target)
      const inPopover = popoverRef.current && popoverRef.current.contains(target)
      if (!inMenu && !inPopover) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Open the menu anchored to the gear button. We use position: fixed in
  // viewport coords so the popover escapes any overflow-hidden ancestor
  // (the identity banner has overflow-hidden, which would otherwise clip
  // the popover). The position is recomputed on every open + on resize
  // so it stays glued to the gear button.
  const openMenu = () => {
    const rect = menuRef.current?.getBoundingClientRect()
    if (rect) {
      // Place the popover 6px below the gear, right-aligned to its right edge.
      setMenuPos({
        top: Math.round(rect.bottom + 6),
        right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      })
    }
    setMenuOpen(true)
  }

  if (!space) {
    return (
      <aside className="w-full h-full bg-panel border-r border-line" />
    )
  }

  const tokens = spaceTokens(space)
  const cover = resolveSpaceCover(space)

  // Settings popover portaled to body so it escapes the aside's overflow-hidden.
  // Position is computed from the gear button's bounding rect on every open.
  const settingsPortalNode =
    menuOpen && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <SettingsPopover
            ref={popoverRef}
            isCreator={isCreator}
            canEditSpace={canEditSpace || isCreator}
            position={menuPos}
            onClose={() => setMenuOpen(false)}
            onLeave={() => { setMenuOpen(false); onLeaveSpace?.() }}
            onDelete={() => { setMenuOpen(false); onDeleteSpace?.(space.id) }}
            onInvite={() => { setMenuOpen(false); onInvite?.() }}
            onSettings={() => { setMenuOpen(false); setSpaceSettingsOpen(true) }}
          />,
          document.body,
        )
      : null
  // Merge optimistic first-room placeholder into the rooms list so the
  // wizard's sala shows up in the sidebar immediately (before the server's
  // roomChangedCallback('created') arrives).
  const realRooms = space.rooms || []
  const hasMatchingReal = optimisticFirstRoom
    ? realRooms.some(r => r.name === optimisticFirstRoom.name)
    : true
  const rooms = hasMatchingReal
    ? realRooms
    : [...realRooms, { ...optimisticFirstRoom, id: '__optimistic__' }]

  return (
    <aside
        className="w-full h-full bg-panel border-r border-line flex flex-col overflow-hidden"
      style={tokens}
    >
      {/* === Space identity banner (compact) === */}
      <div className="relative shrink-0 border-b border-line">
        {/* Clip wallpaper only — keep avatar/rings/buttons unclipped */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {cover ? (
            <SpaceCoverLayer src={cover} fit={space.coverFit} className="pointer-events-none" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: 'var(--space-gradient)' }}
            />
          )}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, transparent 35%, rgba(0,0,0,0.20) 100%)',
            }}
          />
        </div>
        <div className="relative z-[1] px-3 sm:px-4 pt-3.5 pb-3">
          <div className="flex items-start gap-2.5">
            <SpaceAvatar
              space={space}
              size={40}
              rounded="2xl"
              className="shadow-md ring-2 ring-panel/80 shrink-0"
            />
            <div className="flex-1 min-w-0 pt-0.5">
              <h2 className="text-[14.5px] font-semibold text-strong tracking-tight truncate">
                {space.name}
              </h2>
              {space.description ? (
                <p className="text-[11.5px] text-ink/65 line-clamp-2 mt-0.5 leading-snug">
                  {space.description}
                </p>
              ) : (canEditSpace || isCreator) ? (
                <button
                  type="button"
                  onClick={() => setSpaceSettingsOpen(true)}
                  className="text-[11px] text-accent/80 hover:text-accent mt-0.5 text-left"
                >
                  + adicionar descrição
                </button>
              ) : (
                <p className="text-[11px] text-muted italic mt-0.5">Sem descrição</p>
              )}
            </div>
            <div className="relative flex items-center gap-0.5 shrink-0 -mr-0.5" ref={menuRef}>
              {onCollapse && (
                <button
                  type="button"
                  onClick={onCollapse}
                  title="Recolher painel"
                  aria-label="Recolher painel"
                  className="w-8 h-8 rounded-md hover:bg-black/40 flex items-center justify-center text-ink/55 hover:text-strong transition-colors"
                >
                  <PanelLeftClose size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
                title="Configurações do Space"
                aria-label="Configurações do Space"
                className="w-8 h-8 rounded-md hover:bg-black/40 flex items-center justify-center text-ink/55 hover:text-strong transition-colors"
              >
                <Settings size={13} />
              </button>
            </div>
          </div>
          {onInvite && (
            <button
              type="button"
              onClick={() => onInvite()}
              className="
                mt-3 w-full h-9 rounded-full inline-flex items-center justify-center gap-1.5
                text-[12.5px] font-semibold text-strong
                hover:opacity-90 active:scale-[0.98] transition-all
              "
              style={{ backgroundColor: 'var(--space-accent)' }}
            >
              <Plus size={14} strokeWidth={2.4} />
              Convidar pro Space
            </button>
          )}
        </div>
      </div>

      {/* === Vertical navigation list (per spec) === */}
      <nav className="shrink-0 px-2 pt-2.5 pb-1.5">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = activeView === item.key
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onChangeView?.(item.key)}
                  className={
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-left ' +
                    'transition-[transform,background-color,color] duration-200 ' +
                    'hover:translate-x-0.5 active:scale-[0.98] ' +
                    (active
                      ? 'bg-accent/[0.10] text-strong'
                      : 'text-ink hover:bg-surface2 hover:text-strong')
                  }
                >
                  <Icon
                    size={14}
                    strokeWidth={1.75}
                    className={active ? 'text-accent' : 'text-muted'}
                  />
                  <span className="text-[12.5px] font-medium">{item.label}</span>
                  {active && (
                    <span
                      className="ml-auto w-1 h-1 rounded-full bg-accent"
                      aria-hidden
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* === Salas section (groups + reorder) === */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <SpaceRoomsNav
          space={space}
          rooms={rooms}
          currentRoomId={currentRoomId}
          selectedRoomId={selectedRoomId}
          canManage={canManageRooms || isCreator}
          unreadByRoom={unreadByRoom}
          roomKey={roomKey}
          onSelectRoom={onSelectRoom}
          onCreateRoom={onCreateRoom}
          onEditRoom={onEditRoom}
          onDeleteRoom={onDeleteRoom}
          confirmDeleteId={confirmDeleteId}
          setConfirmDeleteId={setConfirmDeleteId}
        />
      </div>

      {/* Voice connected — above SelfControls (Discord-style) */}
      {voiceRoom && (
        <VoiceActiveBar
          room={voiceRoom}
          onReturn={onFocusVoice}
          onLeave={onLeaveCall}
        />
      )}

      {/* === SelfControls — pinned bottom === */}
      <SelfControls
        currentUserName={currentUserName}
        currentUserId={currentUserId}
        members={members}
        onOpenSettings={onOpenSettings}
        flushTop={!!voiceRoom}
      />
      {settingsPortalNode}

      {/* Space identity editor — open for edit_space or creator. */}
      <SpaceSettingsModal
        open={spaceSettingsOpen && (canEditSpace || isCreator)}
        space={space}
        onSave={onEditSpace}
        onClose={() => setSpaceSettingsOpen(false)}
        isCreator={isCreator}
      />
    </aside>
  )
}

// ----------------------------------------------------------------------
// SelfControls — mic / audio / identity (DESIGN_SYSTEM §B).
// ----------------------------------------------------------------------
function SelfControls({
  currentUserName,
  currentUserId,
  members = [],
  onOpenSettings,
  flushTop = false,
}) {
  const self = members.find((m) => m.userId === currentUserId)
  const name = self?.displayName || currentUserName || 'você'
  const photo = self?.photoURL || ''
  const openSelf = () => {
    if (currentUserId && typeof window !== 'undefined' && window.__vcOpenProfile) {
      window.__vcOpenProfile(currentUserId)
    }
  }

  return (
    <div
      className={`shrink-0 px-3 py-3 bg-panel ${flushTop ? 'pt-1.5' : 'border-t border-line'}`}
      style={flushTop ? { background: 'var(--vc-surface-1)' } : undefined}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openSelf}
          className="relative shrink-0 rounded-full"
          title={name}
        >
          <PersonAvatar src={photo} name={name} userId={currentUserId} size={34} />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-positive border-2 border-panel" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-strong truncate">{name}</p>
          <p className="text-[10.5px] text-muted leading-tight">Online</p>
        </div>
        <button
          type="button"
          disabled
          aria-label="Microfone (entre numa sala pra mutar)"
          title="Microfone (entre numa sala pra mutar)"
          className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-surface1 transition-colors disabled:opacity-50"
        >
          <Mic size={15} />
        </button>
        <button
          type="button"
          disabled
          aria-label="Fones (entre numa sala pra silenciar)"
          title="Fones (entre numa sala pra silenciar)"
          className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-surface1 transition-colors disabled:opacity-50"
        >
          <Headphones size={15} />
        </button>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            title="Configurações do app"
            aria-label="Configurações do app"
            className="w-8 h-8 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-surface1 transition-colors"
          >
            <Settings size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// Settings popover — small contextual menu for the Space actions.
// Rendered through a portal (see caller) so it can escape the <aside>'s
// overflow-hidden, with position fixed in viewport coords. forwardRef so
// the parent can detect clicks inside the popover and not close it.
// ----------------------------------------------------------------------
const SettingsPopover = forwardRef(function SettingsPopover(
  { isCreator, canEditSpace = false, position, onClose, onLeave, onDelete, onInvite, onSettings },
  ref,
) {
  return (
    <div
      ref={ref}
      className="fixed z-50 w-48 py-1 rounded-modal bg-surface1 border border-line shadow-2xl vc-anim-fade-in-up"
      style={{
        top: position?.top ?? 0,
        right: position?.right ?? 0,
        animationDuration: '160ms',
      }}
    >
      <PopItem icon={UserPlus} onClick={() => { onClose(); onInvite?.() }}>
        Convidar pro Space
      </PopItem>
      {(canEditSpace || isCreator) && (
        <PopItem icon={Settings} onClick={() => { onClose(); onSettings?.() }}>
          Configurações do Space
        </PopItem>
      )}
      <PopItem icon={LogOut} onClick={onLeave}>
        Sair do Space
      </PopItem>
      {isCreator && (
        <>
          <div className="my-1 mx-2 h-px bg-line" />
          <PopItem icon={Trash2} danger onClick={onDelete}>
            Apagar Space
          </PopItem>
        </>
      )}
    </div>
  )
})

function PopItem({ icon: Icon, children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left ' +
        (danger
          ? 'text-danger hover:bg-danger/15'
          : 'text-ink hover:bg-surface2 hover:text-strong')
      }
    >
      <Icon size={13} />
      {children}
    </button>
  )
}
