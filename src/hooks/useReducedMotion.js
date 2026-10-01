/** useReducedMotion — backwards-compatible access to the canonical policy. */
import { useMotionPolicy } from '../shared/motion/MotionPolicyProvider.jsx'

export default function useReducedMotion() {
  return useMotionPolicy().reducedMotion
}
