import { forwardRef, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, IntentMotion } from './Motion.jsx'
import { useMotionPolicy } from './MotionPolicyProvider.jsx'
import { MOTION_INTENTS } from './tokens.js'
import { resolveOverlayMotion } from './overlayPolicy.js'

const overlayStack = []

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

function isTopOverlay(id) {
  return overlayStack[overlayStack.length - 1] === id
}

const AnchoredLayer = forwardRef(function AnchoredLayer({
  anchorRef, children, className = '', dismissOnEscape, dismissOnOutside,
  initialFocus, layer = 'popover', onClose, participateInStack = true, placement, restoreFocus, role, style, ...rest
}, forwardedRef) {
  const layerRef = useRef(null)
  const closeRef = useRef(onClose)
  const restoreTargetRef = useRef(null)
  const idRef = useRef(Symbol('anchored-overlay'))
  const policy = useMotionPolicy()
  closeRef.current = onClose

  useEffect(() => {
    const id = idRef.current
    if (participateInStack) overlayStack.push(id)
    restoreTargetRef.current = anchorRef?.current || document.activeElement
    let frame = 0
    if (initialFocus) {
      frame = requestAnimationFrame(() => {
        const root = layerRef.current
        const target = typeof initialFocus === 'string'
          ? root?.querySelector(initialFocus)
          : typeof initialFocus === 'function'
            ? initialFocus(root)
            : root?.querySelector('button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])')
        target?.focus?.()
      })
    }
    const onPointerDown = (event) => {
      if (!dismissOnOutside || (participateInStack && !isTopOverlay(id))) return
      if (layerRef.current?.contains(event.target) || anchorRef?.current?.contains?.(event.target)) return
      closeRef.current?.('outside')
    }
    const onKeyDown = (event) => {
      if (!dismissOnEscape || event.key !== 'Escape' || (participateInStack && !isTopOverlay(id))) return
      event.preventDefault()
      event.stopPropagation()
      closeRef.current?.('escape')
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      if (participateInStack) {
        const index = overlayStack.lastIndexOf(id)
        if (index >= 0) overlayStack.splice(index, 1)
      }
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      if (restoreFocus) requestAnimationFrame(() => {
        const target = restoreTargetRef.current
        if (target?.isConnected && typeof target.focus === 'function') target.focus()
      })
    }
  }, [anchorRef, dismissOnEscape, dismissOnOutside, initialFocus, participateInStack, restoreFocus])

  return (
    <IntentMotion
      ref={(node) => { layerRef.current = node; assignRef(forwardedRef, node) }}
      intent={MOTION_INTENTS.feedback}
      className={`vc-layer-${layer} ${className}`.trim()}
      role={role}
      style={style}
      {...resolveOverlayMotion(placement, policy.reducedMotion)}
      {...rest}
    >
      {children}
    </IntentMotion>
  )
})

/** Stable portal/presence boundary retaining existing viewport positioning. */
export const AnchoredOverlay = forwardRef(function AnchoredOverlay({
  open, portal = true, presenceKey = 'anchored-overlay', dismissOnEscape = true,
  dismissOnOutside = true, restoreFocus = true, initialFocus = false, ...props
}, ref) {
  if (typeof document === 'undefined') return null
  const presence = (
    <AnimatePresence>
      {open && (
        <AnchoredLayer
          key={presenceKey}
          ref={ref}
          dismissOnEscape={dismissOnEscape}
          dismissOnOutside={dismissOnOutside}
          restoreFocus={restoreFocus}
          initialFocus={initialFocus}
          {...props}
        />
      )}
    </AnimatePresence>
  )
  return portal ? createPortal(presence, document.body) : presence
})

export const TooltipOverlay = forwardRef(function TooltipOverlay(props, ref) {
  return (
    <AnchoredOverlay
      ref={ref}
      layer="tooltip"
      role="tooltip"
      dismissOnEscape={false}
      dismissOnOutside={false}
      restoreFocus={false}
      participateInStack={false}
      {...props}
    />
  )
})