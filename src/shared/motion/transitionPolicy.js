import { MOTION_DURATION, MOTION_EASING } from './tokens.js'

export function resolveViewTransition(active, reducedMotion = false, offset = 5) {
  if (reducedMotion) return {
    target: { opacity: active ? 1 : 0 },
    transition: { duration: active ? 0.1 : 0.08 },
  }
  return {
    target: { opacity: active ? 1 : 0, y: active ? 0 : Math.max(0, offset) },
    transition: { duration: active ? MOTION_DURATION.base : MOTION_DURATION.fast, ease: MOTION_EASING.emphasized },
  }
}

export function resolveDrawerTransition(side = 'right', reducedMotion = false) {
  if (reducedMotion) return {
    initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.08 },
  }
  const direction = side === 'left' ? -1 : 1
  return {
    initial: { opacity: 0, x: direction * 18 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: direction * 12 },
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.out },
  }
}

export function resolveTabTransition(reducedMotion = false) {
  if (reducedMotion) return {
    initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 },
  }
  return {
    initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -2 },
    transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.out },
  }
}

export function resolveDisclosureTransition(reducedMotion = false) {
  return reducedMotion ? { duration: 0 } : { duration: MOTION_DURATION.base, ease: MOTION_EASING.emphasized }
}