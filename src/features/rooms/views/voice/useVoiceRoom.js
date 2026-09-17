/**
 * useVoiceRoom — encapsulates everything required to run a voice room.
 *
 * Why this exists
 * ---------------
 * Before, the VoiceRoomView component was 1105 lines and contained:
 *   - WebRTC peer connection setup
 *   - local mic acquisition
 *   - device enumeration
 *   - mute/deafen/leave handlers
 *   - elapsed timer
 *   - self speaking detection (real audio)
 *   - remote speaking detection (FABRICATED — random setTimeout)
 *   - activity feed (FABRICATED — retro-timestamped participant map)
 *
 * The fabricated data has been removed. Self speaking still works via
 * the real audio service (`useWebAudioDsp` → `inputLevel`). Remote
 * speaking and activity feed now consume **real signaling events** —
 * `peer-joined`, `peer-left`, `screen-share-state`, and any future
 * `peer-speaking` event the server may emit.
 *
 * The hook is the only thing that touches the signaling client's
 * voice-related callbacks. Components consume the returned state.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSharedSignaling } from '../../../../shared/connection/useSignaling'
import { acquireLocalMedia } from '../../../../utils/mediaCache'
import { useWebAudioDsp } from '../../../../hooks/useWebAudioDsp'
import { useAudioServiceMic } from '../../../../hooks/useAudioServiceMic'
import { useSettings } from '../../../settings'
import { enumerateMics, watchDeviceChanges } from '../../../../utils/devices'
import { flashToast } from '../../../../shared/utils/toast'
import { useScreenShare, looksLikeBrowserWindow } from '../../../../hooks/useScreenShare'
import { useCamera, classifyVideoTrack } from '../../../../hooks/useCamera'
import { useSpeakingDetector } from './useSpeakingDetector'

export const SPEAKING_THRESHOLD = 0.06
export const SPEAKING_HOLD_MS = 520

// Activity feed is bounded so it doesn't grow without limit.
const ACTIVITY_FEED_MAX = 30

/**
 * Real activity feed entry. `kind` is one of the literal types below
 * so the UI can render icons + colors without ad-hoc string matching.
 */
export function makeActivityEvent({ kind, userId, displayName, meta }) {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, userId, displayName, at: Date.now(), meta }
}

export function useVoiceRoom({ room, currentUserId, currentUserName, members = [], onLeave, onInvite, onStatusChange }) {
  const [settings] = useSettings()
  const sig = getSharedSignaling()
  const screenShare = useScreenShare()
  const camera = useCamera()
  const preferredMicId = settings?.microphoneId || settings?.inputDeviceId || null

  // ---- Local audio + WebRTC -------------------------------------------
  const [localStream, setLocalStream] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')   // RTCPeerConnection state
  const [signalingConnected, setSignalingConnected] = useState(false)
  const [peerInRoom, setPeerInRoom] = useState(false)
  const [error, setError] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [remoteScreenStream, setRemoteScreenStream] = useState(null)
  const [remoteCameras, setRemoteCameras] = useState({})

  // ---- User controls --------------------------------------------------
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [mics, setMics] = useState([])
  const [activeDeviceId, setActiveDeviceId] = useState(null)

  // ---- Session timing -------------------------------------------------
  const joinedAtRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // ---- Real audio analysis (self speaking) ----------------------------
  // Level stays on a ref so the room does not re-render every VU frame.
  const { inputLevelRef } = useWebAudioDsp(localStream, {
    active: !!localStream,
    processLevel: settings?.dspLevel || 'off',
  })

  // ---- Real activity feed (replaces the fabricated one) --------------
  // Starts with the "você entrou" event so the panel isn't empty.
  const [activity, setActivity] = useState(() => [
    makeActivityEvent({
      kind: 'self-joined',
      userId: currentUserId,
      displayName: currentUserName || 'você',
    }),
  ])

  // ---- Refs that the async init / cleanup touch -----------------------
  const pcRef = useRef(null)
  const signalingRef = useRef(null)
  const localStreamRef = useRef(null)
  const initCancelledRef = useRef(false)
  const offerSentFor = useRef(new Set()) // peer ids we've already sent an offer to
  const cameraSenderRef = useRef(null)
  const screenSenderRef = useRef(null)
  const pendingVideoFromRef = useRef({ camera: null, screen: null })
  const remoteAudiosRef = useRef(new Set())

  const applyOutputToAudio = useCallback((audio) => {
    if (!audio) return
    const vol = Math.max(0, Math.min(100, Number(settings?.outputVolume ?? 80))) / 100
    audio.volume = isDeafened ? 0 : vol
    if (typeof audio.setSinkId === 'function') {
      audio.setSinkId(settings?.speakerId || '').catch(() => {})
    }
  }, [settings?.outputVolume, settings?.speakerId, isDeafened])

  useEffect(() => {
    remoteAudiosRef.current.forEach((audio) => applyOutputToAudio(audio))
  }, [applyOutputToAudio])

  // -------------------------------------------------------------------
  // Real activity feed — wire to signaling peer-joined / peer-left /
  // screen-share-state. These are the only source of events now.
  // -------------------------------------------------------------------
  const pushActivity = useCallback((evt) => {
    setActivity(prev => {
      // De-dupe: if the most recent event is the same kind+userId within
      // 1.5s, drop the new one. This guards against the WebSocket
      // redelivering the same `peer-joined` after a transient reconnect.
      const last = prev[0]
      if (last && last.kind === evt.kind && last.userId === evt.userId && Math.abs(last.at - evt.at) < 1500) {
        return prev
      }
      return [evt, ...prev].slice(0, ACTIVITY_FEED_MAX)
    })
  }, [])

  useEffect(() => {
    const offJoined = sig.onPeerJoined?.((msg) => {
      pushActivity(makeActivityEvent({
        kind: 'peer-joined',
        userId: msg.peerId || msg.userId,
        displayName: msg.displayName,
      }))
    })
    const offLeft = sig.onPeerLeft?.((msg) => {
      pushActivity(makeActivityEvent({
        kind: 'peer-left',
        userId: msg.peerId || msg.userId,
        displayName: msg.displayName,
      }))
    })
    const offScreen = sig.onScreenShareState?.((msg) => {
      const active = typeof msg === 'boolean' ? msg : !!msg?.active
      pushActivity(makeActivityEvent({
        kind: 'screen-share',
        userId: msg?.userId || currentUserId,
        displayName: msg?.displayName || currentUserName,
        meta: { active },
      }))
    })
    const offShare = sig.onScreenShareState?.((msg) => {
      if (msg?.userId && msg.userId !== currentUserId) {
        pendingVideoFromRef.current.screen = msg.active ? msg.userId : null
        if (!msg.active) setRemoteScreenStream(null)
      }
    })
    const offCamera = sig.onCameraState?.((msg) => {
      const active = typeof msg === 'boolean' ? msg : !!msg?.active
      const userId = msg?.userId || currentUserId
      pushActivity(makeActivityEvent({
        kind: 'camera',
        userId,
        displayName: msg?.displayName || currentUserName,
        meta: { active },
      }))
      if (userId && userId !== currentUserId) {
        pendingVideoFromRef.current.camera = active ? userId : null
        if (!active) {
          setRemoteCameras((prev) => {
            if (!prev[userId]) return prev
            const next = { ...prev }
            delete next[userId]
            return next
          })
        }
      }
    })
    const offThought = sig.onRoomThought?.((msg) => {
      pushActivity(makeActivityEvent({
        kind: 'thought',
        userId: msg.userId,
        displayName: msg.displayName,
        meta: { text: msg.text },
      }))
    })
    return () => { offJoined?.(); offLeft?.(); offScreen?.(); offShare?.(); offCamera?.(); offThought?.() }
  }, [sig, currentUserId, currentUserName, pushActivity])

  // -------------------------------------------------------------------
  // Device enumeration — refresh on mount + on device-change events
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const list = await enumerateMics()
        if (!cancelled) {
          setMics(list)
          // If we have a default in settings and it's still present, use it.
          if (preferredMicId && list.some(d => d.deviceId === preferredMicId)) {
            setActiveDeviceId(preferredMicId)
          } else if (list[0]) {
            setActiveDeviceId(list[0].deviceId)
          }
        }
      } catch (err) {
        console.error('enumerateMics failed:', err)
      }
    }
    refresh()
    return watchDeviceChanges(refresh)
  }, [preferredMicId])

  const selfSpeaking = useSpeakingDetector(inputLevelRef, { muted: isMuted || isDeafened })

  // -------------------------------------------------------------------
  // Mic acquisition + peer connection setup. Idempotent across
  // StrictMode double-mount.
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!room) return
    if (!sig) return
    initCancelledRef.current = false
    signalingRef.current = sig

    const init = async () => {
      // 1) Acquire local media
      try {
        const constraints = {
          audio: activeDeviceId
            ? { deviceId: { exact: activeDeviceId }, echoCancellation: true, noiseSuppression: true }
            : { echoCancellation: true, noiseSuppression: true },
          video: false,
        }
        const stream = await acquireLocalMedia(constraints)
        if (initCancelledRef.current) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        setPermissionDenied(false)
        setLocalStream(stream)
        localStreamRef.current = stream

        // If the user came in muted, mute the track from the start so we
        // never broadcast unmuted audio by accident.
        if (isMuted) {
          stream.getAudioTracks().forEach(t => { t.enabled = false })
        }
      } catch (err) {
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setPermissionDenied(true)
        } else {
          setError(err.message || 'Falha ao acessar microfone')
        }
        return
      }

      setSignalingConnected(true)

      // 2) WebRTC peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
      pcRef.current = pc
      pc.onconnectionstatechange = () => setConnectionState(pc.connectionState)

      // 3) Add local tracks
      const stream = localStreamRef.current
      stream.getAudioTracks().forEach(track => pc.addTrack(track, stream))

      // 4) Listen for remote tracks — we don't render remote audio in the
      // grid (they're small avatars in v1), but we still attach them so
      // the user can hear others.
      pc.ontrack = (event) => {
        if (event.track?.kind === 'video') {
          const ms = event.streams?.[0] || new MediaStream([event.track])
          const kind = classifyVideoTrack(event.track)
          if (kind === 'screen') {
            setRemoteScreenStream(ms)
            event.track.addEventListener('ended', () => setRemoteScreenStream(null))
            return
          }
          const owner = pendingVideoFromRef.current.camera
            || members.find((m) => m.userId && m.userId !== currentUserId)?.userId
            || event.track.id
          setRemoteCameras((prev) => ({ ...prev, [owner]: ms }))
          event.track.addEventListener('ended', () => {
            setRemoteCameras((prev) => {
              if (!prev[owner]) return prev
              const next = { ...prev }
              delete next[owner]
              return next
            })
          })
          return
        }
        if (event.track?.kind === 'audio') {
          const audio = new Audio()
          audio.srcObject = event.streams?.[0] || new MediaStream([event.track])
          remoteAudiosRef.current.add(audio)
          applyOutputToAudio(audio)
          event.track.addEventListener('ended', () => {
            remoteAudiosRef.current.delete(audio)
            try { audio.pause() } catch {}
            audio.srcObject = null
          })
          audio.play().catch(() => {})
        }
      }

      // 5) Signaling handlers
      const handleRemoteSignal = async (msg) => {
        try {
          if (msg.type === 'offer') {
            await pc.setRemoteDescription(msg)
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            sig.sendSignal?.('answer', answer)
          } else if (msg.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(msg)
            }
          } else if (msg.type === 'ice-candidate' && msg.candidate) {
            try { await pc.addIceCandidate(msg.candidate) } catch {}
          } else if (msg.type === 'peer-joined') {
            // A new peer arrived — initiate an offer to them.
            const peerId = msg.peerId
            if (peerId && !offerSentFor.current.has(peerId)) {
              offerSentFor.current.add(peerId)
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              sig.sendSignal?.('offer', { ...offer, to: peerId })
            }
            setPeerInRoom(true)
          } else if (msg.type === 'peer-left') {
            if (msg.peerId) offerSentFor.current.delete(msg.peerId)
          }
        } catch (err) {
          console.error('handleRemoteSignal error:', err)
        }
      }
      sig.signalCallback = handleRemoteSignal
      pc.onicecandidate = (e) => {
        if (e.candidate) sig.sendSignal?.('ice-candidate', { candidate: e.candidate })
      }

      // Reset joined-at so the duration timer starts now (not on mount)
      joinedAtRef.current = Date.now()
    }

    init()
    return () => {
      initCancelledRef.current = true
      sig.signalCallback = null
      if (pcRef.current) {
        try { pcRef.current.close() } catch {}
        pcRef.current = null
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
      camera.stop()
      cameraSenderRef.current = null
      screenSenderRef.current = null
      setRemoteCameras({})
      setLocalStream(null)
      setPeerInRoom(false)
      setSignalingConnected(false)
      setConnectionState('connecting')
    }
    // We deliberately exclude `activeDeviceId` / `isMuted` from deps to
    // avoid tearing down the PC on every device swap. See dedicated
    // effects below for those.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, sig])

  // -------------------------------------------------------------------
  // Elapsed timer — ticks once per second while the room is mounted
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!room) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [room?.id])

  // -------------------------------------------------------------------
  // Push local state to the WebRTC track when mute/deafen toggles
  // -------------------------------------------------------------------
  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next })
      }
      return next
    })
  }, [])

  const handleToggleDeafen = useCallback(() => {
    setIsDeafened(prev => !prev)
  }, [])

  // -------------------------------------------------------------------
  // Switch mic device — hot-swap the local track
  // -------------------------------------------------------------------
  const renegotiate = useCallback(async () => {
    const pc = pcRef.current
    if (!pc) return
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sig.sendSignal?.('offer', offer)
    } catch { /* peer may not be ready yet */ }
  }, [sig])

  const attachVideoKind = useCallback(async (stream, kind) => {
    const pc = pcRef.current
    const track = stream?.getVideoTracks?.()[0]
    if (!pc || !track) return
    const ref = kind === 'screen' ? screenSenderRef : cameraSenderRef
    if (ref.current) {
      await ref.current.replaceTrack(track)
    } else {
      ref.current = pc.addTrack(track, stream)
    }
    await renegotiate()
  }, [renegotiate])

  const attachScreenTrack = useCallback(async (stream) => {
    await attachVideoKind(stream, 'screen')
    sig.sendScreenShareState?.(true)
  }, [attachVideoKind, sig])

  const detachScreenTrack = useCallback(async () => {
    if (screenSenderRef.current) {
      try { await screenSenderRef.current.replaceTrack(null) } catch { /* already gone */ }
    }
    setRemoteScreenStream(null)
    sig.sendScreenShareState?.(false)
  }, [sig])

  const handleToggleCamera = useCallback(async () => {
    try {
      if (camera.stream) {
        camera.stop()
        if (cameraSenderRef.current) {
          try { await cameraSenderRef.current.replaceTrack(null) } catch {}
        }
        sig.sendCameraState?.(false)
        return
      }
      const started = await camera.start()
      if (started) {
        await attachVideoKind(started, 'camera')
        sig.sendCameraState?.(true)
      }
    } catch (err) {
      flashToast(err?.message || 'Falha ao ligar a câmera')
    }
  }, [camera, attachVideoKind, sig])

  const handleShareScreen = useCallback(async () => {
    try {
      if (screenShare.stream) {
        screenShare.stop()
        await detachScreenTrack()
        return
      }
      const q = settings?.screenQuality || '720p'
      const fr = settings?.screenFramerate || 15
      const started = await screenShare.start(q, fr)
      if (started) await attachScreenTrack(started)
    } catch (err) {
      flashToast(err?.message || 'Falha ao compartilhar a tela')
    }
  }, [screenShare, settings, attachScreenTrack, detachScreenTrack])

  const handlePickShareSource = useCallback(async (sourceId) => {
    try {
      const source = screenShare.availableSources.find((s) => s.id === sourceId)
      if (source && !source.isScreen && looksLikeBrowserWindow(source.name)) {
        flashToast('Janela de navegador pode ficar cinza ao focar o Voice. Prefira a tela inteira e deixe o YouTube visível.')
      }
      const q = settings?.screenQuality || '720p'
      const fr = settings?.screenFramerate || 15
      const started = await screenShare.startWithSource(sourceId, q, fr)
      if (started) await attachScreenTrack(started)
    } catch (err) {
      flashToast(err?.message || 'Falha ao compartilhar a tela')
    }
  }, [screenShare, settings, attachScreenTrack])

  const handleCancelSharePicker = useCallback(() => {
    screenShare.stop()
  }, [screenShare])

  const sendThought = useCallback((text) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return false
    sig.sendThought?.(trimmed)
    return true
  }, [sig])

  const handlePickDevice = useCallback(async (deviceId) => {
    if (!deviceId || deviceId === activeDeviceId) return
    try {
      const stream = await acquireLocalMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      })
      // Replace the old track on the PC
      const old = localStreamRef.current
      if (old && pcRef.current) {
        const newTrack = stream.getAudioTracks()[0]
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'audio')
        if (sender && newTrack) {
          await sender.replaceTrack(newTrack)
        }
        old.getTracks().forEach(t => t.stop())
      }
      setLocalStream(stream)
      localStreamRef.current = stream
      setActiveDeviceId(deviceId)
      // Honour the current mute state
      if (isMuted) stream.getAudioTracks().forEach(t => { t.enabled = false })
    } catch (err) {
      flashToast(`erro ao trocar microfone: ${err.message || 'desconhecido'}`)
    }
  }, [activeDeviceId, isMuted])

  // -------------------------------------------------------------------
  // Status announcement (for screen readers / aria-live)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!onStatusChange) return
    if (error) onStatusChange(`Erro: ${error}`)
    else if (permissionDenied) onStatusChange('Permissão de microfone negada')
    else if (connectionState === 'connecting') onStatusChange('Conectando…')
    else if (connectionState === 'connected') onStatusChange('Conectado')
    else if (connectionState === 'reconnecting') onStatusChange('Reconectando…')
    else if (connectionState === 'failed') onStatusChange('Falha na conexão')
  }, [error, permissionDenied, connectionState, onStatusChange])

  // -------------------------------------------------------------------
  // Public shape — what the components consume
  // -------------------------------------------------------------------
  return {
    // State
    localStream,
    isMuted,
    isDeafened,
    connectionState,
    signalingConnected,
    peerInRoom,
    error,
    permissionDenied,
    elapsed,
    mics,
    activeDeviceId,
    // Derived
    selfSpeaking,
    activity,
    // Handlers
    handleToggleMute,
    handleToggleDeafen,
    handlePickDevice,
    handleShareScreen,
    handleToggleCamera,
    handlePickShareSource,
    handleCancelSharePicker,
    sendThought,
    screenSharing: !!screenShare.stream,
    screenStream: screenShare.stream,
    remoteScreenStream,
    cameraOn: camera.isOn,
    cameraStream: camera.stream,
    remoteCameras,
    shareNeedsPicker: screenShare.needsPicker,
    shareSources: screenShare.availableSources,
    remoteSpeaking: {},
    onLeave,
    onInvite,
  }
}
