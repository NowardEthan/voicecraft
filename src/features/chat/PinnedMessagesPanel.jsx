/**
 * PinnedMessagesPanel — Discord-style list of pinned messages for a room.
 * Portaled to document.body with fixed coords so it never paints under the feed.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pin, PinOff, X } from 'lucide-react'

function previewText(msg) {
  if (!msg || msg.deleted) return 'Mensagem apagada'
  const text = String(msg.text || '').trim()
  if (text) return text.length > 160 ? `${text.slice(0, 160)}…` : text
  if (msg.attachment?.name) return `Anexo: ${msg.attachment.name}`
  if (msg.kind === 'announce' || msg.announce) return msg.announce?.title || 'Anúncio'
  if (msg.kind === 'lobby_event') return 'Evento do lobby'
  return 'Mensagem'
}

function formatPinTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function useAnchorRect(open, anchorRef) {
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return undefined
    }
    const update = () => {
      const el = anchorRef?.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const width = Math.min(380, window.innerWidth - 24)
      let left = r.right - width
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12))
      const top = Math.min(r.bottom + 8, window.innerHeight - 80)
      setPos({ top, left, width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, anchorRef])

  return pos
}

export default function PinnedMessagesPanel({
  open,
  onClose,
  messages = [],
  members = [],
  currentUserId = null,
  canModerate = false,
  accent = 'var(--space-accent)',
  onJump,
  onUnpin,
  anchorRef = null,
}) {
  const panelRef = useRef(null)
  const pos = useAnchorRect(open, anchorRef)

  const pinned = useMemo(() => {
    return (messages || [])
      .filter((m) => m && m.pinned && !m.deleted)
      .sort((a, b) => (b.pinnedAt || b.ts || 0) - (a.pinnedAt || a.ts || 0))
  }, [messages])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return
      if (anchorRef?.current?.contains?.(e.target)) return
      onClose?.()
    }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open || !pos || typeof document === 'undefined') return null

  const nameOf = (msg) => {
    const uid = msg.authorId
    const member = members.find((m) => m.userId === uid || m.id === uid)
    if (member?.displayName) return member.displayName
    if (uid && uid === currentUserId) return 'você'
    return msg.author || 'alguém'
  }

  const canUnpinMsg = (msg) => {
    if (canModerate) return true
    return !!(currentUserId && msg.authorId === currentUserId)
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Mensagens fixadas"
      className="fixed z-[200] flex flex-col rounded-2xl border border-white/[0.1] bg-[#15171c] shadow-[0_20px_50px_-16px_rgba(0,0,0,0.75)] overflow-hidden"
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: 'min(420px, 55vh)',
      }}
    >
      <header className="shrink-0 flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-white/[0.08]">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `color-mix(in srgb, ${accent} 22%, transparent)`,
              color: accent,
            }}
          >
            <Pin size={14} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-strong truncate">Mensagens fixadas</p>
            <p className="text-[11px] text-muted">
              {pinned.length === 0
                ? 'Nenhuma nesta sala'
                : `${pinned.length} fixada${pinned.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
          aria-label="Fechar"
        >
          <X size={15} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto py-1.5">
        {pinned.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Pin size={22} className="mx-auto text-muted/50 mb-2" />
            <p className="text-[12.5px] text-muted">
              Fixe mensagens importantes pelo menu da mensagem.
            </p>
          </div>
        ) : (
          pinned.map((msg) => (
            <div
              key={msg.id}
              className="group flex items-start gap-2 px-2.5 py-1.5 mx-1 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              <button
                type="button"
                onClick={() => {
                  onJump?.(msg.id)
                  onClose?.()
                }}
                className="flex-1 min-w-0 text-left px-1.5 py-1"
              >
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <span className="text-[12.5px] font-semibold text-strong truncate">
                    {nameOf(msg)}
                  </span>
                  <span className="text-[10.5px] text-muted shrink-0 tabular-nums">
                    {formatPinTime(msg.pinnedAt || msg.ts)}
                  </span>
                </div>
                <p className="text-[12.5px] text-ink/90 line-clamp-2 mt-0.5 whitespace-pre-wrap break-words">
                  {previewText(msg)}
                </p>
              </button>
              {canUnpinMsg(msg) && onUnpin && (
                <button
                  type="button"
                  onClick={() => onUnpin(msg.id)}
                  className="shrink-0 w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 hover:text-warning hover:bg-white/[0.06] transition-all"
                  title="Desafixar"
                  aria-label="Desafixar mensagem"
                >
                  <PinOff size={14} strokeWidth={1.9} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  )
}
