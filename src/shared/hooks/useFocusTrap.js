/**
 * useFocusTrap — minimal focus trap for modals/popovers.
 *
 * Mounts a wrapper ref and, while active, focuses the first focusable
 * child on mount, keeps Tab/Shift+Tab cycling inside, and restores focus
 * to the previously-focused element on unmount.
 *
 * Escape handling is NOT included here — that's a separate concern (some
 * callers want Escape, others use a close button only). Pair with a
 * keydown listener in the host component.
 *
 * Usage:
 *   const ref = useFocusTrap({ active: open })
 *   return <div ref={ref}>...</div>
 */
import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(root) {
  if (!root) return []
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null,
  )
}

export default function useFocusTrap({ active = true } = {}) {
  const ref = useRef(null)
  const lastFocusedRef = useRef(null)

  useEffect(() => {
    if (!active) return
    lastFocusedRef.current = typeof document !== 'undefined'
      ? document.activeElement
      : null

    // Initial focus: first focusable, or the wrapper itself.
    const t = setTimeout(() => {
      const focusables = getFocusable(ref.current)
      if (focusables.length > 0) {
        focusables[0].focus()
      } else if (ref.current) {
        ref.current.setAttribute('tabindex', '-1')
        ref.current.focus()
      }
    }, 0)

    const onKey = (e) => {
      if (e.key !== 'Tab') return
      const focusables = getFocusable(ref.current)
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const current = document.activeElement
      if (e.shiftKey) {
        if (current === first || !ref.current.contains(current)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (current === last || !ref.current.contains(current)) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      // Restore focus to whatever opened the trap.
      if (lastFocusedRef.current && typeof lastFocusedRef.current.focus === 'function') {
        try { lastFocusedRef.current.focus() } catch {}
      }
    }
  }, [active])

  return ref
}
