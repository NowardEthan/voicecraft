/**
 * ModalShell — animated modal wrapper used by every modal in the app.
 *
 * Centralises the overlay fade + panel scale/fade entrance. Combines
 * with the existing focus-trap hook and body-scroll lock.
 *
 * Usage:
 *   <ModalShell onClose={() => setOpen(false)} labelledBy="title-id" maxWidth="md">
 *     <h2 id="title-id">…</h2>
 *     …
 *   </ModalShell>
 */
import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useFocusTrap from '../hooks/useFocusTrap'
import { EASE_OUT } from './presets.js'

const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: 0.18, ease: EASE_OUT },
}

const panelVariants = {
  initial: { opacity: 0, scale: 0.96, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit:    { opacity: 0, scale: 0.97, y: 2 },
  transition: { duration: 0.24, ease: EASE_OUT },
}

export function ModalShell({
  open,
  onClose,
  children,
  labelledBy,
  describedBy,
  maxWidth = 'md',           // 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
  panelClassName = '',
  contentClassName = '',
  closeOnBackdrop = true,
  closeOnEscape = true,
  // Visual flavour — 'dark' is the default, 'coral' is the brand modal.
  variant = 'dark',
  // When true, the close-on-backdrop click is suppressed (e.g. for nested
  // modals where the user must explicitly cancel).
  trapFocus = true,
}) {
  const trapRef = useFocusTrap({ active: trapFocus && open })
  const prevOverflowRef = useRef(null)

  // Escape closes the modal
  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeOnEscape, onClose])

  // Lock body scroll while the modal is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    prevOverflowRef.current = prev
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflowRef.current || '' }
  }, [open])

  const maxW = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  }[maxWidth] || 'max-w-md'

  const overlayStyle = variant === 'coral'
    ? { background: 'rgba(4, 5, 8, 0.68)' }
    : { background: 'rgba(0, 0, 0, 0.72)' }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-overlay"
          className="fixed inset-0 flex items-center justify-center z-50 p-4 sm:p-6"
          style={overlayStyle}
          onClick={closeOnBackdrop ? onClose : undefined}
          {...overlayVariants}
        >
          <motion.div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            className={`w-full ${maxW} ${panelClassName}`}
            onClick={(e) => e.stopPropagation()}
            {...panelVariants}
          >
            <div className={contentClassName}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
