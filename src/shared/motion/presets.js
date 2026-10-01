/** Backwards-compatible exports over the canonical motion token set. */
import { useMotionPolicy } from './MotionPolicyProvider.jsx'
import {
  EASE_OUT,
  EASE_IN_OUT,
  EASE_SPRING,
  EASE_SPRING_SOFT,
  EASE_SPRING_SNAPPY,
  DUR,
} from './tokens.js'

export {
  EASE_OUT,
  EASE_IN_OUT,
  EASE_SPRING,
  EASE_SPRING_SOFT,
  EASE_SPRING_SNAPPY,
  DUR,
}

/**
 * Legacy hook. New code should use useMotionPolicy/useMotionIntent directly.
 * `reduce` retains its OS-preference meaning; `disabled` includes visibility.
 */
export function useMotionTokens() {
  const policy = useMotionPolicy()
  const disabled = policy.reducedMotion || !policy.allowFeedback
  if (disabled) {
    return {
      reduce: policy.reducedMotion,
      disabled: true,
      policy,
      dur: { fast: 0, base: 0, slow: 0 },
      ease: EASE_OUT,
      spring: { type: 'spring', stiffness: 1000, damping: 100, mass: 0.1 },
    }
  }
  return {
    reduce: false,
    disabled: false,
    policy,
    dur: DUR,
    ease: EASE_OUT,
    spring: EASE_SPRING,
  }
}