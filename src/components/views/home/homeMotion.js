/** Shared motion presets for personal home — visible throughout (no black fade). */
import { APPEAR_EASE } from '../../../shared/motion/Appear'

export const easeOut = APPEAR_EASE

export const pageVariants = {
  initial: { opacity: 1, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: easeOut, staggerChildren: 0.04 },
  },
  exit: { opacity: 1, y: -4, transition: { duration: 0.14 } },
}

export const sectionVariants = {
  initial: { opacity: 1, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: easeOut },
  },
}

export const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.02,
    y: -2,
    transition: { duration: 0.22, ease: easeOut },
  },
}

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
}

export const staggerItem = {
  initial: { opacity: 1, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: easeOut },
  },
}
