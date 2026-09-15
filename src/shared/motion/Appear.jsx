/**
 * Appear — soft entrance without blanking the UI.
 *
 * After a long boot, opacity:0 + stagger made the whole home look black.
 * We only nudge translateY (GPU); content stays visible the whole time.
 */
import { motion } from 'framer-motion'

export const APPEAR_EASE = [0.22, 1, 0.36, 1]

/** True for ~1s after boot splash lifts — skip entrance so first paint is solid. */
let skipUntil = 0

export function markBootReveal() {
  skipUntil = Date.now() + 900
}

export function shouldSkipAppear() {
  return Date.now() < skipUntil
}

export const appearItem = {
  initial: { opacity: 1, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: APPEAR_EASE },
  },
}

export const appearContainer = {
  initial: 'initial',
  animate: 'animate',
  variants: {
    initial: {},
    animate: {
      transition: { staggerChildren: 0.03, delayChildren: 0.02 },
    },
  },
}

/** Single element rise (visible throughout). */
export function Appear({
  children,
  className = '',
  delay = 0,
  y = 6,
  duration = 0.22,
  as: Comp = motion.div,
  ...rest
}) {
  const skip = shouldSkipAppear()
  return (
    <Comp
      className={className}
      initial={skip ? false : { opacity: 1, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: skip ? 0 : duration, delay: skip ? 0 : delay, ease: APPEAR_EASE }}
      {...rest}
    >
      {children}
    </Comp>
  )
}

/** Stagger parent — any element (div, section, nav…). */
export function AppearGroup({
  children,
  className = '',
  stagger = 0.03,
  delayChildren = 0.02,
  as: Comp = motion.div,
  ...rest
}) {
  const skip = shouldSkipAppear()
  return (
    <Comp
      className={className}
      initial={skip ? false : 'initial'}
      animate="animate"
      variants={{
        initial: {},
        animate: {
          transition: {
            staggerChildren: skip ? 0 : stagger,
            delayChildren: skip ? 0 : delayChildren,
          },
        },
      }}
      {...rest}
    >
      {children}
    </Comp>
  )
}

/** Stagger parent as `<ul>`. */
export function AppearList({
  children,
  className = '',
  stagger = 0.03,
  delayChildren = 0.02,
  ...rest
}) {
  return (
    <AppearGroup
      as={motion.ul}
      className={className}
      stagger={stagger}
      delayChildren={delayChildren}
      {...rest}
    >
      {children}
    </AppearGroup>
  )
}

/** Child of AppearGroup / AppearList. */
export function AppearItem({
  children,
  className = '',
  as: Comp = motion.li,
  ...rest
}) {
  const skip = shouldSkipAppear()
  return (
    <Comp
      className={className}
      variants={skip ? undefined : appearItem}
      initial={skip ? false : undefined}
      {...rest}
    >
      {children}
    </Comp>
  )
}
