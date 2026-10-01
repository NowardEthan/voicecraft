/** Canonical motion tokens. JavaScript durations are expressed in seconds. */
export const MOTION_INTENTS = Object.freeze({
  essential: 'essential',
  feedback: 'feedback',
  decorative: 'decorative',
  continuous: 'continuous',
})

export const MOTION_DURATION = Object.freeze({
  instant: 0,
  fast: 0.12,
  base: 0.18,
  slow: 0.22,
})

export const MOTION_EASING = Object.freeze({
  out: Object.freeze([0.16, 1, 0.3, 1]),
  inOut: Object.freeze([0.65, 0, 0.35, 1]),
  emphasized: Object.freeze([0.22, 1, 0.36, 1]),
})

export const MOTION_SPRING = Object.freeze({
  default: Object.freeze({ type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }),
  soft: Object.freeze({ type: 'spring', stiffness: 240, damping: 26, mass: 0.9 }),
  snappy: Object.freeze({ type: 'spring', stiffness: 520, damping: 30, mass: 0.6 }),
  interaction: Object.freeze({ type: 'spring', stiffness: 480, damping: 28, mass: 0.6 }),
})

export const MOTION_TRANSITION = Object.freeze({
  instant: Object.freeze({ duration: MOTION_DURATION.instant }),
  fast: Object.freeze({ duration: MOTION_DURATION.fast, ease: MOTION_EASING.out }),
  base: Object.freeze({ duration: MOTION_DURATION.base, ease: MOTION_EASING.out }),
  slow: Object.freeze({ duration: MOTION_DURATION.slow, ease: MOTION_EASING.out }),
})

export const MOTION_VARIANTS = Object.freeze({
  fadeScale: Object.freeze({
    initial: Object.freeze({ opacity: 0, scale: 0.96, y: 4 }),
    animate: Object.freeze({ opacity: 1, scale: 1, y: 0 }),
    exit: Object.freeze({ opacity: 0, scale: 0.97, y: 2 }),
    transition: MOTION_TRANSITION.slow,
  }),
  fade: Object.freeze({
    initial: Object.freeze({ opacity: 0 }),
    animate: Object.freeze({ opacity: 1 }),
    exit: Object.freeze({ opacity: 0 }),
    transition: MOTION_TRANSITION.base,
  }),
  slideUp: Object.freeze({
    initial: Object.freeze({ opacity: 0, y: 12 }),
    animate: Object.freeze({ opacity: 1, y: 0 }),
    exit: Object.freeze({ opacity: 0, y: 6 }),
    transition: MOTION_TRANSITION.slow,
  }),
  slideRight: Object.freeze({
    initial: Object.freeze({ opacity: 0, x: 18 }),
    animate: Object.freeze({ opacity: 1, x: 0 }),
    exit: Object.freeze({ opacity: 0, x: 10 }),
    transition: MOTION_TRANSITION.slow,
  }),
  slideLeft: Object.freeze({
    initial: Object.freeze({ opacity: 0, x: -18 }),
    animate: Object.freeze({ opacity: 1, x: 0 }),
    exit: Object.freeze({ opacity: 0, x: -10 }),
    transition: MOTION_TRANSITION.slow,
  }),
  pop: Object.freeze({
    initial: Object.freeze({ opacity: 0, scale: 0.7 }),
    animate: Object.freeze({ opacity: 1, scale: 1 }),
    exit: Object.freeze({ opacity: 0, scale: 0.85 }),
    transition: MOTION_SPRING.default,
  }),
  appear: Object.freeze({
    initial: Object.freeze({ opacity: 1, y: 6 }),
    animate: Object.freeze({
      opacity: 1,
      y: 0,
      transition: Object.freeze({ duration: MOTION_DURATION.slow, ease: MOTION_EASING.emphasized }),
    }),
  }),
})

// Backwards-compatible token names.
export const EASE_OUT = MOTION_EASING.out
export const EASE_IN_OUT = MOTION_EASING.inOut
export const EASE_SPRING = MOTION_SPRING.default
export const EASE_SPRING_SOFT = MOTION_SPRING.soft
export const EASE_SPRING_SNAPPY = MOTION_SPRING.snappy
export const DUR = Object.freeze({
  fast: MOTION_DURATION.fast,
  base: MOTION_DURATION.base,
  slow: MOTION_DURATION.slow,
})
