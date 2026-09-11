import { resolveTag } from '../model/userTags'

export function UserTagChips({
  tags = [],
  size = 'sm',
  className = '',
  reorderable = false,
  onReorder,
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

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`.trim()}>
      {list.map((tag, index) => (
        <span
          key={tag.id}
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
            move(from, index)
          }}
          className={[
            'inline-flex items-center rounded-md font-bold uppercase tracking-wider shrink-0 border',
            compact ? 'px-1 py-px text-[8px]' : 'px-1.5 py-0.5 text-[9px]',
            reorderable ? 'cursor-grab active:cursor-grabbing' : '',
          ].join(' ')}
          style={{
            color: tag.color,
            borderColor: hexAlpha(tag.color, 0.45),
            background: hexAlpha(tag.color, 0.12),
          }}
        >
          {tag.label}
        </span>
      ))}
    </span>
  )
}

function hexAlpha(hex, a) {
  const h = String(hex || '#a3a3a3').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return `rgba(163,163,163,${a})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${a})`
}
