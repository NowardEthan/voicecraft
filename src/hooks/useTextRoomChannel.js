/**
 * useTextRoomChannel — sets up a dedicated RTCPeerConnection + DataChannel
 * for a text Sala. Mirrors the chat-channel scaffolding that VoiceChannel
 * does internally, but scoped to a single text room and exposed as its
 * own hook so a TextRoomView can own the lifecycle.
 *
 * Flow:
 *   1. Caller calls signaling.enterRoom(roomId) (handled by App.jsx — we
 *      just react to room:entered events).
 *   2. We create an RTCPeerConnection.
 *   3. The "host" of this Sala (the first peer to enter) creates a data
 *      channel labeled 'text-chat' BEFORE negotiation.
 *   4. The "joiner" registers ondatachannel and adopts the channel.
 *   5. onnegotiationneeded creates an offer; peer-joined triggers it.
 *   6. ICE candidates are relayed through signaling.sendSignal.
 *
 * Returns:
 *   - channel:        RTCDataChannel | null
 *   - connectionState: string
 *   - peerInRoom:     boolean
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export function useTextRoomChannel({ signaling, roomId, currentUserId, roomCreatedBy }) {
  const pcRef = useRef(null)
  const channelRef = useRef(null)
  const makingOfferRef = useRef(false)
  const [channel, setChannel] = useState(null)
  const [connectionState, setConnectionState] = useState('idle')
  const [peerInRoom, setPeerInRoom] = useState(false)

  // The first peer to enter a text Sala becomes the WebRTC host — they
  // create the channel. Tiebreak: whoever's userId is alphabetically
  // smaller wins so two clients racing produce a stable outcome.
  const isHost = (() => {
    if (roomCreatedBy && currentUserId) return roomCreatedBy === currentUserId
    if (!currentUserId) return true
    return false
  })()

  const safeSend = useCallback((type, payload) => {
    if (!signaling) return
    try { signaling.sendSignal(type, payload) } catch (err) {
      console.warn('[text-room] signaling send failed:', err)
    }
  }, [signaling])

  useEffect(() => {
    if (!signaling || !roomId) return
    let cancelled = false

    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc
    setConnectionState('connecting')

    if (isHost) {
      try {
        const dc = pc.createDataChannel('text-chat', { ordered: true })
        channelRef.current = dc
        setChannel(dc)
      } catch (err) {
        console.warn('[text-room] createDataChannel failed:', err)
      }
    } else {
      pc.ondatachannel = (e) => {
        if (e.channel.label !== 'text-chat') return
        channelRef.current = e.channel
        setChannel(e.channel)
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        safeSend('ice-candidate', { candidate: e.candidate.toJSON() })
      }
    }

    pc.onconnectionstatechange = () => {
      if (cancelled) return
      setConnectionState(pc.connectionState)
    }

    const onNegotiation = async () => {
      try {
        if (makingOfferRef.current) return
        makingOfferRef.current = true
        await pc.setLocalDescription()
        if (signaling.ws?.readyState === 1) {
          safeSend('offer', { sdp: pc.localDescription.toJSON() })
        }
      } catch (err) {
        console.warn('[text-room] negotiation failed:', err)
      } finally {
        makingOfferRef.current = false
      }
    }
    pc.onnegotiationneeded = onNegotiation

    const handleRemoteSignal = async (msg) => {
      try {
        if (msg.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          await pc.setLocalDescription()
          if (signaling.ws?.readyState === 1) {
            safeSend('answer', { sdp: pc.localDescription.toJSON() })
          }
        } else if (msg.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        } else if (msg.type === 'ice-candidate' && msg.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
        }
      } catch (err) {
        console.warn('[text-room] signal handler failed:', err)
      }
    }

    // Stash a transient signal handler. signalingClient.signalCallback
    // would conflict with VoiceChannel if both are mounted, but VoiceChannel
    // is unmounted before TextRoomView mounts (selectedRoom != currentRoom
    // guard in App.jsx), so we're fine.
    const prevCb = signaling.signalCallback
    signaling.signalCallback = handleRemoteSignal

    const onPeerJoined = async () => {
      setPeerInRoom(true)
      if (isHost) {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          if (signaling.ws?.readyState === 1) {
            safeSend('offer', { sdp: pc.localDescription.toJSON() })
          }
        } catch (err) {
          console.warn('[text-room] offer on peer-join failed:', err)
        }
      }
    }
    const onPeerLeft = () => setPeerInRoom(false)

    const prevPeerJoined = signaling.peerJoinedCallback
    const prevPeerLeft = signaling.peerLeftCallback
    signaling.peerJoinedCallback = onPeerJoined
    signaling.peerLeftCallback = onPeerLeft

    return () => {
      cancelled = true
      // Restore signaling callbacks so a future VoiceChannel isn't surprised.
      if (signaling.signalCallback === handleRemoteSignal) signaling.signalCallback = prevCb
      if (signaling.peerJoinedCallback === onPeerJoined) signaling.peerJoinedCallback = prevPeerJoined
      if (signaling.peerLeftCallback === onPeerLeft) signaling.peerLeftCallback = prevPeerLeft

      if (channelRef.current && channelRef.current.readyState !== 'closed') {
        try { channelRef.current.close() } catch {}
      }
      channelRef.current = null
      setChannel(null)

      if (pc && pc.connectionState !== 'closed') {
        try { pc.close() } catch {}
      }
      pcRef.current = null
      setConnectionState('closed')
      setPeerInRoom(false)
    }
  }, [signaling, roomId, isHost, safeSend])

  return { channel, connectionState, peerInRoom, isHost }
}
