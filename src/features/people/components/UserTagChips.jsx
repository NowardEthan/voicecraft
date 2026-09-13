import { useLayoutEffect, useRef, useState } from 'react'
import { resolveTag } from '../model/userTags'

function contrastOn(hex) {
  const h = String(hex || '#888').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return '#0b0b0f'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return lum > 0.62 ? '#0b0b0f' : '#ffffff'
}

function TagChip({ tag, compact, reorderable, index, onMove }) {
  return (
    <span
      title={reorderable ? `Arraste para reordenar · ${tag.hint || tag.label}` : (tag.hint || tag.label)}
      draggable={reorderable}
      onDragStart={(e) => {
        if (!reorderable) return
        e.dataTransfer.setData('text/plain', String(index))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(e) => {
        if (!reorderable) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        if (!reorderable) return
        e.preventDefault()
        const from = Number(e.dataTransfer.getData('text/plain'))
        if (!Number.isFinite(from)) return
        onMove?.(from, index)
      }}
      className={[
        'inline-flex items-center justify-center rounded-md font-bold uppercase tracking-wider shrink-0 whitespace-nowrap leading-none',
        compact ? 'h-5 px-1.5 text-[8.5px]' : 'h-[22px] px-2 text-[9.5px]',
        reorderable ? 'cursor-grab active:cursor-grabbing' : '',
      ].join(' ')}
      style={{
        color: contrastOn(tag.color),
        background: tag.color,
      }}
    >
      {tag.label}
    </span>
  )
}

/**
 * Horizontal infinite marquee when chips overflow a single line.
 * Keeps a fixed height so parent cards don't grow with tag count.
 */
function TagMarquee({ list, compact, className = '' }) {
  const viewportRef = useRef(null)
  const measureRef = useRef(null)
  const [run, setRun] = useState(false)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const measure = measureRef.current
    if (!viewport || !measure) return undefined

    const check = () => {
      setRun(measure.scrollWidth > viewport.clientWidth + 1)
    }
    check()
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(check)
      : null
    ro?.observe(viewport)
    window.addEventListener('resize', check)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', check)
    }
  }, [list])

  const chips = (dup) => list.map((tag) => (
    <TagChip key={`${dup}-${tag.id}`} tag={tag} compact={compact} />
  ))

  return (
    <span
      ref={viewportRef}
      className={`vc-tag-marquee ${compact ? 'vc-tag-marquee--xs' : ''} ${className}`.trim()}
    >
      {/* Hidden measure set (single copy) for overflow detection */}
      <span ref={measureRef} className="vc-tag-marquee__measure" aria-hidden>
        {chips('m')}
      </span>
      <span className={`vc-tag-marquee__track ${run ? 'vc-tag-marquee__track--run' : ''}`}>
        <span className="vc-tag-marquee__set">{chips('a')}</span>
        {run && (
          <span className="vc-tag-marquee__set" aria-hidden>{chips('b')}</span>
        )}
      </span>
    </span>
  )
}

export function UserTagChips({
  tags = [],
  size = 'sm',
  className = '',
  reorderable = false,
  onReorder,
  marquee = false,
}) {
  const list = (tags || []).map(resolveTag).filter(Boolean)
  if (list.length === 0) return null
  const compact = size === 'xs'

  const move = (from, to) => {
    if (!onReorder || from === to || from < 0 || to < 0 || to >= list.length) return
    const next = [...list]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onReorder(next.map((t) => t.id))
  }

  if (marquee) {
    return <TagMarquee list={list} compact={compact} className={className} />
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`.trim()}>
      {list.map((tag, index) => (
        <TagChip
          key={tag.id}
          tag={tag}
          compact={compact}
          reorderable={reorderable}
          index={index}
          onMove={move}
        />
      ))}
    </span>
  )
}
