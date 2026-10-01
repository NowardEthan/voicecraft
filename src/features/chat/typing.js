/** Lightweight typing protocol over the room RTCDataChannel. */
const THROTTLE_MS = 2000
const VISIBLE_MS = 4000
const IDLE_MS = 1500

export function broadcastTyping(channel, state = 'start', identity = {}) {
  if (!channel || channel.readyState !== 'open') return
  try {
    channel.send(JSON.stringify({
      kind: 'typing',
      state: state === 'stop' ? 'stop' : 'start',
      userId: identity.userId || null,
      name: identity.name || '',
      ts: Date.now(),
    }))
  } catch { /* non-fatal */ }
}

export function makeTypingTracker() {
  const state = new Map()
  const listeners = new Set()

  const derive = () => ({ peers: Array.from(state.values()).map((value) => value.name || 'alguém') })
  const emit = () => {
    const snapshot = derive()
    for (const listener of listeners) {
      try { listener(snapshot) } catch {}
    }
  }
  const remove = (peerId) => {
    const current = state.get(peerId)
    if (!current) return
    if (current.timer) clearTimeout(current.timer)
    state.delete(peerId)
    emit()
  }

  return {
    onTyping(peerId, peerName = 'alguém') {
      if (!peerId) return
      const previous = state.get(peerId)
      if (previous?.timer) clearTimeout(previous.timer)
      const timer = setTimeout(() => remove(peerId), VISIBLE_MS)
      state.set(peerId, { name: peerName || previous?.name || 'alguém', timer })
      emit()
    },
    onStop: remove,
    subscribe(callback) {
      listeners.add(callback)
      try { callback(derive()) } catch {}
      return () => listeners.delete(callback)
    },
    reset() {
      for (const value of state.values()) if (value.timer) clearTimeout(value.timer)
      state.clear()
      emit()
    },
  }
}

export function subscribeTyping(channel, localUserId, tracker, resolvePeerName) {
  if (!channel || !tracker) return () => {}
  const handler = (event) => {
    if (typeof event.data !== 'string') return
    let message
    try { message = JSON.parse(event.data) } catch { return }
    if (message?.kind !== 'typing') return
    const peerId = String(message.userId || 'remote-peer')
    if (localUserId && peerId === String(localUserId)) return
    const name = typeof resolvePeerName === 'function'
      ? resolvePeerName(peerId, message)
      : (message.name || resolvePeerName || 'alguém')
    if (message.state === 'stop') tracker.onStop(peerId)
    else tracker.onTyping(peerId, name || 'alguém')
  }
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}

export function attachComposerTyping(channel, getText, identity = {}) {
  let lastText = ''
  let lastChangeAt = 0
  let lastStartAt = 0
  let announced = false

  const poll = () => {
    if (!channel || channel.readyState !== 'open') return
    const now = Date.now()
    const current = String(getText?.() || '').trim()
    if (current !== lastText) {
      lastText = current
      lastChangeAt = now
      if (!current && announced) {
        broadcastTyping(channel, 'stop', identity)
        announced = false
        return
      }
      if (current && (!announced || now - lastStartAt >= THROTTLE_MS)) {
        broadcastTyping(channel, 'start', identity)
        announced = true
        lastStartAt = now
      }
      return
    }
    if (announced && now - lastChangeAt >= IDLE_MS) {
      broadcastTyping(channel, 'stop', identity)
      announced = false
    }
  }

  const interval = setInterval(poll, 250)
  poll()
  return () => {
    clearInterval(interval)
    if (announced) broadcastTyping(channel, 'stop', identity)
  }
}

export const TYPING_VISIBLE_MS = VISIBLE_MS