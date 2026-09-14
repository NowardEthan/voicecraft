/**
 * useLiveKitRoom — voice room over LiveKit SFU (Discord-style multi-party).
 * Keeps the same public shape as useVoiceRoom for VoiceRoomView.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Room,
  RoomEvent,
  ParticipantEvent,
  Track,
  LocalVideoTrack,
  LocalAudioTrack,
  createLocalTracks,
  ConnectionState,
} from 'livekit-client'
import { useSettings } from '../../../settings'
import { resolvePerfProfile } from '../../../../shared/perf/perfProfile'
import { enumerateMics, watchDeviceChanges } from '../../../../utils/devices'
import { flashToast } from '../../../../shared/utils/toast'
import { playCallSound, unlockCallSounds, configureCallSounds } from '../../../../shared/audio/callSounds'
import { useScreenShare, looksLikeBrowserWindow } from '../../../../hooks/useScreenShare'
import { startAppLoopbackCapture } from '../../../../hooks/appLoopbackCapture'
import { getSharedSignaling } from '../../../../shared/connection/useSignaling'
import { makeActivityEvent } from './useVoiceRoom'
import {
  sessionKey as liveKitSessionKey,
  acquireSession,
  releaseSession,
  disposeSessionNow,
} from './liveKitSession'
import {
  clampPeerVolume,
  loadPeerVolumes,
  savePeerVolumes,
  peerVolumeMultiplier,
  PEER_VOLUME_DEFAULT,
} from './peerVolumes'
import { getLiveKitToken } from './livekitPrefetch'

async function fetchLiveKitToken(payload) {
  return getLiveKitToken(payload)
}

/** Wait until LiveKit room is fully connected (not just reconnecting). */
function waitForRoomConnected(lkRoom, timeoutMs = 20000) {
  if (!lkRoom) return Promise.reject(new Error('Sala LiveKit indisponível'))
  if (lkRoom.state === ConnectionState.Connected) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      lkRoom.off(RoomEvent.ConnectionStateChanged, onState)
      reject(new Error('LiveKit ainda reconectando — tente compartilhar de novo'))
    }, timeoutMs)
    const onState = (state) => {
      if (state === ConnectionState.Connected) {
        clearTimeout(timer)
        lkRoom.off(RoomEvent.ConnectionStateChanged, onState)
        resolve()
      }
    }
    lkRoom.on(RoomEvent.ConnectionStateChanged, onState)
    if (lkRoom.state === ConnectionState.Connected) {
      clearTimeout(timer)
      lkRoom.off(RoomEvent.ConnectionStateChanged, onState)
      resolve()
    }
  })
}

function screenSharePreset(quality, framerate) {
  // Conservative bitrates — encode competes with the game on CPU even when the UI uses GPU.
  const table = {
    '540p': { maxBitrate: 700_000, maxFramerate: 15 },
    '720p': { maxBitrate: 1_100_000, maxFramerate: 24 },
    '1080p': { maxBitrate: 2_200_000, maxFramerate: 30 },
    '1440p': { maxBitrate: 2_500_000, maxFramerate: 15 },
    '4k': { maxBitrate: 3_500_000, maxFramerate: 15 },
  }
  const base = table[quality] || table['720p']
  const fr = Math.max(8, Math.min(Number(framerate) || 15, base.maxFramerate))
  // Scale bitrate gently with fps so 15fps stays cheap.
  const bitrate = Math.round(base.maxBitrate * (0.65 + 0.35 * (fr / base.maxFramerate)))
  return {
    encoding: {
      maxBitrate: bitrate,
      maxFramerate: fr,
    },
  }
}

function resolveShareDefaults(settings) {
  const profile = resolvePerfProfile(settings?.perfMode || 'auto')
  const budgets = profile.budgets
  const mode = settings?.perfMode || 'auto'
  // Auto: hardware tier owns share quality. Manual modes: Video tab, then budgets.
  const quality = mode === 'auto'
    ? (budgets.shareQuality || '720p')
    : (settings?.screenQuality || budgets.shareQuality || '720p')
  const framerate = mode === 'auto'
    ? (budgets.shareFps || 15)
    : (settings?.screenFramerate || budgets.shareFps || 15)
  const videoCodec = budgets.videoCodec === 'h264' ? 'h264' : 'vp8'
  return { quality, framerate, videoCodec, profile }
}

async function waitForVideoDimensions(mediaTrack, timeoutMs = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { width, height } = mediaTrack.getSettings?.() || {}
    if (width > 0 && height > 0) return
    await new Promise((r) => setTimeout(r, 50))
  }
}

export function useLiveKitRoom({
  room,
  space,
  currentUserId,
  currentUserName,
  onLeave,
  onInvite,
  onStatusChange,
}) {
  const sig = getSharedSignaling()
  const [settings] = useSettings()
  const shareDefaultsRef = useRef(resolveShareDefaults(settings))
  shareDefaultsRef.current = resolveShareDefaults(settings)
  const screenShare = useScreenShare()
  const preferredMicId = settings?.microphoneId || settings?.inputDeviceId || null
  const soundsEnabled = settings?.callSounds !== false
  const soundVol = settings?.outputVolume ?? 80
  const soundOptsRef = useRef({ enabled: soundsEnabled, volume: soundVol })
  soundOptsRef.current = { enabled: soundsEnabled, volume: soundVol }

  const sfx = useCallback((name) => {
    playCallSound(name, soundOptsRef.current)
  }, [])

  useEffect(() => {
    configureCallSounds(soundOptsRef.current)
  }, [soundsEnabled, soundVol])

  const [localStream, setLocalStream] = useState(null)
  const [connectionState, setConnectionState] = useState('connecting')
  const [signalingConnected, setSignalingConnected] = useState(false)
  const [peerInRoom, setPeerInRoom] = useState(false)
  const [error, setError] = useState(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({})
  const [remoteCameras, setRemoteCameras] = useState({})
  const [isMuted, setIsMuted] = useState(false)
  const [isDeafened, setIsDeafened] = useState(false)
  const [mics, setMics] = useState([])
  const [activeDeviceId, setActiveDeviceId] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [selfSpeaking, setSelfSpeaking] = useState(false)
  const [remoteSpeaking, setRemoteSpeaking] = useState({})
  const [cameraOn, setCameraOn] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [joinPhase, setJoinPhase] = useState('token')
  // Identities currently in the LiveKit room (and/or Firestore peers doc).
  const [livePeerIds, setLivePeerIds] = useState([])
  const [activity, setActivity] = useState(() => [
    makeActivityEvent({
      kind: 'self-joined',
      userId: currentUserId,
      displayName: currentUserName || 'você',
    }),
  ])

  const syncLivePeers = useCallback((lkRoom) => {
    const lkIds = lkRoom
      ? [...lkRoom.remoteParticipants.values()].map((p) => p.identity).filter(Boolean)
      : []
    setLivePeerIds((prev) => [...new Set([...lkIds, ...prev])])
    setPeerInRoom(lkIds.length > 0)
  }, [])

  const joinedAtRef = useRef(Date.now())
  const roomRef = useRef(null)
  const localAudioTrackRef = useRef(null)
  const localVideoTrackRef = useRef(null)
  const localScreenTrackRef = useRef(null)
  const localScreenAudioTrackRef = useRef(null)
  const appLoopbackStopRef = useRef(null)
  const screenPublishingRef = useRef(false)
  const callReadyRef = useRef(false)
  const remoteAudiosRef = useRef(new Map())
  const [peerVolumes, setPeerVolumes] = useState(() => loadPeerVolumes())
  const peerVolumesRef = useRef(peerVolumes)
  peerVolumesRef.current = peerVolumes
  const initCancelledRef = useRef(false)
  const isMutedRef = useRef(false)
  const isDeafenedRef = useRef(false)
  // Desktop loopback re-captures call playback. Mute remotes unless user says they use headphones.
  const screenAudioCaptureRef = useRef({ active: false, headphones: false })

  isMutedRef.current = isMuted
  isDeafenedRef.current = isDeafened

  // Firestore peers collection — survives presence `online` flicker.
  useEffect(() => {
    const offJoined = sig.onPeerJoined?.((msg) => {
      const id = msg.peerId || msg.userId
      if (!id || id === currentUserId) return
      setLivePeerIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setPeerInRoom(true)
    })
    const offLeft = sig.onPeerLeft?.((msg) => {
      const id = msg.peerId || msg.userId
      if (!id) return
      setLivePeerIds((prev) => {
        const next = prev.filter((x) => x !== id)
        // Keep anyone still in LiveKit.
        const lk = roomRef.current
        if (lk) {
          for (const p of lk.remoteParticipants.values()) {
            if (p.identity && !next.includes(p.identity)) next.push(p.identity)
          }
        }
        setPeerInRoom(next.length > 0)
        return next
      })
    })
    return () => { offJoined?.(); offLeft?.() }
  }, [sig, currentUserId])

  const pushActivity = useCallback((evt) => {
    setActivity((prev) => [evt, ...prev].slice(0, 30))
  }, [])

  const applyOutputToAudio = useCallback((audio) => {
    if (!audio) return
    const master = Math.max(0, Math.min(100, Number(settings?.outputVolume ?? 80))) / 100
    const peerMul = peerVolumeMultiplier(peerVolumesRef.current, audio.dataset?.vcPeer)
    const vol = Math.min(1, master * peerMul)
    // Without headphones, mute remote *mic* playback while capturing system audio —
    // otherwise loopback sends their voice back (echo). Screen-audio track still plays.
    const cap = screenAudioCaptureRef.current
    const duckMic = !!(cap?.active && !cap?.headphones && audio.dataset?.vcSource !== 'screen')
    audio.volume = (isDeafenedRef.current || duckMic) ? 0 : vol
    if (typeof audio.setSinkId === 'function') {
      audio.setSinkId(settings?.speakerId || '').catch(() => {})
    }
  }, [settings?.outputVolume, settings?.speakerId])

  const refreshRemoteAudioLevels = useCallback(() => {
    remoteAudiosRef.current.forEach((audio) => applyOutputToAudio(audio))
  }, [applyOutputToAudio])

  const setParticipantVolume = useCallback((userId, value) => {
    if (!userId) return
    const nextVol = clampPeerVolume(value)
    const next = { ...peerVolumesRef.current }
    if (nextVol === PEER_VOLUME_DEFAULT) delete next[userId]
    else next[userId] = nextVol
    peerVolumesRef.current = next
    savePeerVolumes(next)
    setPeerVolumes(next)
    remoteAudiosRef.current.forEach((audio) => {
      if (audio?.dataset?.vcPeer === userId) applyOutputToAudio(audio)
    })
  }, [applyOutputToAudio])

  const setScreenAudioCaptureActive = useCallback((active, opts = {}) => {
    screenAudioCaptureRef.current = {
      active: !!active,
      headphones: !!(active && opts.headphones),
    }
    refreshRemoteAudioLevels()
  }, [refreshRemoteAudioLevels])

  useEffect(() => {
    remoteAudiosRef.current.forEach((audio) => applyOutputToAudio(audio))
  }, [applyOutputToAudio, isDeafened])

  useEffect(() => {
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - joinedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    let cancelled = false
    enumerateMics().then((list) => {
      if (!cancelled) setMics(list)
    }).catch(() => {})
    const stop = watchDeviceChanges(() => {
      enumerateMics().then((list) => {
        if (!cancelled) setMics(list)
      }).catch(() => {})
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  const detachRemoteAudio = useCallback((participantIdentity, trackSid) => {
    const key = `${participantIdentity}:${trackSid || 'audio'}`
    const audio = remoteAudiosRef.current.get(key)
    if (!audio) return
    remoteAudiosRef.current.delete(key)
    try { audio.pause() } catch {}
    audio.srcObject = null
  }, [])

  const attachRemoteAudio = useCallback((participant, track) => {
    if (!track || track.kind !== Track.Kind.Audio) return
    const key = `${participant.identity}:${track.sid || 'audio'}`
    detachRemoteAudio(participant.identity, track.sid)
    const audio = new Audio()
    try {
      audio.dataset.vcPeer = participant.identity || ''
      audio.dataset.vcSource = track.source === Track.Source.ScreenShareAudio ? 'screen' : 'mic'
    } catch {}
    track.attach(audio)
    applyOutputToAudio(audio)
    remoteAudiosRef.current.set(key, audio)
    audio.play().catch(() => {})
  }, [applyOutputToAudio, detachRemoteAudio])

  // ---- Connect ----------------------------------------------------------
  useEffect(() => {
    if (!room?.id || !currentUserId) return undefined

    const key = liveKitSessionKey(space?.id, room.id, currentUserId)
    const session = acquireSession(key)
    initCancelledRef.current = false

    const reuse =
      session.room
      && session.room.state !== ConnectionState.Disconnected
      && session.audioTrack

    if (!reuse) {
      setError(null)
      setPermissionDenied(false)
      setConnectionState('connecting')
      setJoinPhase('token')
      callReadyRef.current = false
      setSignalingConnected(false)
      setPeerInRoom(false)
    }

    const share = resolveShareDefaults(settings)
    const lkRoom = session.room || new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: false,
      // Keep trying through brief media/DNS blips (common on Windows + VPN).
      reconnectPolicy: {
        nextRetryDelayInMs: (context) => {
          if (context.retryCount > 12) return null
          return Math.min(1000 * 2 ** context.retryCount, 10_000)
        },
      },
      publishDefaults: {
        backupCodec: false,
        simulcast: false,
        // H.264 when tier allows (HW encode on Windows); VP8 on low.
        videoCodec: share.videoCodec,
        screenShareEncoding: screenSharePreset(share.quality, share.framerate).encoding,
      },
      audioCaptureDefaults: {
        deviceId: preferredMicId || undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    session.room = lkRoom
    roomRef.current = lkRoom

    const onCpuConstrained = (track) => {
      try {
        console.warn('[livekit] LocalTrackCpuConstrained — lowering encode')
        if (track && typeof track.prioritizePerformance === 'function') {
          track.prioritizePerformance()
        }
        flashToast('CPU limitada — qualidade da tela reduzida', { duration: 2200 })
      } catch (err) {
        console.warn('[livekit] cpu constrain handler', err?.message || err)
      }
    }
    try {
      lkRoom.localParticipant?.on?.(ParticipantEvent.LocalTrackCpuConstrained, onCpuConstrained)
    } catch { /* older SDK */ }

    const onConnection = () => {
      const s = lkRoom.state
      if (s === ConnectionState.Connected || s === 'connected') {
        if (callReadyRef.current || session.audioTrack) {
          callReadyRef.current = true
          setConnectionState('connected')
          setJoinPhase('ready')
          setSignalingConnected(true)
        }
      } else if (s === ConnectionState.Reconnecting || s === 'reconnecting'
        || s === ConnectionState.Connecting || s === 'connecting') {
        const reconnecting = s === ConnectionState.Reconnecting || s === 'reconnecting'
        setConnectionState(reconnecting ? 'reconnecting' : 'connecting')
        if (reconnecting && callReadyRef.current) {
          setJoinPhase('reconnecting')
          sfx('reconnect')
        }
      } else if (s === ConnectionState.Disconnected || s === 'disconnected') {
        // Stay in reconnecting UI briefly — LiveKit may still recover.
        if (callReadyRef.current) {
          setConnectionState('reconnecting')
          setJoinPhase('reconnecting')
        } else {
          setConnectionState('disconnected')
        }
      }
    }

    const onDisconnected = (reason) => {
      console.warn('[useLiveKitRoom] disconnected', reason)
      if (callReadyRef.current) {
        setConnectionState('reconnecting')
        setJoinPhase('reconnecting')
      }
    }

    const onParticipantConnected = (p) => {
      syncLivePeers(lkRoom)
      if (callReadyRef.current) sfx('peerJoin')
      pushActivity(makeActivityEvent({
        kind: 'peer-joined',
        userId: p.identity,
        displayName: p.name || p.identity,
      }))
    }
    const onParticipantDisconnected = (p) => {
      if (callReadyRef.current) sfx('peerLeave')
      pushActivity(makeActivityEvent({
        kind: 'peer-left',
        userId: p.identity,
        displayName: p.name || p.identity,
      }))
      setLivePeerIds((prev) => {
        const lkIds = [...lkRoom.remoteParticipants.values()].map((x) => x.identity).filter(Boolean)
        const next = [...new Set(lkIds)]
        setPeerInRoom(next.length > 0)
        return next
      })
      setRemoteSpeaking((prev) => {
        if (!(p.identity in prev)) return prev
        const next = { ...prev }
        delete next[p.identity]
        return next
      })
      setRemoteCameras((prev) => {
        if (!(p.identity in prev)) return prev
        const next = { ...prev }
        delete next[p.identity]
        return next
      })
      setRemoteScreenStreams((prev) => {
        if (!(p.identity in prev)) return prev
        const next = { ...prev }
        delete next[p.identity]
        return next
      })
    }

    const onTrackSubscribed = (track, _pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        attachRemoteAudio(participant, track)
        return
      }
      if (track.kind === Track.Kind.Video) {
        const media = new MediaStream([track.mediaStreamTrack])
        if (track.source === Track.Source.ScreenShare) {
          setRemoteScreenStreams((prev) => ({ ...prev, [participant.identity]: media }))
        } else {
          setRemoteCameras((prev) => ({ ...prev, [participant.identity]: media }))
        }
      }
    }

    const onTrackUnsubscribed = (track, _pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        detachRemoteAudio(participant.identity, track.sid)
        return
      }
      if (track.kind === Track.Kind.Video) {
        if (track.source === Track.Source.ScreenShare) {
          setRemoteScreenStreams((prev) => {
            if (!(participant.identity in prev)) return prev
            const next = { ...prev }
            delete next[participant.identity]
            return next
          })
        } else {
          setRemoteCameras((prev) => {
            if (!(participant.identity in prev)) return prev
            const next = { ...prev }
            delete next[participant.identity]
            return next
          })
        }
      }
    }

    const onActiveSpeakers = (speakers) => {
      const map = {}
      let self = false
      for (const p of speakers) {
        if (p.identity === currentUserId) self = true
        else map[p.identity] = true
      }
      setSelfSpeaking(self)
      setRemoteSpeaking(map)
    }

    lkRoom
      .on(RoomEvent.ConnectionStateChanged, onConnection)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers)

    const markReady = (audioTrack, { playJoin } = {}) => {
      localAudioTrackRef.current = audioTrack || session.audioTrack || null
      if (localAudioTrackRef.current) {
        const t = localAudioTrackRef.current
        const ms = t.mediaStream || new MediaStream([t.mediaStreamTrack])
        setLocalStream(ms)
        const settingsId = t.mediaStreamTrack?.getSettings?.()?.deviceId
        if (settingsId) setActiveDeviceId(settingsId)
      }
      for (const p of lkRoom.remoteParticipants.values()) {
        for (const pub of p.trackPublications.values()) {
          if (pub.track) onTrackSubscribed(pub.track, pub, p)
        }
      }
      syncLivePeers(lkRoom)
      callReadyRef.current = true
      setJoinPhase('ready')
      setConnectionState('connected')
      setSignalingConnected(true)
      joinedAtRef.current = session.joinedAt || Date.now()
      if (playJoin) sfx('join')
    }

    ;(async () => {
      try {
        if (reuse && lkRoom.state === ConnectionState.Connected) {
          markReady(session.audioTrack, { playJoin: false })
          return
        }

        // Previous connect finished but PC died — allow a fresh connect.
        if (session.connectPromise && lkRoom.state === ConnectionState.Disconnected) {
          session.connectPromise = null
        }

        if (!session.connectPromise) {
          session.connectPromise = (async () => {
            setJoinPhase('connecting')
            // Token mint + mic open in parallel — biggest join win.
            const tokenPromise = fetchLiveKitToken({
              spaceId: space?.id || null,
              roomId: room.id,
              identity: currentUserId,
              displayName: currentUserName || 'você',
            })

            let audioTrack = session.audioTrack
            const micPromise = audioTrack
              ? Promise.resolve(audioTrack)
              : createLocalTracks({
                audio: preferredMicId ? { deviceId: preferredMicId } : true,
                video: false,
              }).then((tracks) => {
                const t = tracks.find((x) => x.kind === Track.Kind.Audio) || null
                session.audioTrack = t
                return t
              })

            setJoinPhase('token')
            const [{ token, url }, track] = await Promise.all([tokenPromise, micPromise])
            audioTrack = track

            setJoinPhase('connecting')
            if (lkRoom.state !== ConnectionState.Connected) {
              await lkRoom.connect(url, token, {
                autoSubscribe: true,
                peerConnectionTimeout: 45_000,
                websocketTimeout: 20_000,
                maxRetries: 3,
              })
            }

            setJoinPhase('publishing')
            if (audioTrack) {
              const already = [...lkRoom.localParticipant.trackPublications.values()]
                .some((pub) => pub.track === audioTrack)
              if (!already) {
                if (isMutedRef.current) await audioTrack.mute()
                await lkRoom.localParticipant.publishTrack(audioTrack)
              }
            }
            session.joinedAt = Date.now()
            return audioTrack
          })().catch((err) => {
            session.connectPromise = null
            throw err
          })
        }

        const audioTrack = await session.connectPromise
        if (initCancelledRef.current) return
        markReady(audioTrack, { playJoin: !reuse })
      } catch (err) {
        if (initCancelledRef.current) return
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setPermissionDenied(true)
        }
        console.warn('[useLiveKitRoom]', err)
        callReadyRef.current = false
        setError(err?.message || 'Falha ao entrar na call LiveKit')
        setConnectionState('failed')
        setJoinPhase('failed')
        sfx('error')
        disposeSessionNow(key)
      }
    })()

    return () => {
      initCancelledRef.current = true
      try {
        lkRoom.localParticipant?.off?.(ParticipantEvent.LocalTrackCpuConstrained, onCpuConstrained)
      } catch {}
      try {
        lkRoom
          .off(RoomEvent.ConnectionStateChanged, onConnection)
          .off(RoomEvent.Disconnected, onDisconnected)
          .off(RoomEvent.ParticipantConnected, onParticipantConnected)
          .off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
          .off(RoomEvent.TrackSubscribed, onTrackSubscribed)
          .off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
          .off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers)
      } catch {}

      remoteAudiosRef.current.forEach((audio) => {
        try { audio.pause() } catch {}
        audio.srcObject = null
      })
      remoteAudiosRef.current.clear()
      setRemoteScreenStreams({})
      setRemoteCameras({})

      // Do NOT stop mic / disconnect here — releaseSession defers dispose so
      // remounts (Strict Mode / navigation flicker) keep the same PC alive.
      releaseSession(key, {
        delayMs: 800,
        onDispose: () => {
          try { localVideoTrackRef.current?.stop() } catch {}
          try { localScreenTrackRef.current?.stop() } catch {}
          try { localScreenAudioTrackRef.current?.stop() } catch {}
          localVideoTrackRef.current = null
          localScreenTrackRef.current = null
          localScreenAudioTrackRef.current = null
          try { screenShare.stop() } catch {}
        },
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, space?.id, currentUserId])

  const handleToggleMute = useCallback(async () => {
    const next = !isMutedRef.current
    setIsMuted(next)
    sfx(next ? 'mute' : 'unmute')
    const track = localAudioTrackRef.current
    try {
      if (track) {
        if (next) await track.mute()
        else await track.unmute()
      }
    } catch {
      flashToast('Não deu pra alterar o mute')
    }
  }, [sfx])

  const handleToggleDeafen = useCallback(() => {
    setIsDeafened((d) => {
      const next = !d
      sfx(next ? 'deafen' : 'undeafen')
      if (next && !isMutedRef.current) {
        setIsMuted(true)
        localAudioTrackRef.current?.mute?.().catch(() => {})
      }
      return next
    })
  }, [sfx])

  const handleLeave = useCallback(() => {
    onLeave?.()
  }, [onLeave])

  const handlePickDevice = useCallback(async (deviceId) => {
    if (!deviceId || deviceId === activeDeviceId) return
    const lkRoom = roomRef.current
    if (!lkRoom) return
    try {
      const tracks = await createLocalTracks({
        audio: { deviceId },
        video: false,
      })
      const audioTrack = tracks.find((t) => t.kind === Track.Kind.Audio)
      if (!audioTrack) return
      const prev = localAudioTrackRef.current
      if (prev) {
        try { await lkRoom.localParticipant.unpublishTrack(prev) } catch {}
        try { prev.stop() } catch {}
      }
      localAudioTrackRef.current = audioTrack
      setLocalStream(audioTrack.mediaStream || new MediaStream([audioTrack.mediaStreamTrack]))
      if (isMutedRef.current) await audioTrack.mute()
      await lkRoom.localParticipant.publishTrack(audioTrack)
      setActiveDeviceId(deviceId)
    } catch (err) {
      flashToast(`erro ao trocar microfone: ${err.message || 'desconhecido'}`)
    }
  }, [activeDeviceId])

  const handleToggleCamera = useCallback(async () => {
    const lkRoom = roomRef.current
    if (!lkRoom) return
    try {
      if (localVideoTrackRef.current) {
        try { await lkRoom.localParticipant.unpublishTrack(localVideoTrackRef.current) } catch {}
        try { localVideoTrackRef.current.stop() } catch {}
        localVideoTrackRef.current = null
        setCameraOn(false)
        return
      }
      const tracks = await createLocalTracks({ audio: false, video: true })
      const videoTrack = tracks.find((t) => t.kind === Track.Kind.Video)
      if (!videoTrack) return
      localVideoTrackRef.current = videoTrack
      await lkRoom.localParticipant.publishTrack(videoTrack)
      setCameraOn(true)
    } catch (err) {
      flashToast(err?.message || 'Falha ao ligar a câmera')
    }
  }, [])

  const ensureLocalMicHealthy = useCallback(async () => {
    const lkRoom = roomRef.current
    const mic = localAudioTrackRef.current
    if (!lkRoom || !mic || lkRoom.state !== ConnectionState.Connected) return
    try {
      const mst = mic.mediaStreamTrack
      if (mst && mst.readyState === 'ended') {
        // Desktop loopback can disrupt the capture graph on Windows — reacquire mic.
        const tracks = await createLocalTracks({
          audio: { deviceId: activeDeviceId || undefined },
          video: false,
        })
        const next = tracks.find((t) => t.kind === Track.Kind.Audio)
        if (!next) return
        try { await lkRoom.localParticipant.unpublishTrack(mic) } catch {}
        try { mic.stop() } catch {}
        localAudioTrackRef.current = next
        setLocalStream(next.mediaStream || new MediaStream([next.mediaStreamTrack]))
        if (isMutedRef.current) await next.mute()
        await lkRoom.localParticipant.publishTrack(next)
        return
      }
      const pub = lkRoom.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (!pub?.track) {
        if (isMutedRef.current) await mic.mute()
        else await mic.unmute()
        await lkRoom.localParticipant.publishTrack(mic)
        return
      }
      if (!isMutedRef.current && mic.isMuted) await mic.unmute()
    } catch (err) {
      console.warn('[screenShare] mic health check failed', err?.message || err)
    }
  }, [activeDeviceId])

  const stopScreenShare = useCallback(async () => {
    const lkRoom = roomRef.current
    const videoTrack = localScreenTrackRef.current
    const audioTrack = localScreenAudioTrackRef.current
    localScreenTrackRef.current = null
    localScreenAudioTrackRef.current = null
    screenPublishingRef.current = false
    setScreenSharing(false)
    setScreenAudioCaptureActive(false)
    const stopLoop = appLoopbackStopRef.current
    appLoopbackStopRef.current = null
    if (stopLoop) {
      try { await stopLoop() } catch {}
    }
    const connected = lkRoom?.state === ConnectionState.Connected
    for (const track of [videoTrack, audioTrack]) {
      if (!track) continue
      try {
        if (connected) await lkRoom.localParticipant.unpublishTrack(track, true)
      } catch {}
      try { track.stop() } catch {}
    }
    try { screenShare.stop() } catch {}
  }, [screenShare, setScreenAudioCaptureActive])

  const publishScreenStream = useCallback(async (mediaStream, opts = {}) => {
    const lkRoom = roomRef.current
    if (!lkRoom || !mediaStream) return
    if (screenPublishingRef.current) return
    screenPublishingRef.current = true

    const mediaTrack = mediaStream.getVideoTracks()[0]
    if (!mediaTrack) {
      screenPublishingRef.current = false
      throw new Error('Nenhuma faixa de vídeo na captura')
    }

    try {
      // LiveKit rejects publish while signal is down; wait for a real Connected state.
      await waitForRoomConnected(lkRoom)
      await waitForVideoDimensions(mediaTrack)

      try { mediaTrack.contentHint = 'motion' } catch {}

      // Electron supplies the MediaStreamTrack; userProvided=true so LK won't reacquire.
      const localTrack = new LocalVideoTrack(mediaTrack, undefined, true)
      const share = resolveShareDefaults(settings)
      const q = share.quality
      const fr = share.framerate
      const codec = share.videoCodec
      const preset = screenSharePreset(q, fr)

      mediaTrack.addEventListener('ended', () => {
        if (localScreenTrackRef.current) stopScreenShare()
      })

      const publication = await lkRoom.localParticipant.publishTrack(localTrack, {
        source: Track.Source.ScreenShare,
        name: 'screen',
        simulcast: false,
        backupCodec: false,
        videoCodec: codec,
        screenShareEncoding: {
          maxBitrate: preset.encoding.maxBitrate,
          maxFramerate: preset.encoding.maxFramerate,
        },
        // Prefer smooth frames over sharpness while the sharer is also gaming.
        degradationPreference: 'maintain-framerate',
      })

      localScreenTrackRef.current = publication?.track || localTrack

      // App audio (Discord-style): WASAPI per-PID — does not re-capture call playback,
      // so we keep hearing friends (headphones=true, no duck).
      if (opts.audioMode === 'app' && opts.appPid) {
        try {
          const loop = await startAppLoopbackCapture(opts.appPid)
          appLoopbackStopRef.current = loop.stop
          try { loop.audioTrack.contentHint = 'music' } catch {}
          const localAudio = new LocalAudioTrack(loop.audioTrack, undefined, true)
          localAudio.source = Track.Source.ScreenShareAudio
          const audioPub = await lkRoom.localParticipant.publishTrack(localAudio, {
            source: Track.Source.ScreenShareAudio,
            name: 'screen-audio',
            dtx: false,
            red: true,
          })
          localScreenAudioTrackRef.current = audioPub?.track || localAudio
          const systemFallback = loop.mode === 'system'
          setScreenAudioCaptureActive(true, { headphones: !systemFallback })
          flashToast(systemFallback
            ? 'Áudio capturado (fallback do sistema) — call fica muda no PC pra evitar eco'
            : 'Áudio do aplicativo capturado — você continua ouvindo a call')
          await ensureLocalMicHealthy()
        } catch (audioErr) {
          console.warn('[screenShare] app loopback failed', audioErr?.message || audioErr)
          setScreenAudioCaptureActive(false)
          flashToast(audioErr?.message || 'Não deu pra capturar áudio do app — vídeo segue')
          await ensureLocalMicHealthy()
        }
      } else {
      // System / display audio — separate LiveKit source from the mic.
      // Loopback is system-wide (not per-app); exclusive-mode games often stay silent.
      const audioMedia = mediaStream.getAudioTracks().find((t) => t && t.readyState !== 'ended') || null
      if (audioMedia) {
        try { audioMedia.contentHint = 'music' } catch {}
        audioMedia.addEventListener('ended', async () => {
          // Drop only screen-audio; keep the video share and the mic.
          const lk = roomRef.current
          const at = localScreenAudioTrackRef.current
          localScreenAudioTrackRef.current = null
          setScreenAudioCaptureActive(false)
          if (at && lk) {
            try { await lk.localParticipant.unpublishTrack(at, true) } catch {}
            try { at.stop() } catch {}
          }
        })
        try {
          const localAudio = new LocalAudioTrack(audioMedia, undefined, true)
          localAudio.source = Track.Source.ScreenShareAudio
          const audioPub = await lkRoom.localParticipant.publishTrack(localAudio, {
            source: Track.Source.ScreenShareAudio,
            name: 'screen-audio',
            dtx: false,
            red: true,
          })
          localScreenAudioTrackRef.current = audioPub?.track || localAudio
          const headphones = opts.headphones === true
          setScreenAudioCaptureActive(true, { headphones })
          flashToast(headphones
            ? 'Áudio do sistema + fones — se ouvir eco, desmarque "Estou de fones" e compartilhe de novo'
            : 'Áudio do sistema: call muda no seu PC pra não ter eco (marque "Estou de fones" pra ouvir)')
          // Windows loopback can disturb the mic graph; keep voice on the call.
          await ensureLocalMicHealthy()
        } catch (audioErr) {
          console.warn('[screenShare] failed to publish display audio', audioErr?.message || audioErr)
          try { audioMedia.stop() } catch {}
          setScreenAudioCaptureActive(false)
          flashToast('Não deu pra capturar áudio do sistema — seu mic segue normal')
          await ensureLocalMicHealthy()
        }
      } else {
        setScreenAudioCaptureActive(false)
      }
      }

      setScreenSharing(true)
    } catch (err) {
      localScreenTrackRef.current = null
      localScreenAudioTrackRef.current = null
      setScreenAudioCaptureActive(false)
      setScreenSharing(false)
      try { mediaTrack.stop() } catch {}
      mediaStream.getAudioTracks().forEach((t) => {
        try { t.stop() } catch {}
      })
      throw err
    } finally {
      screenPublishingRef.current = false
    }
  }, [settings, stopScreenShare, setScreenAudioCaptureActive, ensureLocalMicHealthy])

  const handleShareScreen = useCallback(async () => {
    const lkRoom = roomRef.current
    if (!lkRoom) return
    try {
      if (localScreenTrackRef.current || screenShare.stream || screenSharing) {
        await stopScreenShare()
        return
      }
      if (lkRoom.state !== ConnectionState.Connected) {
        flashToast('Aguarde a call conectar antes de compartilhar')
        return
      }
      const share = resolveShareDefaults(settings)
      const q = share.quality
      const fr = share.framerate
      // Electron: opens picker (returns null). Browser: getDisplayMedia stream.
      const started = await screenShare.start(q, fr, { withAudio: false })
      if (started) await publishScreenStream(started)
    } catch (err) {
      const msg = err?.message || 'Falha ao compartilhar a tela'
      flashToast(msg.includes('engine') ? 'Falha ao publicar a tela — tente de novo' : msg)
      try { await stopScreenShare() } catch {}
    }
  }, [screenShare, settings, stopScreenShare, publishScreenStream, screenSharing])

  const handlePickShareSource = useCallback(async (sourceId, opts = {}) => {
    try {
      const lkRoom = roomRef.current
      if (!lkRoom || lkRoom.state !== ConnectionState.Connected) {
        flashToast('Aguarde a call conectar antes de compartilhar')
        try { screenShare.stop() } catch {}
        return
      }
      const source = screenShare.availableSources.find((s) => s.id === sourceId)
      if (source && !source.isScreen && looksLikeBrowserWindow(source.name)) {
        flashToast('Janela de navegador pode ficar cinza ao focar o VoiceCraft. Prefira a tela inteira.')
      }
      const share = resolveShareDefaults(settings)
      const q = share.quality
      const fr = share.framerate
      const audioMode = opts.audioMode || (opts.withAudio ? 'system' : 'off')
      // Only full-system share uses desktop loopback (re-captures call → needs duck/headphones).
      const withDesktopAudio = audioMode === 'system' && opts.withAudio === true
      const headphones = audioMode === 'app' || (withDesktopAudio && opts.headphones === true)
      const started = await screenShare.startWithSource(sourceId, q, fr, { withAudio: withDesktopAudio })
      if (started) await publishScreenStream(started, {
        headphones,
        audioMode,
        appPid: opts.appPid,
      })
    } catch (err) {
      const msg = err?.message || 'Falha ao compartilhar a tela'
      flashToast(msg.includes('engine') ? 'Falha ao publicar a tela — tente de novo' : msg)
      try { await stopScreenShare() } catch {}
    }
  }, [screenShare, settings, publishScreenStream, stopScreenShare])

  const handleCancelSharePicker = useCallback(() => {
    screenShare.stop()
  }, [screenShare])

  useEffect(() => {
    if (!onStatusChange) return
    if (error) onStatusChange(`Erro: ${error}`)
    else if (permissionDenied) onStatusChange('Permissão de microfone negada')
    else if (joinPhase === 'reconnecting' || connectionState === 'reconnecting') {
      onStatusChange('Reconectando…')
    }
    else if (joinPhase === 'ready' && connectionState === 'connected') onStatusChange('Conectado')
    else if (connectionState === 'failed' || joinPhase === 'failed') onStatusChange('Falha na conexão')
    else if (joinPhase === 'token') onStatusChange('Preparando a chamada…')
    else if (joinPhase === 'mic') onStatusChange('Preparando microfone…')
    else if (joinPhase === 'connecting') onStatusChange('Entrando na sala…')
    else if (joinPhase === 'publishing') onStatusChange('Ativando áudio…')
    else onStatusChange('Conectando…')
  }, [error, permissionDenied, connectionState, joinPhase, onStatusChange])

  const isCallReady = joinPhase === 'ready' && connectionState === 'connected'

  return {
    localStream,
    isMuted,
    isDeafened,
    connectionState,
    joinPhase,
    isCallReady,
    signalingConnected,
    peerInRoom,
    error,
    permissionDenied,
    elapsed,
    mics,
    activeDeviceId,
    selfSpeaking,
    activity,
    handleToggleMute,
    handleToggleDeafen,
    handlePickDevice,
    handleShareScreen,
    handleToggleCamera,
    handlePickShareSource,
    handleCancelSharePicker,
    sendThought: () => false,
    screenSharing: screenSharing || !!screenShare.stream,
    screenStream: screenShare.stream,
    remoteScreenStreams,
    cameraOn,
    cameraStream: localVideoTrackRef.current?.mediaStream || null,
    remoteCameras,
    shareNeedsPicker: screenShare.needsPicker,
    shareSources: screenShare.availableSources,
    remoteSpeaking,
    livePeerIds,
    peerVolumes,
    setParticipantVolume,
    onLeave: handleLeave,
    onInvite,
  }
}
