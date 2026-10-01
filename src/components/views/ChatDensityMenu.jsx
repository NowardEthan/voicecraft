/** Conversation density picker, usable standalone or inside the progressive More menu. */
import { useLayoutEffect, useRef, useState } from 'react'
import { AlignJustify, Check, Rows2, Rows3, StretchHorizontal } from 'lucide-react'
import { CHAT_DENSITIES, CHAT_DENSITY_ORDER, normalizeChatDensity } from './chatDensity'
import { AnchoredOverlay } from '../../shared/motion/AnchoredOverlay.jsx'

const DENSITY_ICONS = { compacto: AlignJustify, confortavel: Rows3, espacado: StretchHorizontal }

export default function ChatDensityMenu({ value, onChange, embedded = false, onSelect }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const current = normalizeChatDensity(value)
  const CurrentIcon = DENSITY_ICONS[current] || Rows2

  useLayoutEffect(() => {
    if (embedded || !open) { setPos(null); return undefined }
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const width = Math.min(280, window.innerWidth - 16)
      setPos({ top: Math.min(r.bottom + 8, window.innerHeight - 250), left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [embedded, open])

  const options = (
    <div className="vc-conversation-density-options" aria-label="Densidade das mensagens">
      {CHAT_DENSITY_ORDER.map((key) => {
        const item = CHAT_DENSITIES[key]
        const Icon = DENSITY_ICONS[key] || Rows3
        const selected = current === key
        return (
          <button key={key} type="button" role="menuitemradio" aria-checked={selected} className={selected ? 'is-active' : ''} onClick={() => { onChange?.(key); onSelect?.(key); if (!embedded) setOpen(false) }}>
            <span className="vc-conversation-menu__icon"><Icon size={16} /></span>
            <span className="vc-conversation-menu__copy"><strong>{item.label}</strong><small>{item.hint}</small></span>
            {selected && <Check size={15} className="vc-conversation-menu__check" />}
          </button>
        )
      })}
    </div>
  )

  if (embedded) return options

  return (
    <div className="relative shrink-0" data-density-menu>
      <button ref={btnRef} type="button" onClick={() => setOpen((value) => !value)} className={`vc-icon-btn${open ? ' is-active' : ''}`} title={`Densidade: ${CHAT_DENSITIES[current].label}`} aria-label="Densidade das mensagens" aria-haspopup="menu" aria-expanded={open}>
        <CurrentIcon size={17} />
      </button>
      <AnchoredOverlay
        open={open && !!pos}
        anchorRef={btnRef}
        placement="top"
        role="menu"
        onClose={() => setOpen(false)}
        initialFocus={'[aria-checked="true"]'}
        data-density-menu
        className="vc-conversation-popover fixed"
        style={pos || undefined}
      >
        <p className="vc-conversation-menu__eyebrow">Densidade</p>{options}
      </AnchoredOverlay>
    </div>
  )
}