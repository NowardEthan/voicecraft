import { MOTION_DURATION, MOTION_EASING } from './tokens.js'

const OFFSETS = Object.freeze({
  top: Object.freeze({ y: 6 }),
  bottom: Object.freeze({ y: -6 }),
  left: Object.freeze({ x: 6 }),
  right: Object.freeze({ x: -6 }),
  center: Object.freeze({ y: 4 }),
})

/** Pure resolver: restrained travel and a deliberately shorter exit. */
export function resolveOverlayMotion(placement = 'bottom', reducedMotion = false) {
  if (reducedMotion) {
    return Object.freeze({
      initial: Object.freeze({ opacity: 0 }),
      animate: Object.freeze({ opacity: 1, transition: { duration: 0.1 } }),
      exit: Object.freeze({ opacity: 0, transition: { duration: 0.08 } }),
    })
  }
  const offset = OFFSETS[placement] || OFFSETS.bottom
  return Object.freeze({
    initial: Object.freeze({ opacity: 0, scale: 0.98, ...offset }),
    animate: Object.freeze({ opacity: 1, scale: 1, x: 0, y: 0, transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.out } }),
    exit: Object.freeze({ opacity: 0, scale: 0.985, x: (offset.x || 0) / 2, y: (offset.y || 0) / 2, transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.out } }),
  })
}