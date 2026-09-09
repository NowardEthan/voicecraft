import { useEffect, useState } from 'react'

/** Left space panel overlays instead of eating the main column. */
export const NAV_OVERLAY_AT = 1100
/** Activity / people panel overlays. */
export const PEOPLE_OVERLAY_AT = 1280
/** Phone / small tablet. */
export const MOBILE_AT = 768

function read() {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900, isMobile: false, overlayNav: false, overlayPeople: false }
  }
  const width = window.innerWidth
  const height = window.innerHeight
  return {
    width,
    height,
    isMobile: width < MOBILE_AT,
    overlayNav: width < NAV_OVERLAY_AT,
    overlayPeople: width < PEOPLE_OVERLAY_AT,
  }
}

export function useViewport() {
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const onResize = () => setVp(read())
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return vp
}
