import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * useDraggable — manages per-element drag state with corner snap and
 * click/drag discrimination.
 *
 * Usage:
 *   const { getProps, setPos, reset } = useDraggable({ width: 192, height: 108, padding: 16 })
 *   <div {...getProps('self')}> ... </div>
 *
 * - getProps(id) returns onMouseDown handler + style (absolute position).
 * - setPos(id, {x, y}) to programmatically place.
 * - reset(id) to clear stored position (so default position is used again).
 *
 * Click vs drag: only counts as a click if pointer moved < 3px between
 * mousedown and mouseup. The returned onClick handler respects this.
 */
export function useDraggable({ width = 192, height = 108, padding = 16, moveThreshold = 3 } = {}) {
  const [positions, setPositions] = useState({})
  const dragRef = useRef(null)
  const idsRef = useRef(new Set())

  // Listeners once at mount; ref reads fresh values via the closure.
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY
      if (!d.moved && (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold)) {
        d.moved = true
      }
      if (!d.moved) return
      const next = {
        x: d.origX + dx,
        y: d.origY + dy,
      }
      d.currentX = next.x
      d.currentY = next.y
      setPositions((p) => ({ ...p, [d.id]: next }))
    }
    const onUp = () => {
      const d = dragRef.current
      if (!d) return
      if (d.moved) {
        // Snap to the nearest corner.
        setPositions((p) => {
          const cur = p[d.id] || { x: d.currentX, y: d.currentY }
          const W = window.innerWidth
          const H = window.innerHeight
          const left = cur.x + width / 2 < W / 2
          const top = cur.y + height / 2 < H / 2
          return {
            ...p,
            [d.id]: {
              x: left ? padding : W - width - padding,
              y: top ? padding : H - height - padding,
            },
          }
        })
      }
      d.moved = false
      d.id = null
      d.currentX = 0
      d.currentY = 0
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [width, height, padding, moveThreshold])

  const startDrag = useCallback((id, e) => {
    idsRef.current.add(id)
    const cur = positions[id] || defaultPosition(id, width, height, padding)
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: cur.x,
      origY: cur.y,
      currentX: cur.x,
      currentY: cur.y,
      moved: false,
    }
    e.preventDefault()
    e.stopPropagation()
  }, [positions, width, height, padding])

  const setPos = useCallback((id, pos) => {
    setPositions((p) => ({ ...p, [id]: pos }))
  }, [])

  const reset = useCallback((id) => {
    setPositions((p) => {
      const next = { ...p }
      delete next[id]
      return next
    })
  }, [])

  const getProps = useCallback((id) => {
    const pos = positions[id] || defaultPosition(id, width, height, padding)
    return {
      onMouseDown: (e) => startDrag(id, e),
      onClick: (e) => {
        if (dragRef.current && dragRef.current.id === id && dragRef.current.moved) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
      style: {
        position: 'absolute',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        cursor: 'move',
        touchAction: 'none',
      },
    }
  }, [positions, width, height, padding, startDrag])

  return { positions, getProps, setPos, reset, startDrag }
}

function defaultPosition(id, width, height, padding) {
  // Sensible default per id so different PiPs don't stack on top of each other
  // before the user has dragged them.
  const W = typeof window !== 'undefined' ? window.innerWidth : 1280
  const H = typeof window !== 'undefined' ? window.innerHeight : 720
  const defaults = {
    self: { x: W - width - padding, y: H - height - padding },          // bottom-right
    remoteCamera: { x: W - width - padding, y: padding },             // top-right
    remoteScreen: { x: W - width - padding, y: H - height - padding }, // bottom-right
  }
  return defaults[id] || defaults.self
}
