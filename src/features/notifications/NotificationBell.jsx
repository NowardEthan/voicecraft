import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, CheckCheck, MessageSquare } from 'lucide-react'
import { useNotifications } from './useNotifications.jsx'

function timeAgo(ts) {
  const d = Date.now() - (Number(ts) || 0)
  if (d < 60_000) return 'agora'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} h`
  return `${Math.floor(d / 86_400_000)} d`
}

export function UnreadDot({ count = 0, className = '' }) {
  const n = Number(count) || 0
  if (n <= 0) return null
  const label = n > 99 ? '99+' : String(n)
  return (
    <span
      className={
        `absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full ` +
        `bg-accent text-strong text-[9px] font-bold leading-none ` +
        `flex items-center justify-center shadow-[0_0_0_2px_#0d0f14] ` +
        `translate-x-[15%] -translate-y-[15%] ` +
        className
      }
      aria-label={`${n} não lidas`}
    >
      {label}
    </span>
  )
}

export function RoomUnreadPill({ show }) {
  if (!show) return null
  return (
    <span
      className="ml-auto shrink-0 min-w-[8px] h-2 w-2 rounded-full bg-accent"
      aria-label="Não lidas"
    />
  )
}

/**
 * Bell button + dropdown inbox (portaled so the narrow rail never clips it).
 * @param {'auto'|'rail'|'header'} placement
 */
export default function NotificationBell({
  onOpenTarget,
  className = '',
  placement = 'auto',
}) {
  const { inbox, bellCount, markOneRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  const placePanel = () => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const panelW = Math.min(360, window.innerWidth - 16)
    const panelH = 420
    const pad = 10
    const preferRail = placement === 'rail'
      || (placement === 'auto' && rect.left < 96)

    let left
    let top
    if (preferRail) {
      left = rect.right + 10
      top = rect.top
      if (left + panelW > window.innerWidth - pad) {
        left = Math.max(pad, rect.left - panelW - 10)
      }
      if (top + panelH > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - panelH - pad)
      }
    } else {
      left = rect.right - panelW
      top = rect.bottom + 8
      if (left < pad) left = pad
      if (left + panelW > window.innerWidth - pad) {
        left = window.innerWidth - panelW - pad
      }
      if (top + Math.min(panelH, 280) > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - Math.min(panelH, 280) - 8)
      }
    }
    setPos({ top, left, width: panelW })
  }

  useLayoutEffect(() => {
    if (!open) return undefined
    placePanel()
    const onReposition = () => placePanel()
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    return () => {
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open, placement])

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unread = inbox.filter((n) => !n.read)
  const items = (unread.length ? unread : inbox).slice(0, 40)

  const panel = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notificações"
        className="fixed z-[200] rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden animate-fade-in"
        style={{ top: pos.top, left: pos.left, width: pos.width || 360 }}
      >
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-line">
          <p className="text-[13px] font-semibold text-strong shrink-0">Notificações</p>
          <button
            type="button"
            onClick={() => markAllRead()}
            disabled={bellCount === 0}
            className="
              inline-flex items-center gap-1 text-[11.5px] font-medium
              text-accent disabled:opacity-40 disabled:cursor-not-allowed
              whitespace-nowrap
            "
          >
            <CheckCheck size={13} />
            Marcar tudo como lido
          </button>
        </div>

        <div className="max-h-[min(360px,60vh)] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <MessageSquare size={22} className="mx-auto text-muted mb-2" />
              <p className="text-[13px] text-muted">Nenhuma notificação ainda.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      markOneRead(n.id)
                      onOpenTarget?.({ spaceId: n.spaceId, roomId: n.roomId })
                      setOpen(false)
                    }}
                    className={
                      'w-full text-left px-3.5 py-3 hover:bg-surface2 transition-colors ' +
                      (n.read ? 'opacity-70' : '')
                    }
                  >
                    <div className="flex items-start gap-2.5">
                      {!n.read && (
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-strong truncate">
                          {n.authorName}
                          <span className="font-normal text-muted"> em #{n.roomName}</span>
                        </p>
                        <p className="text-[12.5px] text-ink mt-0.5 line-clamp-2">{n.preview}</p>
                        <p className="text-[11px] text-muted mt-1">
                          {n.spaceName}
                          {n.spaceName ? ' · ' : ''}
                          {timeAgo(n.ts)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Notificações"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="
          relative w-9 h-9 rounded-full flex items-center justify-center
          text-muted hover:text-strong hover:bg-surface2 transition-colors
        "
      >
        <Bell size={18} strokeWidth={1.75} />
        <UnreadDot count={bellCount} />
      </button>
      {panel}
    </div>
  )
}
