/**
 * Typing indicator — small pub/sub helper layered on top of the existing
 * data channel. We piggyback on the JSON envelope (kind:'typing') so no
 * protocol change is needed and existing peers simply ignore the kind.
 *
 *   broadcastTyping(channel, state)            — sender side, throttled
 *   subscribeTyping(channel, peerId, cb)       — receiver side, with TTL
 *
 * Both helpers are defensive: if `channel` is undefined / not open, they
 * no-op. A consumer (the MessageList footer) renders the indicator for at
 * most `VISIBLE_MS` after the last 'start' event for a given peer.
 */

const THROTTLE_MS = 2000
const VISIBLE_MS = 4000

export function broadcastTyping(channel, state = 'start') {
  if (!channel || channel.readyState !== 'open') return
  try {
    channel.send(JSON.stringify({
      kind: 'typing',
      state: state === 'stop' ? 'stop' : 'start',
      ts: Date.now(),
    }))
  } catch {
    /* ignore — chat send failures are non-fatal for typing indicator */
  }
}

export function makeTypingTracker() {
  const state = new Map() // peerId -> { expiresAt: number, name?: string }
  const listeners = new Set()

  function emit() {
    for (const fn of listeners) {
      try { fn(derive()) } catch {}
    }
  }

  function derive() {
    const now = Date.now()
    // Drop expired entries first.
    for (const [k, v] of state) {
      if (v.expiresAt <= now) state.delete(k)
    }
    if (state.size === 0) return { peers: [] }
    return {
      peers: Array.from(state.values()).map((v) => v.name || 'alguém'),
    }
  }

  return {
    onTyping(peerId, peerName = 'alguém') {
      if (!peerId) return
      state.set(peerId, { name: peerName, expiresAt: Date.now() + VISIBLE_MS })
      emit()
    },
    onStop(peerId) {
      if (state.delete(peerId)) emit()
    },
    subscribe(cb) {
      listeners.add(cb)
      try { cb(derive()) } catch {}
      return () => listeners.delete(cb)
    },
    /* For tests: clear all. */
    reset() {
      state.clear()
      emit()
    },
  }
}

/**
 * Wire the tracker to a data channel. Returns an unsubscribe function.
 */
export function subscribeTyping(channel, peerId, tracker, peerName) {
  if (!channel || !peerId || !tracker) return () => {}
  const handler = (e) => {
    if (typeof e.data !== 'string') return
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    if (msg?.kind !== 'typing') return
    if (msg.state === 'stop') tracker.onStop(peerId)
    else tracker.onTyping(peerId, peerName || 'alguém')
  }
  channel.addEventListener('message', handler)
  return () => channel.removeEventListener('message', handler)
}

/**
 * Auto-emit 'start' when the user types in the composer. Pass a getter
 * that returns the current text (e.g. via React state ref). Emits
 * 'start' on every call (caller throttles if needed). Emits 'stop' when
 * text becomes empty.
 */
export function attachComposerTyping(channel, getText) {
  let lastSeen = ''
  let stopTimer = null

  const poll = () => {
    if (!channel || channel.readyState !== 'open') return
    const cur = String(getText?.() || '').trim()
    if (cur && cur !== lastSeen) {
      broadcastTyping(channel, 'start')
      lastSeen = cur
      if (stopTimer) { clearTimeout(stopTimer); stopTimer = null }
    } else if (!cur && lastSeen) {
      if (stopTimer) clearTimeout(stopTimer)
      stopTimer = setTimeout(() => {
        broadcastTyping(channel, 'stop')
        lastSeen = ''
        stopTimer = null
      }, 1000)
    } else if (!cur) {
      lastSeen = ''
    }
  }

  const interval = setInterval(poll, 700)

  return () => {
    clearInterval(interval)
    if (stopTimer) clearTimeout(stopTimer)
    if (lastSeen) broadcastTyping(channel, 'stop')
  }
}

export const TYPING_VISIBLE_MS = VISIBLE_MS
