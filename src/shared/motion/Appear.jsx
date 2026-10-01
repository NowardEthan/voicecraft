/** Soft, always-visible entrance primitives governed by the shared motion policy. */
import { AnimatePresence, motion } from 'framer-motion'
import { Children } from 'react'
import { MOTION_DURATION, MOTION_EASING, MOTION_INTENTS, MOTION_VARIANTS } from './tokens.js'
import { useMotionIntent } from './MotionPolicyProvider.jsx'
import { resolveDynamicListMotion } from './dynamicPolicy.js'

export const APPEAR_EASE = MOTION_EASING.emphasized

let skipUntil = 0

export function markBootReveal() {
  skipUntil = Date.now() + 900
}

export function shouldSkipAppear() {
  return Date.now() < skipUntil
}

export const appearItem = MOTION_VARIANTS.appear

export const appearContainer = {
  initial: 'initial',
  animate: 'animate',
  variants: {
    initial: {},
    animate: {
      transition: { staggerChildren: 0, delayChildren: 0 },
    },
  },
}

export function Appear({
  children,
  className = '',
  delay = 0,
  y = 6,
  duration = MOTION_DURATION.slow,
  intent = MOTION_INTENTS.decorative,
  as: Comp = motion.div,
  initial,
  animate,
  transition,
  exit,
  ...rest
}) {
  const { enabled } = useMotionIntent(intent)
  const animateEntrance = enabled && !shouldSkipAppear()
  return (
    <Comp
      {...rest}
      className={className}
      data-motion-intent={intent}
      initial={animateEntrance ? (initial ?? { opacity: 1, y }) : false}
      animate={animateEntrance ? (animate ?? { opacity: 1, y: 0 }) : { opacity: 1, y: 0 }}
      exit={animateEntrance ? exit : undefined}
      transition={animateEntrance
        ? (transition ?? { duration, delay, ease: APPEAR_EASE })
        : MOTION_TRANSITION_INSTANT}
    >
      {children}
    </Comp>
  )
}

const MOTION_TRANSITION_INSTANT = { duration: 0 }

export function AppearGroup({
  children,
  className = '',
  stagger = 0.03,
  delayChildren = 0.02,
  intent = MOTION_INTENTS.decorative,
  as: Comp = motion.div,
  initial,
  animate,
  variants,
  transition,
  itemCount,
  ...rest
}) {
  const policy = useMotionIntent(intent)
  const animateEntrance = policy.enabled && !shouldSkipAppear()
  const listMotion = resolveDynamicListMotion(itemCount ?? Children.count(children), {
    stagger,
    delayChildren,
    reducedMotion: policy.reducedMotion,
    perfTier: policy.perfTier,
    visible: policy.isDocumentVisible,
  })
  const groupVariants = variants ?? {
    initial: {},
    animate: {
      transition: {
        staggerChildren: listMotion.staggerChildren,
        delayChildren: listMotion.delayChildren,
      },
    },
  }
  return (
    <Comp
      {...rest}
      className={className}
      data-motion-intent={intent}
      initial={animateEntrance ? (initial ?? 'initial') : false}
      animate={animateEntrance ? (animate ?? 'animate') : undefined}
      variants={animateEntrance ? groupVariants : undefined}
      transition={animateEntrance ? transition : MOTION_TRANSITION_INSTANT}
    >
      {children}
    </Comp>
  )
}

export function AppearList({ children, className = '', stagger = 0.03, delayChildren = 0.02, ...rest }) {
  return (
    <AppearGroup
      as={motion.ul}
      className={className}
      stagger={stagger}
      delayChildren={delayChildren}
      itemCount={Children.count(children)}
      {...rest}
    >
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </AppearGroup>
  )
}

export function AppearItem({
  children,
  className = '',
  intent = MOTION_INTENTS.decorative,
  as: Comp = motion.li,
  initial,
  animate,
  variants,
  transition,
  exit,
  ...rest
}) {
  const { enabled } = useMotionIntent(intent)
  const animateEntrance = enabled && !shouldSkipAppear()
  return (
    <Comp
      {...rest}
      className={className}
      data-motion-intent={intent}
      variants={animateEntrance ? (variants ?? appearItem) : undefined}
      initial={animateEntrance ? initial : false}
      animate={animateEntrance ? animate : { opacity: 1, y: 0 }}
      transition={animateEntrance ? transition : MOTION_TRANSITION_INSTANT}
      exit={animateEntrance ? (exit ?? { opacity: 0, y: -2, transition: { duration: MOTION_DURATION.fast } }) : undefined}
    >
      {children}
    </Comp>
  )
}