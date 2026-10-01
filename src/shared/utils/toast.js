/** Imperative toast queue with bounded concurrency and real exit states. */
const MAX_VISIBLE = 3
const MAX_QUEUED = 8
const EXIT_MS = 140
const visible = []
const queued = []
let host = null

function ensureHost() {
  if (host?.isConnected) return host
  host = document.createElement('div')
  host.className = 'vc-imperative-toast-host vc-layer-toast'
  host.setAttribute('aria-live', 'polite')
  host.setAttribute('aria-atomic', 'false')
  document.body.appendChild(host)
  return host
}

function finish(record) {
  const index = visible.indexOf(record)
  if (index >= 0) visible.splice(index, 1)
  record.element?.remove()
  if (!visible.length && !queued.length) {
    host?.remove()
    host = null
  }
  pump()
}

function dismiss(record) {
  if (record.exiting) return
  record.exiting = true
  clearTimeout(record.timer)
  record.element.dataset.state = 'exiting'
  record.timer = setTimeout(() => finish(record), EXIT_MS)
}

function show(record) {
  const element = document.createElement('div')
  element.textContent = record.text
  element.setAttribute('role', 'status')
  element.className = 'vc-imperative-toast'
  element.dataset.state = 'entering'
  record.element = element
  visible.push(record)
  ensureHost().appendChild(element)
  requestAnimationFrame(() => {
    if (!record.exiting) element.dataset.state = 'visible'
  })
  record.timer = setTimeout(() => dismiss(record), record.duration)
}

function pump() {
  if (typeof document === 'undefined') return
  while (visible.length < MAX_VISIBLE && queued.length) show(queued.shift())
}

export function flashToast(text, { duration = 1400 } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !text) return
  const normalized = String(text).trim()
  if (!normalized) return
  const duplicate = visible.find((item) => item.text === normalized && !item.exiting)
  if (duplicate) {
    clearTimeout(duplicate.timer)
    duplicate.timer = setTimeout(() => dismiss(duplicate), Math.max(400, Number(duration) || 1400))
    return
  }
  if (queued.some((item) => item.text === normalized)) return
  if (queued.length >= MAX_QUEUED) queued.shift()
  queued.push({ text: normalized, duration: Math.min(10_000, Math.max(400, Number(duration) || 1400)), timer: 0, element: null, exiting: false })
  pump()
}