/**
 * InviteModal — share a pretty invite link + code + ready-to-send message.
 *
 * Links use the public app origin (voicecraft.app / VITE_PUBLIC_APP_URL),
 * never localhost — so what you copy looks shareable even in local Electron.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Check, Link as LinkIcon, Hash, MessageSquareText } from 'lucide-react'
import { ModalShell } from '../../shared/motion/ModalShell.jsx'
import {
  buildInviteShareText,
  buildSpaceInviteUrl,
  formatInviteCode,
} from '../../features/spaces/model/spaceInvite'
import SpaceAvatar from '../SpaceAvatar'
import { flashToast } from '../../shared/utils/toast'

async function copyText(text) {
  if (!text) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function InviteModal({
  open,
  space,
  room = null,
  onClose,
}) {
  const [copied, setCopied] = useState(null) // 'link' | 'code' | 'message' | null
  const inputRef = useRef(null)
  const copyTimeoutRef = useRef(null)

  const url = useMemo(() => {
    if (!space?.id) return ''
    return buildSpaceInviteUrl({ spaceId: space.id, roomId: room?.id || null })
  }, [space, room])

  const code = useMemo(
    () => (space?.id ? formatInviteCode(space.id) : ''),
    [space],
  )

  const shareText = useMemo(
    () => buildInviteShareText({
      spaceName: space?.name,
      roomName: room?.name || null,
      url,
      code,
    }),
    [space?.name, room?.name, url, code],
  )

  useEffect(() => {
    if (!open) return undefined
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [open])

  useEffect(() => {
    if (!open) setCopied(null)
  }, [open])

  const markCopied = (kind) => {
    setCopied(kind)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(null), 1600)
  }

  const handleCopyLink = async () => {
    const ok = await copyText(url)
    if (ok) {
      markCopied('link')
      flashToast('Link de convite copiado')
    } else {
      inputRef.current?.select()
      flashToast('Não deu para copiar — selecione o link e use Ctrl+C')
    }
  }

  const handleCopyCode = async () => {
    const raw = space?.id || ''
    const ok = await copyText(raw)
    if (ok) {
      markCopied('code')
      flashToast('Código copiado')
    }
  }

  const handleCopyMessage = async () => {
    const ok = await copyText(shareText)
    if (ok) {
      markCopied('message')
      flashToast('Mensagem de convite copiada')
    }
  }

  if (!open || !space) return null

  const accent = space.color || 'var(--space-accent)'

  return (
    <ModalShell
      open={open && !!space}
      onClose={onClose}
      labelledBy="invite-title"
      maxWidth="md"
      panelClassName="rounded-[20px]"
    >
      <div className="rounded-[20px] overflow-hidden bg-[#15171c] border border-white/[0.1] shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-white/[0.08]">
          <div className="flex items-start gap-3 min-w-0">
            <SpaceAvatar space={space} size={44} rounded="xl" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <LinkIcon size={14} style={{ color: accent }} strokeWidth={2} />
                <h2 id="invite-title" className="text-[17px] font-semibold text-strong tracking-tight truncate">
                  Convidar pro Space
                </h2>
              </div>
              <p className="text-[12.5px] text-muted leading-snug">
                {room
                  ? <>Sala <span className="text-ink">#{room.name}</span> em <span className="text-ink">{space.name}</span></>
                  : <>Entre em <span className="text-ink">{space.name}</span> com um link ou código</>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-muted hover:text-strong transition-colors shrink-0"
          >
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-[0.08em] mb-1.5">
              Link de convite
            </label>
            <div className="flex items-stretch gap-2">
              <input
                ref={inputRef}
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-ink focus:outline-none focus:border-accent/40 transition-colors"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={[
                  'px-3.5 py-2.5 rounded-xl font-semibold text-[12.5px] inline-flex items-center gap-1.5 shrink-0 transition-all',
                  copied === 'link'
                    ? 'bg-positive/15 text-positive border border-positive/30'
                    : 'text-white border border-transparent',
                ].join(' ')}
                style={copied === 'link' ? undefined : { background: accent }}
              >
                {copied === 'link' ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2} />}
                {copied === 'link' ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-muted leading-snug">
              Formato curto · quem abrir entra no Space{room ? ` e cai em #${room.name}` : ''}.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">
                <Hash size={12} />
                Código
              </div>
              <p className="font-mono text-[13.5px] text-strong tracking-wide break-all mb-3">
                {code}
              </p>
              <button
                type="button"
                onClick={handleCopyCode}
                className="w-full h-9 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-strong transition-colors"
              >
                {copied === 'code' ? <Check size={13} className="text-positive" /> : <Copy size={13} />}
                {copied === 'code' ? 'Código copiado' : 'Copiar código'}
              </button>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-2">
                <MessageSquareText size={12} />
                Mensagem pronta
              </div>
              <p className="text-[12px] text-muted line-clamp-3 leading-snug mb-3 whitespace-pre-wrap">
                {shareText}
              </p>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="w-full h-9 rounded-lg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-strong transition-colors"
              >
                {copied === 'message' ? <Check size={13} className="text-positive" /> : <Copy size={13} />}
                {copied === 'message' ? 'Mensagem copiada' : 'Copiar mensagem'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
