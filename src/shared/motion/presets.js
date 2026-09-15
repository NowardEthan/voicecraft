/**
 * motion/presets.js — shared animation tokens and easings.
 *
 * Centralised so any change to the "feel" of the app animates consistently.
 * Values intentionally tighter than typical defaults (150–300ms) to feel
 * snappy; spring physics carries the organic part.
 */
import { useReducedMotion } from 'framer-motion'

// Curated easings — used for both CSS and framer-motion.
export const EASE_OUT = [0.16, 1, 0.3, 1]      // smooth deceleration (default)
export const EASE_IN_OUT = [0.65, 0, 0.35, 1]  // symmetric
export const EASE_SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 }
export const EASE_SPRING_SOFT = { type: 'spring', stiffness: 240, damping: 26, mass: 0.9 }
export const EASE_SPRING_SNAPPY = { type: 'spring', stiffness: 520, damping: 30, mass: 0.6 }

// Common durations (seconds — framer-motion uses s, CSS uses ms).
export const DUR = {
  fast: 0.12,
  base: 0.18,
  slow: 0.22,
}

/**
 * useMotionTokens — returns motion-safe versions of the easings.
 * When prefers-reduced-motion is set, we return instant transitions.
 */
export function useMotionTokens() {
  const reduce = useReducedMotion()
  if (reduce) {
    return {
      reduce: true,
      dur: { fast: 0, base: 0, slow: 0 },
      ease: EASE_OUT,
      spring: { type: 'spring', stiffness: 1000, damping: 100, mass: 0.1 },
    }
  }
  return {
    reduce: false,
    dur: DUR,
    ease: EASE_OUT,
    spring: EASE_SPRING,
  }
}
