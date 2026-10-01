/** Shared portaled modal with real presence, focus, and nested-safe locking. */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, IntentMotion } from './Motion.jsx'
import { useMotionPolicy } from './MotionPolicyProvider.jsx'
import { MOTION_DURATION, MOTION_EASING, MOTION_INTENTS } from './tokens.js'
import { bodyScrollLock } from './scrollLock.js'

const modalStack = []
const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function visibleFocusable(root) {
  if (!root) return []
  return [...root.querySelectorAll(FOCUSABLE)].filter((node) => (
    !node.hasAttribute('aria-hidden') && node.getAttribute('aria-disabled') !== 'true'
  ))
}

function ModalLayer({
  onClose, children, labelledBy, describedBy, maxWidth, panelClassName,
  contentClassName, closeOnBackdrop, closeOnEscape, trapFocus, variant,
}) {
  const panelRef = useRef(null)
  const openerRef = useRef(null)
  const idRef = useRef(Symbol('modal'))
  const closeRef = useRef(onClose)
  const policy = useMotionPolicy()
  closeRef.current = onClose

  useEffect(() => {
    const id = idRef.current
    const releaseScroll = bodyScrollLock.acquire(document)
    openerRef.current = document.activeElement
    modalStack.push(id)
    const focusFrame = requestAnimationFrame(() => {
      if (!trapFocus || modalStack[modalStack.length - 1] !== id) return
      const target = visibleFocusable(panelRef.current)[0] || panelRef.current
      target?.focus?.()
    })
    const onKeyDown = (event) => {
      if (modalStack[modalStack.length - 1] !== id) return
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !trapFocus) return
      const items = visibleFocusable(panelRef.current)
      if (!items.length) {
        event.preventDefault()
        panelRef.current?.focus?.()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !panelRef.current?.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      const index = modalStack.lastIndexOf(id)
      if (index >= 0) modalStack.splice(index, 1)
      releaseScroll()
      requestAnimationFrame(() => {
        const opener = openerRef.current
        if (opener?.isConnected && typeof opener.focus === 'function') opener.focus()
      })
    }
  }, [closeOnEscape, trapFocus])

  const reduced = policy.reducedMotion
  const overlayMotion = reduced ? {
    initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.1 },
  } : {
    initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 },
    transition: { duration: MOTION_DURATION.base, ease: MOTION_EASING.out },
  }
  const panelMotion = reduced ? {
    initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.1 },
  } : {
    initial: { opacity: 0, scale: 0.975, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASING.out } },
    exit: { opacity: 0, scale: 0.985, y: 4, transition: { duration: MOTION_DURATION.fast, ease: MOTION_EASING.out } },
  }
  const maxW = {
    sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl',
    '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl',
  }[maxWidth] || 'max-w-md'
  const spaceOverlayClass = panelClassName.includes('vc-space-modal') ? ' vc-space-overlay' : ''
  const overlayStyle = variant === 'coral'
    ? { background: 'rgba(4, 5, 8, 0.68)' }
    : { background: 'rgba(0, 0, 0, 0.72)' }

  return (
    <IntentMotion
      intent={MOTION_INTENTS.essential}
      className={`vc-layer-modal fixed inset-0 flex items-center justify-center p-4 sm:p-6${spaceOverlayClass}`}
      style={overlayStyle}
      onPointerDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.()
      }}
      {...overlayMotion}
    >
      <IntentMotion
        ref={panelRef}
        intent={MOTION_INTENTS.essential}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`w-full ${maxW} ${panelClassName}`}
        {...panelMotion}
      >
        <div className={contentClassName}>{children}</div>
      </IntentMotion>
    </IntentMotion>
  )
}

export function ModalShell({
  open = true, onClose, children, labelledBy, describedBy, maxWidth = 'md',
  panelClassName = '', contentClassName = '', closeOnBackdrop = true,
  closeOnEscape = true, variant = 'dark', trapFocus = true,
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalLayer
          key="modal-layer"
          onClose={onClose}
          labelledBy={labelledBy}
          describedBy={describedBy}
          maxWidth={maxWidth}
          panelClassName={panelClassName}
          contentClassName={contentClassName}
          closeOnBackdrop={closeOnBackdrop}
          closeOnEscape={closeOnEscape}
          variant={variant}
          trapFocus={trapFocus}
        >
          {children}
        </ModalLayer>
      )}
    </AnimatePresence>,
    document.body,
  )
}