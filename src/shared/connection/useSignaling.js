/**
 * useSignaling — single source of the WebSocket signaling client.
 *
 * Before: every component that needed to send a message to the server
 * imported SignalingClient directly and held a ref. That made it hard
 * to swap the transport, mock the server in tests, or instrument the
 * connection.
 *
 * After: a single hook is the gate. The component that mounts the app
 * shell calls `useSignaling()` once and hands the returned object down
 * via context. Other features (spaces, rooms) call their own action
 * hooks which internally reach for the client.
 *
 * The hook also exposes connection status so the shell can show a
 * reconnecting banner without re-deriving it.
 */
import { useEffect, useRef, useState } from 'react'
import { SignalingClient } from './signalingClient'

let _singleton = null

export function getSharedSignaling() {
  if (!_singleton) _singleton = new SignalingClient()
  return _singleton
}

export function useSignaling({ enabled = true } = {}) {
  const clientRef = useRef(getSharedSignaling())
  const [status, setStatus] = useState(enabled ? 'connecting' : 'idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return undefined
    }
    const sig = clientRef.current
    const off = sig.onStatus((s) => {
      if (s.type === 'reconnecting') setStatus('reconnecting')
      else if (s.type === 'connected') setStatus('connected')
      else if (s.type === 'disconnected') setStatus('failed')
    })
    const p = sig.connect()
    if (p && typeof p.then === 'function') {
      p.then(() => setStatus('connected'))
       .catch((err) => {
         setError(err.message || 'connection failed')
         setStatus('failed')
       })
    } else {
      setStatus('connected')
    }
    return off
    // We intentionally don't disconnect on unmount — the singleton is
    // meant to live for the whole app session.
  }, [enabled])

  return {
    client: clientRef.current,
    status,
    error,
    userId: clientRef.current.userId,
    displayName: clientRef.current.displayName,
  }
}
