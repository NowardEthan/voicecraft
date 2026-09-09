/**
 * Identity color: swatch row + a "Cor personalizada" popover
 * (SV pad, vertical hue, hex, eyedropper, Cancelar / Aplicar).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pipette, Wand2 } from 'lucide-react'
import { relativeLuminance, spaceTokens } from '../model/spaceTokens'

export const PALETTE = [
  { id: 'pink',     name: 'Rosa',       css: '#ff3f6c' },
  { id: 'orange',   name: 'Laranja',    css: '#E67E22' },
  { id: 'amber',    name: 'Âmbar',      css: '#F1C40F' },
  { id: 'salmon',   name: 'Salmão',     css: '#E8A598' },
  { id: 'magenta',  name: 'Magenta',    css: '#D81B60' },
  { id: 'violet',   name: 'Violeta',    css: '#8E44AD' },
  { id: 'purple',   name: 'Roxo',       css: '#6C3483' },
  { id: 'indigo',   name: 'Índigo',     css: '#5865F2' },
  { id: 'teal',     name: 'Turquesa',   css: '#16A085' },
  { id: 'charcoal', name: 'Carvão',     css: '#3D4148' },
]

export function normalizeHex(hex, fallback = PALETTE[0].css) {
  if (!hex || typeof hex !== 'string') return fallback
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/)
  return m ? `#${m[1].toLowerCase()}` : fallback
}

export function paletteColorFor(hex) {
  const css = normalizeHex(hex)
  return PALETTE.find(p => p.css.toLowerCase() === css) || { id: 'custom', name: 'Personalizada', css }
}

function hexToHsv(hex) {
  const h = normalizeHex(hex).slice(1)
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let hue = 0
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6
    else if (max === g) hue = (b - r) / d + 2
    else hue = (r - g) / d + 4
    hue *= 60
    if (hue < 0) hue += 360
  }
  const s = max === 0 ? 0 : d / max
  return { h: hue, s, v: max }
}

function hsvToHex(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function ColorIdentityPicker({
  value,
  onChange,
  open,
  onOpenChange,
  heading = 'Cor de identidade',
}) {
  const hex = normalizeHex(value)
  const named = paletteColorFor(hex)
  const customBtnRef = useRef(null)
  const baselineRef = useRef(hex)

  return (
    <div className="min-w-0">
      {heading ? (
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1.5">
          {heading}
        </p>
      ) : null}
      <div className="flex items-center gap-2 mb-2.5">
        <span
          className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/20"
          style={{ backgroundColor: hex }}
          aria-hidden
        />
        <p className="text-[13px] text-strong truncate">
          {named.name} <span className="text-muted">• {hex}</span>
        </p>
      </div>
      <button
        ref={customBtnRef}
        type="button"
        onClick={() => {
          if (!open) baselineRef.current = hex
          onOpenChange?.(!open)
        }}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-strong border border-white/[0.08] transition-colors mb-2.5"
      >
        <Wand2 size={13} />
        Cor personalizada
      </button>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cores prontas">
        {PALETTE.map(p => {
          const selected = p.css.toLowerCase() === hex
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={p.name}
              title={p.name}
              onClick={() => {
                onOpenChange?.(false)
                onChange?.(p.css)
              }}
              className={[
                'relative w-6 h-6 rounded-full transition-transform',
                selected ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#14161b]' : 'hover:scale-105',
              ].join(' ')}
              style={{ backgroundColor: p.css }}
            >
              {selected && (
                <Check
                  size={11}
                  className={`absolute inset-0 m-auto ${relativeLuminance(p.css) > 0.36 ? 'text-[#1a1a1e]' : 'text-white'}`}
                  strokeWidth={2.6}
                />
              )}
            </button>
          )
        })}
      </div>
      {open && (
        <CustomColorPopover
          value={hex}
          anchorRef={customBtnRef}
          onPreview={onChange}
          onApply={() => onOpenChange?.(false)}
          onCancel={() => {
            onChange?.(baselineRef.current)
            onOpenChange?.(false)
          }}
        />
      )}
    </div>
  )
}

function CustomColorPopover({ value, anchorRef, onPreview, onApply, onCancel }) {
  const [draft, setDraft] = useState(() => normalizeHex(value))
  const [hexText, setHexText] = useState(() => normalizeHex(value))
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'right' })
  const panelRef = useRef(null)
  const hsv = hexToHsv(draft)

  const paint = (hex) => {
    const next = normalizeHex(hex)
    setDraft(next)
    setHexText(next)
    onPreview?.(next)
  }

  useEffect(() => {
    setDraft(normalizeHex(value))
    setHexText(normalizeHex(value))
  }, [value])

  useLayoutEffect(() => {
    if (!anchorRef?.current) return
    const compute = () => {
      const anchor = anchorRef.current.getBoundingClientRect()
      const panelW = 268
      const panelH = 268
      const margin = 12
      let left = anchor.right + margin
      let placement = 'right'
      if (left + panelW > window.innerWidth - 12) {
        left = Math.max(12, anchor.left - panelW - margin)
        placement = 'left'
      }
      let top = anchor.top - 8
      if (top + panelH > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - panelH - 12)
      }
      setPos({ top, left, placement })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [anchorRef])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  useEffect(() => {
    const onClick = (e) => {
      if (panelRef.current?.contains(e.target)) return
      if (anchorRef?.current?.contains(e.target)) return
      onCancel()
    }
    const t = setTimeout(() => window.addEventListener('mousedown', onClick), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onCancel, anchorRef])

  const commitHsv = (next) => {
    paint(hsvToHex(next.h, next.s, next.v))
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Cor personalizada"
      className="fixed z-[80] w-[268px] rounded-2xl border border-white/[0.10] bg-[#1a1c22]/95 backdrop-blur-xl shadow-[0_20px_50px_-16px_rgba(0,0,0,0.7)] p-3"
      style={{ top: pos.top, left: pos.left, ...spaceTokens({ color: draft }) }}
    >
      <div className="flex gap-2.5">
        <SvPad hsv={hsv} onChange={commitHsv} />
        <HueSlider hsv={hsv} onChange={commitHsv} />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <span
          className="w-7 h-7 rounded-md shrink-0 border border-white/15"
          style={{ backgroundColor: draft }}
          aria-hidden
        />
        <input
          type="text"
          value={hexText}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.trim()
            setHexText(next.startsWith('#') ? next : `#${next}`)
            if (/^#[0-9a-fA-F]{6}$/.test(next) || /^#[0-9a-fA-F]{6}$/.test(`#${next}`)) {
              paint(normalizeHex(next))
            }
          }}
          className="flex-1 min-w-0 h-8 px-2 rounded-lg bg-[#0d0e12] border border-white/[0.08] text-[12px] font-mono text-strong focus:outline-none focus:border-accent/50"
          aria-label="Hexadecimal"
        />
        <label
          className="w-8 h-8 rounded-lg border border-white/[0.08] bg-[#0d0e12] hover:bg-white/[0.05] flex items-center justify-center text-muted hover:text-strong cursor-pointer shrink-0"
          title="Conta-gotas"
        >
          <Pipette size={13} />
          <input
            type="color"
            value={draft}
            onChange={(e) => paint(e.target.value)}
            className="sr-only"
            aria-label="Abrir seletor de cor"
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 px-3 rounded-lg text-[12px] font-medium text-ink bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onApply(draft)}
          className="h-8 px-3.5 rounded-lg text-[12px] font-semibold bg-accent text-on-accent hover:bg-accent/90 transition-colors"
        >
          Aplicar
        </button>
      </div>
    </div>,
    document.body,
  )
}

function HueSlider({ hsv, onChange }) {
  const trackRef = useRef(null)
  const dragging = useRef(false)

  const pick = (e) => {
    const rect = trackRef.current.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    onChange?.({ ...hsv, h: t * 360 })
  }

  return (
    <div
      ref={trackRef}
      className="relative w-3.5 shrink-0 rounded-full overflow-hidden cursor-ns-resize border border-white/10"
      style={{
        background: 'linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
      }}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e) }}
      onPointerMove={(e) => { if (dragging.current) pick(e) }}
      onPointerUp={() => { dragging.current = false }}
    >
      <span
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow pointer-events-none"
        style={{ top: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }}
      />
    </div>
  )
}

function SvPad({ hsv, onChange }) {
  const padRef = useRef(null)
  const dragging = useRef(false)

  const pick = (e) => {
    const rect = padRef.current.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const v = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height))
    onChange?.({ ...hsv, s, v })
  }

  return (
    <div
      ref={padRef}
      className="relative flex-1 h-[148px] rounded-xl overflow-hidden cursor-crosshair border border-white/[0.08]"
      style={{
        background: `
          linear-gradient(to top, #000, transparent),
          linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))
        `,
      }}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e) }}
      onPointerMove={(e) => { if (dragging.current) pick(e) }}
      onPointerUp={() => { dragging.current = false }}
    >
      <span
        className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
      />
    </div>
  )
}
