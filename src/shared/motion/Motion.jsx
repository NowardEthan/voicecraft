/** Intent-aware motion primitives with backwards-compatible component exports. */
import { motion, AnimatePresence } from 'framer-motion'
import { forwardRef } from 'react'
import { MOTION_INTENTS, MOTION_SPRING, MOTION_TRANSITION, MOTION_VARIANTS } from './tokens.js'
import { useMotionIntent } from './MotionPolicyProvider.jsx'

function withoutEmbeddedTransition(target) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) return target
  const { transition: _transition, transitionEnd: _transitionEnd, ...staticTarget } = target
  return staticTarget
}

function resolveStaticTarget(target, variants, fallback) {
  if (target && typeof target === 'object' && !Array.isArray(target)) {
    return withoutEmbeddedTransition(target)
  }
  if (typeof target === 'string' && variants?.[target]) {
    return withoutEmbeddedTransition(variants[target])
  }
  return withoutEmbeddedTransition(fallback)
}

/**
 * Generic safe primitive. A blocked intent renders its final state immediately
 * and removes exit and gesture animation without hiding its content.
 */
export const IntentMotion = forwardRef(function IntentMotion({
  as: Comp = motion.div,
  intent = MOTION_INTENTS.feedback,
  preset,
  initial,
  animate,
  exit,
  transition,
  variants,
  whileHover,
  whileTap,
  whileFocus,
  whileDrag,
  children,
  ...rest
}, ref) {
  const { enabled } = useMotionIntent(intent)
  const defaults = preset || {}
  const activeAnimate = animate ?? defaults.animate
  const activeVariants = variants ?? defaults.variants
  const safeProps = enabled
    ? {
        initial: initial ?? defaults.initial,
        animate: activeAnimate,
        exit: exit ?? defaults.exit,
        transition: transition ?? defaults.transition,
        variants: activeVariants,
        whileHover,
        whileTap,
        whileFocus,
        whileDrag,
      }
    : {
        initial: false,
        animate: resolveStaticTarget(activeAnimate, activeVariants, defaults.animate),
        exit: undefined,
        transition: MOTION_TRANSITION.instant,
        variants: undefined,
        whileHover: undefined,
        whileTap: undefined,
        whileFocus: undefined,
        whileDrag: undefined,
      }

  return (
    <Comp ref={ref} {...rest} data-motion-intent={intent} {...safeProps}>
      {children}
    </Comp>
  )
})

function createPresetPrimitive(displayName, preset) {
  const Primitive = forwardRef(function MotionPresetPrimitive({ children, ...props }, ref) {
    return <IntentMotion ref={ref} preset={preset} {...props}>{children}</IntentMotion>
  })
  Primitive.displayName = displayName
  return Primitive
}

export const FadeScale = createPresetPrimitive('FadeScale', MOTION_VARIANTS.fadeScale)
export const Fade = createPresetPrimitive('Fade', MOTION_VARIANTS.fade)
export const SlideUp = createPresetPrimitive('SlideUp', MOTION_VARIANTS.slideUp)
export const SlideRight = createPresetPrimitive('SlideRight', MOTION_VARIANTS.slideRight)
export const SlideLeft = createPresetPrimitive('SlideLeft', MOTION_VARIANTS.slideLeft)
export const Pop = createPresetPrimitive('Pop', MOTION_VARIANTS.pop)

export const MotionButton = forwardRef(function MotionButton({
  children,
  className,
  type = 'button',
  intent = MOTION_INTENTS.feedback,
  whileHover,
  whileTap,
  transition,
  ...rest
}, ref) {
  return (
    <IntentMotion
      as={motion.button}
      ref={ref}
      type={type}
      intent={intent}
      whileHover={whileHover ?? { scale: 1.015 }}
      whileTap={whileTap ?? { scale: 0.97 }}
      transition={transition ?? MOTION_SPRING.interaction}
      className={className}
      {...rest}
    >
      {children}
    </IntentMotion>
  )
})

export const MotionCard = forwardRef(function MotionCard({
  children,
  className,
  hoverable = true,
  intent = MOTION_INTENTS.feedback,
  whileHover,
  whileTap,
  transition,
  ...rest
}, ref) {
  return (
    <IntentMotion
      ref={ref}
      intent={intent}
      whileHover={whileHover ?? (hoverable ? { y: -2, scale: 1.005 } : undefined)}
      whileTap={whileTap ?? (hoverable ? { scale: 0.99 } : undefined)}
      transition={transition ?? { type: 'spring', stiffness: 380, damping: 28, mass: 0.7 }}
      className={className}
      {...rest}
    >
      {children}
    </IntentMotion>
  )
})

export { AnimatePresence, motion }