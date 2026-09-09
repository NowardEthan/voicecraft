/**
 * useReducedMotion — observes the OS/browser `prefers-reduced-motion`
 * setting and returns a boolean the component can use to gate its
 * decorative animations (speaking pulse, ripple, shimmer, etc).
 *
 * Implementation: matchMedia listener so the UI updates live when the user
 * changes the OS setting while the app is open.
 */
import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export default function useReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(QUERY)
    const handler = (e) => setReduced(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler) // Safari < 14 fallback
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])

  return reduced
}
