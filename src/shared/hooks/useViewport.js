import { useEffect, useState } from 'react'

/**
 * Viewport breakpoints — single source of truth for shell chrome.
 * Aligns with docs/DESIGN_SYSTEM.md §3.2 (with overlay thresholds that
 * keep the main column usable on Electron portrait windows).
 *
 * | Token            | Width | Behavior                          |
 * |------------------|-------|-----------------------------------|
 * | MOBILE_AT        | <768  | Phone: compact rail, tight UI     |
 * | COMPACT_RAIL_AT  | <900  | Slim rail while panels overlay    |
 * | NAV_OVERLAY_AT   | <1100 | Space panel → drawer              |
 * | PEOPLE_OVERLAY_AT| <1280 | People / voice sidebar → drawer   |
 */
export const MOBILE_AT = 768
export const COMPACT_RAIL_AT = 900
export const NAV_OVERLAY_AT = 1100
export const PEOPLE_OVERLAY_AT = 1280

function read() {
  if (typeof window === 'undefined') {
    return {
      width: 1440,
      height: 900,
      isMobile: false,
      compactRail: false,
      overlayNav: false,
      overlayPeople: false,
    }
  }
  const width = window.innerWidth
  const height = window.innerHeight
  return {
    width,
    height,
    isMobile: width < MOBILE_AT,
    compactRail: width < COMPACT_RAIL_AT,
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
