/**
 * InputDeviceMenu — small popover listing the available input devices
 * (microphones). Opens via a chevron button next to the mic button.
 * Renders a portal so it's never clipped by the dock's overflow rules.
 */
import { useEffect, useRef, useState } from 'react'
import { Headphones, Check, AlertTriangle } from 'lucide-react'
import { AnchoredOverlay } from '../../../../../shared/motion/AnchoredOverlay.jsx'

export function InputDeviceMenu({ devices, activeId, onPick }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ bottom: 80, left: 12, maxHeight: 240 })
  const btnRef = useRef(null)
  const popRef = useRef(null)


  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(popRef.current?.offsetWidth || 260, 240)
    const gap = 10
    const left = Math.min(
      Math.max(12, r.left),
      window.innerWidth - width - 12,
    )
    const spaceAbove = r.top - gap
    setPos({
      bottom: window.innerHeight - r.top + gap,
      left,
      maxHeight: Math.max(120, Math.min(spaceAbove - 8, 320)),
    })
  }

  const openPop = () => {
    if (open) {
      setOpen(false)
      return
    }
    place()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    place()
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open, devices.length])

  const noDevices = devices.length === 0

  const node = (
    <AnchoredOverlay
      open={open}
      ref={popRef}
      anchorRef={btnRef}
      onClose={() => setOpen(false)}
      placement="top"
      role="menu"
      aria-label="Selecionar microfone"
      className="
        fixed min-w-[240px] max-w-[min(360px,calc(100vw-24px))]
        rounded-card bg-surface1 border border-line
        shadow-2xl p-1.5 overflow-y-auto

      "
      style={{ bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight }}
    >
      <div className="px-2.5 py-1.5 text-[10.5px] uppercase tracking-wider font-semibold text-muted">
        Microfones
      </div>
      {noDevices && (
        <div className="px-2.5 py-3 flex items-start gap-2 text-[12px] text-ink">
          <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
          <span>Nenhum dispositivo de entrada encontrado.</span>
        </div>
      )}
      {devices.map(d => {
        const isActive = d.deviceId === activeId
        return (
          <button
            key={d.deviceId || 'default'}
            type="button"
            role="menuitemradio"
            aria-checked={isActive}
            onClick={() => { onPick?.(d.deviceId); setOpen(false) }}
            className={[
              'w-full flex items-center gap-2 px-2.5 py-2 rounded-input text-left',
              'transition-colors duration-150',
              isActive ? 'bg-accent/15 text-strong' : 'text-ink hover:bg-surface2',
            ].join(' ')}
          >
            <Headphones size={13} className="text-muted shrink-0" />
            <span className="flex-1 text-[12.5px] truncate">{d.label || 'Microfone padrão'}</span>
            {isActive && <Check size={13} className="text-accent shrink-0" />}
          </button>
        )
      })}
    </AnchoredOverlay>
  )

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPop}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Selecionar microfone"
        title="Selecionar microfone"
        className="
          h-9 w-7 rounded-full -ml-1 mr-0.5 flex items-center justify-center
          text-white/55 hover:text-white hover:bg-white/[0.08]
          transition-colors duration-150
        "
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {node}
    </>
  )
}
