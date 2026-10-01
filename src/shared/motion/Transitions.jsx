import { useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, IntentMotion, motion } from './Motion.jsx'
import { useMotionPolicy } from './MotionPolicyProvider.jsx'
import { MOTION_INTENTS, MOTION_TRANSITION } from './tokens.js'
import { resolveDisclosureTransition, resolveDrawerTransition, resolveTabTransition, resolveViewTransition } from './transitionPolicy.js'

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/** Persistent surface: hiding never unmounts children or restarts their effects. */
export function ViewTransition({ active, children, className = '', offset = 5, style, ...rest }) {
  const { reducedMotion } = useMotionPolicy()
  const resolved = resolveViewTransition(active, reducedMotion, offset)
  return (
    <motion.div
      initial={active && !reducedMotion ? { opacity: 0, y: Math.max(0, offset) } : false}
      animate={resolved.target}
      transition={resolved.transition}
      transitionEnd={active ? undefined : { visibility: 'hidden' }}
      className={className}
      style={{ ...style, visibility: active ? 'visible' : undefined, pointerEvents: active ? 'auto' : 'none' }}
      aria-hidden={!active}
      data-motion-intent={MOTION_INTENTS.feedback}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Presence boundary for drawers; the panel remains mounted through exit. */
export function DrawerPresence({
  open, side = 'right', overlay = true, onBackdrop, backdropLabel = 'Fechar painel',
  backdropClassName = 'absolute inset-0 bg-black/50', panelClassName = '', panelStyle,
  panelRef, panelAs = motion.aside, panelRole, panelLabel, presenceKey, children,
}) {
  const { reducedMotion } = useMotionPolicy()
  const drawerMotion = resolveDrawerTransition(side, reducedMotion)
  const fade = reducedMotion ? MOTION_TRANSITION.instant : MOTION_TRANSITION.fast
  const key = presenceKey || side
  return (
    <>
      <AnimatePresence initial={false}>
        {open && overlay && (
          <IntentMotion
            as={motion.button}
            type="button"
            key={`drawer-backdrop-${key}`}
            aria-label={backdropLabel}
            intent={MOTION_INTENTS.feedback}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={fade}
            className={`vc-layer-drawer ${backdropClassName}`.trim()}
            onClick={onBackdrop}
          />
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {open && (
          <IntentMotion
            as={panelAs}
            ref={(node) => assignRef(panelRef, node)}
            key={`drawer-panel-${key}`}
            intent={MOTION_INTENTS.feedback}
            {...drawerMotion}
            className={`vc-layer-drawer ${panelClassName}`.trim()}
            style={panelStyle}
            role={panelRole}
            aria-label={panelLabel}
          >
            {children}
          </IntentMotion>
        )}
      </AnimatePresence>
    </>
  )
}
export function TabIndicator({ layoutId, className = '', style }) {
  const { reducedMotion } = useMotionPolicy()
  return (
    <motion.span
      layoutId={reducedMotion ? undefined : layoutId}
      className={className}
      style={style}
      transition={reducedMotion ? MOTION_TRANSITION.instant : { type: 'spring', stiffness: 460, damping: 36, mass: 0.65 }}
      aria-hidden
    />
  )
}

/** Small content swap for tabs; intentionally does not stagger list children. */
export function TabPanelSwap({ activeKey, children, className = '', ...rest }) {
  const { reducedMotion } = useMotionPolicy()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <IntentMotion key={activeKey} intent={MOTION_INTENTS.feedback} className={className} {...resolveTabTransition(reducedMotion)} {...rest}>
        {children}
      </IntentMotion>
    </AnimatePresence>
  )
}

export function PersistentTabPanel({ active, children, className = '', ...rest }) {
  return <ViewTransition active={active} offset={3} className={className} {...rest}>{children}</ViewTransition>
}

/** Measured disclosure: animates to snapshots and never runs a continuous height loop. */
export function MeasuredDisclosure({ open, children, className = '', contentClassName = '', id }) {
  const { reducedMotion } = useMotionPolicy()
  const contentRef = useRef(null)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    if (!open || !contentRef.current) return undefined
    const node = contentRef.current
    const measure = () => setHeight(Math.ceil(node.getBoundingClientRect().height))
    measure()
    return undefined
  }, [open])

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="disclosure"
          id={id}
          initial={reducedMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
          animate={reducedMotion ? { opacity: 1 } : { height, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transitionEnd={open && !reducedMotion ? { height: 'auto' } : undefined}
          transition={resolveDisclosureTransition(reducedMotion)}
          className={className}
          style={{ overflow: 'clip' }}
          data-motion-intent={MOTION_INTENTS.feedback}
        >
          <div ref={contentRef} className={contentClassName}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}