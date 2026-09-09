/**
 * Motion primitives — opinionated wrappers around framer-motion for
 * VoiceCraft's "premium" feel.
 *
 * All primitives respect prefers-reduced-motion (handled by the inner
 * motion components automatically — they read the OS media query).
 *
 * Keep this file small: the goal is a few well-named building blocks, not
 * a comprehensive motion library. Reach for raw `motion.div` when a
 * primitive doesn't fit.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { forwardRef } from 'react'
import { EASE_OUT, EASE_SPRING } from './presets.js'

/** Standard modal/popover entrance. */
const fadeScale = {
  initial: { opacity: 0, scale: 0.96, y: 4 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit:    { opacity: 0, scale: 0.97, y: 2 },
  transition: { duration: 0.22, ease: EASE_OUT },
}

/** Pure fade. */
const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: 0.18, ease: EASE_OUT },
}

/** Slide up from below. */
const slideUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 6 },
  transition: { duration: 0.26, ease: EASE_OUT },
}

/** Slide in from the right. */
const slideRight = {
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: 10 },
  transition: { duration: 0.24, ease: EASE_OUT },
}

/** Slide in from the left. */
const slideLeft = {
  initial: { opacity: 0, x: -18 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -10 },
  transition: { duration: 0.24, ease: EASE_OUT },
}

/** Spring pop — good for selections, checkmarks, achievement feedback. */
const pop = {
  initial: { opacity: 0, scale: 0.7 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.85 },
  transition: EASE_SPRING,
}

/**
 * <FadeScale> — modal/popover entrance.
 * Forwarded ref so parents can attach refs (focus trap, click-outside, etc).
 */
export const FadeScale = forwardRef(function FadeScale({ children, ...rest }, ref) {
  return (
    <motion.div ref={ref} {...fadeScale} {...rest}>
      {children}
    </motion.div>
  )
})

/** <Fade> — pure fade in/out. */
export const Fade = forwardRef(function Fade({ children, ...rest }, ref) {
  return (
    <motion.div ref={ref} {...fade} {...rest}>
      {children}
    </motion.div>
  )
})

/** <SlideUp> — content slides up while fading. */
export const SlideUp = forwardRef(function SlideUp({ children, ...rest }, ref) {
  return (
    <motion.div ref={ref} {...slideUp} {...rest}>
      {children}
    </motion.div>
  )
})

/** <SlideRight> — content slides in from the right. */
export const SlideRight = forwardRef(function SlideRight({ children, ...rest }, ref) {
  return (
    <motion.div ref={ref} {...slideRight} {...rest}>
      {children}
    </motion.div>
  )
})

/** <SlideLeft> — content slides in from the left. */
export const SlideLeft = forwardRef(function SlideLeft({ children, ...rest }, ref) {
  return (
    <motion.div ref={ref} {...slideLeft} {...rest}>
      {children}
    </motion.div>
  )
})

/** <Pop> — spring pop entrance. */
export const Pop = forwardRef(function Pop({ children, ...rest }, ref) {
  return (
    <motion.div ref={ref} {...pop} {...rest}>
      {children}
    </motion.div>
  )
})

/**
 * <MotionButton> — a button with hover + tap micro-interactions baked in.
 *
 *   whileHover={{ scale: 1.02, y: -1 }}
 *   whileTap={{ scale: 0.97 }}
 *
 * Forwards every prop to the underlying <button>. Drop-in replacement
 * for any <button> that should feel "alive".
 */
export function MotionButton({ children, className, ...rest }) {
  return (
    <motion.button
      type={rest.type || 'button'}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 480, damping: 28, mass: 0.6 }}
      className={className}
      {...rest}
    >
      {children}
    </motion.button>
  )
}

/**
 * <MotionCard> — a div with hover lift. Use for clickable cards.
 */
export function MotionCard({ children, className, hoverable = true, ...rest }) {
  return (
    <motion.div
      whileHover={hoverable ? { y: -2, scale: 1.005 } : undefined}
      whileTap={hoverable ? { scale: 0.99 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.7 }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Re-export AnimatePresence so consumers can import from one place. */
export { AnimatePresence, motion }
