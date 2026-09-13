/**
 * VoiceMoreMenu — glass popover for secondary call actions.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Link2, Settings, PhoneOff, Check } from 'lucide-react'
import { flashToast } from '../../../../../shared/utils/toast'
import { buildSpaceInviteUrl } from '../../../../spaces/model/spaceInvite'

export function VoiceMoreMenu({ space, room, onOpenSettings, onLeave }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [copied, setCopied] = useState(false)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return
      if (btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = 220
    setPos({
      top: r.bottom + 8,
      left: Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8),
    })
    setOpen(true)
    setCopied(false)
  }

  const copyInvite = async () => {
    if (!space?.id) return
    const url = buildSpaceInviteUrl({ spaceId: space.id, roomId: room?.id || null })
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      flashToast('Link de convite copiado')
      setTimeout(() => setOpen(false), 600)
    } catch {
      flashToast('Não deu pra copiar o link')
    }
  }

  const node = open ? (
    <div
      ref={popRef}
      role="menu"
      aria-label="Mais ações da call"
      className="
        fixed z-50 w-[220px] p-1.5 rounded-2xl
        bg-black/70 backdrop-blur-xl
        shadow-[0_20px_44px_-16px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)]
        animate-fade-in
      "
      style={{ top: pos.top, left: pos.left }}
    >
      <MenuItem
        icon={copied ? Check : Link2}
        label={copied ? 'Link copiado' : 'Copiar link da sala'}
        onClick={copyInvite}
        tone={copied ? 'positive' : 'default'}
      />
      {onOpenSettings && (
        <MenuItem
          icon={Settings}
          label="Configurações"
          onClick={() => {
            setOpen(false)
            onOpenSettings()
          }}
        />
      )}
      {onLeave && (
        <>
          <div className="h-px bg-white/[0.08] my-1 mx-1" aria-hidden />
          <MenuItem
            icon={PhoneOff}
            label="Sair da call"
            onClick={() => {
              setOpen(false)
              onLeave()
            }}
            tone="danger"
          />
        </>
      )}
    </div>
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais ações"
        title="Mais ações"
        className="
          w-9 h-9 rounded-full
          bg-black/35 hover:bg-black/50 backdrop-blur-md
          text-white/80 hover:text-white
          shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]
          inline-flex items-center justify-center
          transition-[background-color,color,transform] duration-150
          hover:scale-[1.03] active:scale-[0.97]
        "
      >
        <MoreHorizontal size={15} strokeWidth={1.9} />
      </button>
      {typeof document !== 'undefined' && createPortal(node, document.body)}
    </>
  )
}

function MenuItem({ icon: Icon, label, onClick, tone = 'default' }) {
  const toneClass = tone === 'danger'
    ? 'text-danger hover:bg-danger/15'
    : tone === 'positive'
      ? 'text-positive hover:bg-white/[0.06]'
      : 'text-white/90 hover:bg-white/[0.08] hover:text-white'

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        'w-full flex items-center gap-2.5 px-2.5 h-9 rounded-xl text-left',
        'text-[12.5px] font-medium transition-colors duration-150',
        toneClass,
      ].join(' ')}
    >
      <Icon size={14} strokeWidth={1.9} className="shrink-0 opacity-90" />
      <span className="truncate">{label}</span>
    </button>
  )
}
