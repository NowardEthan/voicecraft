/**
 * PinnedMessagesPanel - Discord-style list of pinned messages for a room.
 * Portaled to document.body with fixed coords so it never paints under the feed.
 */
import { useLayoutEffect, useMemo, useState } from 'react'
import { Pin, PinOff, X } from 'lucide-react'
import { AnchoredOverlay } from '../../shared/motion/AnchoredOverlay.jsx'
import { AppearItem, AppearList } from '../../shared/motion/Appear.jsx'
import ChatFeatureCardFrame from './cards/ChatFeatureCardFrame.jsx'
import { createAnnouncementCardViewModel, createMessageCardViewModel } from './cards/featureCardViewModels.js'

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
  const pos = useAnchorRect(open, anchorRef)

  const pinned = useMemo(() => {
    return (messages || [])
      .filter((m) => m && m.pinned && !m.deleted)
      .sort((a, b) => (b.pinnedAt || b.ts || 0) - (a.pinnedAt || a.ts || 0))
      .map((message) => ({
        message,
        vm: message.kind === 'announce' || message.announce
          ? createAnnouncementCardViewModel(message, { variant: 'pinned', maxLength: 160 })
          : createMessageCardViewModel(message, { variant: 'pinned', maxLength: 160 }),
      }))
  }, [messages])


  if (typeof document === 'undefined') return null

  const nameOf = (msg) => {
    const uid = msg.authorId
    const member = members.find((m) => m.userId === uid || m.id === uid)
    if (member?.displayName) return member.displayName
    if (uid && uid === currentUserId) return '\u0076\u006f\u0063\u00ea'
    return msg.author || '\u0061\u006c\u0067\u0075\u00e9\u006d'
  }

  const canUnpinMsg = (msg) => {
    if (canModerate) return true
    return !!(currentUserId && msg.authorId === currentUserId)
  }

  return (
    <AnchoredOverlay
      open={open && !!pos}
      anchorRef={anchorRef}
      placement="top"
      role="dialog"
      onClose={onClose}
      initialFocus="[data-pins-close]"
      aria-label="Mensagens fixadas"
      className="vc-conversation-popover vc-conversation-pins fixed flex flex-col overflow-hidden"
      style={pos ? {
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: 'min(420px, 55vh)',
      } : undefined}
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
          data-pins-close
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
          <AppearList>
          {pinned.map(({ message: msg, vm }) => (
            <AppearItem
              key={msg.id || msg.firestoreId}
              className="group flex items-start gap-2 px-2.5 py-1.5 mx-1 rounded-xl hover:bg-white/[0.04] transition-colors"
            >
              <ChatFeatureCardFrame
                as="button"
                type="button"
                compact
                interactive
                accent={vm.accent || accent}
                className={`vc-pinned-card ${vm.kind === 'announcement' ? 'is-announcement' : 'is-message'}`}
                onClick={() => {
                  onJump?.(msg.id || msg.firestoreId)
                  onClose?.()
                }}
                badge={<span>{vm.kind === 'announcement' ? 'Anúncio fixado' : 'Mensagem fixada'}</span>}
                title={<span>{vm.kind === 'announcement' ? vm.title : nameOf(msg)}</span>}
                body={<span>{vm.snippet || (msg.attachment?.name ? `Anexo: ${msg.attachment.name}` : 'Mensagem')}</span>}
                status={<time dateTime={vm.time?.iso}>{formatPinTime(msg.pinnedAt || msg.ts)}</time>}
                aria-label={`Ir para ${vm.kind === 'announcement' ? 'anúncio' : 'mensagem'} fixada: ${vm.title}`}
              />
              {canUnpinMsg(msg) && onUnpin && (
                <button
                  type="button"
                  onClick={() => onUnpin(msg.id || msg.firestoreId)}
                  className="shrink-0 w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 hover:text-warning hover:bg-white/[0.06] transition-[color,background-color,border-color,box-shadow,opacity,transform,filter]"
                  title="Desafixar"
                  aria-label="Desafixar mensagem"
                >
                  <PinOff size={14} strokeWidth={1.9} />
                </button>
              )}
            </AppearItem>
          ))}
          </AppearList>
        )}
      </div>
    </AnchoredOverlay>
  )
}
