/**
 * Toast — single source of truth for ephemeral feedback.
 *
 * Previously the same `flashToast(text)` function was copy-pasted in 3
 * places (App.jsx, TextRoomView, VoiceRoomView) with tiny variations. This
 * is the canonical one. Components import it via:
 *
 *   import { flashToast } from '@/shared/utils/toast'
 *
 * It deliberately stays a plain function (not a hook) so any code path
 * — including WS callbacks and event handlers — can call it without
 * having to be inside a React render.
 */
export function flashToast(text, { duration = 1400 } = {}) {
  if (typeof window === 'undefined' || !text) return
  const el = document.createElement('div')
  el.textContent = text
  el.className =
    'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full ' +
    'bg-surface1 border border-line text-ink ' +
    'text-[12px] shadow-2xl animate-fade-in-up'
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.transition = 'opacity 240ms ease-out'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 280)
  }, duration)
}
