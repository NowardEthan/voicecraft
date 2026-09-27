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
import { startAppLoopbackCapture, startSystemLoopbackCapture } from '../../../../hooks/appLoopbackCapture'
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
  const lastSpeakerUpdateRef = useRef(0)
  const pendingSpeakersTimerRef = useRef(null)
  const roomRef = useRef(null)
  const localAudioTrackRef = useRef(null)
  const activeSessionRef = useRef(null)
  const micMutedBeforeDeafenRef = useRef(false)
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

  const applyOutputToAudio = useCallback(async (audio) => {
    if (!audio) return
    const master = Math.max(0, Math.min(100, Number(settings?.outputVolume ?? 80))) / 100
    const peerMul = peerVolumeMultiplier(peerVolumesRef.current, audio.dataset?.vcPeer)
    audio.volume = isDeafenedRef.current ? 0 : Math.min(1, master * peerMul)
    if (typeof audio.setSinkId === 'function') {
      try {
        await audio.setSinkId(settings?.speakerId || '')
      } catch {
        // A removed/invalid output device must not permanently block playback.
        try { await audio.setSinkId('') } catch {}
      }
    }
  }, [settings?.outputVolume, settings?.speakerId])

  const playRemoteAudio = useCallback(async (audio) => {
    if (!audio) return
    await applyOutputToAudio(audio)
    try { await roomRef.current?.startAudio?.() } catch {}
    try {
      await audio.play()
    } catch {
      if (typeof audio.setSinkId === 'function') {
        try { await audio.setSinkId('') } catch {}
      }
      try { await roomRef.current?.startAudio?.() } catch {}
      try { await audio.play() } catch {}
    }
  }, [applyOutputToAudio])

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


  useEffect(() => {
    remoteAudiosRef.current.forEach((audio) => applyOutputToAudio(audio))
  }, [applyOutputToAudio, isDeafened])

  useEffect(() => {
    const retryPlayback = () => {
      remoteAudiosRef.current.forEach((audio) => { void playRemoteAudio(audio) })
    }
    window.addEventListener('pointerdown', retryPlayback)
    window.addEventListener('keydown', retryPlayback)
    return () => {
      window.removeEventListener('pointerdown', retryPlayback)
      window.removeEventListener('keydown', retryPlayback)
    }
  }, [playRemoteAudio])

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

  const remoteAudioKey = useCallback((participantIdentity, publication, track) => (
    `${participantIdentity}:${publication?.trackSid || publication?.sid || track?.sid || 'audio'}`
  ), [])

  const detachRemoteAudio = useCallback((participantIdentity, publication, track) => {
    const key = remoteAudioKey(participantIdentity, publication, track)
    const audio = remoteAudiosRef.current.get(key)
    if (!audio) return
    remoteAudiosRef.current.delete(key)
    try { track?.detach?.(audio) } catch {}
    try { audio.pause() } catch {}
    audio.srcObject = null
  }, [remoteAudioKey])

  const attachRemoteAudio = useCallback((participant, track, publication) => {
    if (!track || track.kind !== Track.Kind.Audio) return
    const key = remoteAudioKey(participant.identity, publication, track)
    detachRemoteAudio(participant.identity, publication, track)
    const audio = new Audio()
    try {
      audio.dataset.vcPeer = participant.identity || ''
      audio.dataset.vcSource = track.source === Track.Source.ScreenShareAudio ? 'screen' : 'mic'
    } catch {}
    track.attach(audio)
    remoteAudiosRef.current.set(key, audio)
    void playRemoteAudio(audio)
  }, [detachRemoteAudio, playRemoteAudio, remoteAudioKey])

  // ---- Connect ----------------------------------------------------------
  useEffect(() => {
    if (!room?.id || !currentUserId) return undefined

    const key = liveKitSessionKey(space?.id, room.id, currentUserId)
    const session = acquireSession(key)
    activeSessionRef.current = session
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
      for (const [key, audio] of remoteAudiosRef.current) {
        if (!key.startsWith(p.identity + ':')) continue
        remoteAudiosRef.current.delete(key)
        try { audio.pause() } catch {}
        audio.srcObject = null
      }
    }

    const onTrackSubscribed = (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        attachRemoteAudio(participant, track, publication)
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

    const onTrackUnsubscribed = (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        detachRemoteAudio(participant.identity, publication, track)
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
      const applyUpdate = (speakerList) => {
        const map = {}
        let self = false
        for (const p of speakerList) {
          if (p.identity === currentUserId) self = true
          else map[p.identity] = true
        }
        setSelfSpeaking(self)
        setRemoteSpeaking(map)
      }

      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      const delta = now - lastSpeakerUpdateRef.current
      if (delta >= 50) {
        if (pendingSpeakersTimerRef.current) {
          clearTimeout(pendingSpeakersTimerRef.current)
          pendingSpeakersTimerRef.current = null
        }
        lastSpeakerUpdateRef.current = now
        applyUpdate(speakers)
      } else {
        if (!pendingSpeakersTimerRef.current) {
          pendingSpeakersTimerRef.current = setTimeout(() => {
            pendingSpeakersTimerRef.current = null
            lastSpeakerUpdateRef.current = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
            applyUpdate(speakers)
          }, Math.max(0, 50 - delta))
        }
      }
    }

    const retryRemotePlayback = () => {
      remoteAudiosRef.current.forEach((audio) => { void playRemoteAudio(audio) })
    }

    lkRoom
      .on(RoomEvent.ConnectionStateChanged, onConnection)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers)
      .on(RoomEvent.AudioPlaybackStatusChanged, retryRemotePlayback)

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
      if (pendingSpeakersTimerRef.current) {
        clearTimeout(pendingSpeakersTimerRef.current)
        pendingSpeakersTimerRef.current = null
      }
      try {
        lkRoom
          .off(RoomEvent.ConnectionStateChanged, onConnection)
          .off(RoomEvent.Disconnected, onDisconnected)
          .off(RoomEvent.ParticipantConnected, onParticipantConnected)
          .off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
          .off(RoomEvent.TrackSubscribed, onTrackSubscribed)
          .off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
          .off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers)
          .off(RoomEvent.AudioPlaybackStatusChanged, retryRemotePlayback)
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
      if (activeSessionRef.current === session) activeSessionRef.current = null
      releaseSession(key, {
        delayMs: 800,
        onDispose: () => {
          const stopLoop = appLoopbackStopRef.current
          appLoopbackStopRef.current = null
          if (stopLoop) void stopLoop().catch(() => {})
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
    isMutedRef.current = next
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

  const handleToggleDeafen = useCallback(async () => {
    const next = !isDeafenedRef.current
    isDeafenedRef.current = next
    setIsDeafened(next)
    sfx(next ? 'deafen' : 'undeafen')
    if (next) {
      micMutedBeforeDeafenRef.current = isMutedRef.current
      if (!isMutedRef.current) {
        isMutedRef.current = true
        setIsMuted(true)
        try { await localAudioTrackRef.current?.mute?.() } catch {}
      }
    } else if (!micMutedBeforeDeafenRef.current) {
      isMutedRef.current = false
      setIsMuted(false)
      try { await localAudioTrackRef.current?.unmute?.() } catch {}
    }
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
      if (activeSessionRef.current) activeSessionRef.current.audioTrack = audioTrack
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
        if (activeSessionRef.current) activeSessionRef.current.audioTrack = next
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

  useEffect(() => {
    const verifyMic = () => { void ensureLocalMicHealthy() }
    const timer = setInterval(verifyMic, 5000)
    return () => clearInterval(timer)
  }, [ensureLocalMicHealthy])

  const stopScreenShare = useCallback(async () => {
    const lkRoom = roomRef.current
    const videoTrack = localScreenTrackRef.current
    const audioTrack = localScreenAudioTrackRef.current
    localScreenTrackRef.current = null
    localScreenAudioTrackRef.current = null
    screenPublishingRef.current = false
    setScreenSharing(false)
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
    await ensureLocalMicHealthy()
  }, [screenShare, ensureLocalMicHealthy])

  const publishScreenStream = useCallback(async (mediaStream, opts = {}) => {
    const lkRoom = roomRef.current
    if (!lkRoom || !mediaStream) return
    if (screenPublishingRef.current) return
    screenPublishingRef.current = true

    const mediaTrack = mediaStream.getVideoTracks()[0]
    if (!mediaTrack) {
      screenPublishingRef.current = false
      throw new Error('Nenhuma faixa de video na captura')
    }

    const audioMode = opts.audioMode || 'off'
    if (!['off', 'app', 'system-excluding-voice'].includes(audioMode)) {
      screenPublishingRef.current = false
      throw new Error('Modo de audio de compartilhamento incompativel')
    }
    if (audioMode === 'app' && (!Number.isInteger(Number(opts.appPid)) || Number(opts.appPid) <= 0)) {
      screenPublishingRef.current = false
      throw new Error('Selecione um aplicativo valido para compartilhar audio')
    }

    let loop = null
    let localVideo = null
    let localAudio = null
    try {
      await waitForRoomConnected(lkRoom)
      await waitForVideoDimensions(mediaTrack)

      // Requested audio is validated before anything is published. There is no
      // desktop-capture or system-wide fallback for app mode.
      if (audioMode === 'app') loop = await startAppLoopbackCapture(Number(opts.appPid))
      else if (audioMode === 'system-excluding-voice') loop = await startSystemLoopbackCapture()
      if (loop) appLoopbackStopRef.current = loop.stop

      try { mediaTrack.contentHint = 'motion' } catch {}
      localVideo = new LocalVideoTrack(mediaTrack, undefined, true)
      const share = resolveShareDefaults(settings)
      const preset = screenSharePreset(share.quality, share.framerate)
      const videoPublication = await lkRoom.localParticipant.publishTrack(localVideo, {
        source: Track.Source.ScreenShare,
        name: 'screen',
        simulcast: false,
        backupCodec: false,
        videoCodec: share.videoCodec,
        screenShareEncoding: {
          maxBitrate: preset.encoding.maxBitrate,
          maxFramerate: preset.encoding.maxFramerate,
        },
        degradationPreference: 'maintain-framerate',
      })
      localScreenTrackRef.current = videoPublication?.track || localVideo

      mediaTrack.addEventListener('ended', () => {
        if (localScreenTrackRef.current) void stopScreenShare()
      }, { once: true })

      if (loop) {
        try { loop.audioTrack.contentHint = 'music' } catch {}
        loop.audioTrack.addEventListener('ended', () => {
          if (localScreenAudioTrackRef.current) void stopScreenShare()
        }, { once: true })
        localAudio = new LocalAudioTrack(loop.audioTrack, undefined, true)
        localAudio.source = Track.Source.ScreenShareAudio
        const audioPublication = await lkRoom.localParticipant.publishTrack(localAudio, {
          source: Track.Source.ScreenShareAudio,
          name: 'screen-audio',
          dtx: false,
          red: true,
        })
        localScreenAudioTrackRef.current = audioPublication?.track || localAudio
        flashToast(audioMode === 'app'
          ? 'Audio do aplicativo validado e compartilhado'
          : 'Audio do sistema compartilhado, excluindo o VoiceCraft')
      } else {
          }

      setScreenSharing(true)
      await ensureLocalMicHealthy()
    } catch (err) {
      // Audio-requested sharing is transactional: roll back video, native audio,
      // and renderer capture if any validation or publication step fails.
      const publishedAudio = localScreenAudioTrackRef.current || localAudio
      const publishedVideo = localScreenTrackRef.current || localVideo
      localScreenAudioTrackRef.current = null
      localScreenTrackRef.current = null
        setScreenSharing(false)
      for (const track of [publishedAudio, publishedVideo]) {
        if (!track) continue
        try { await lkRoom.localParticipant.unpublishTrack(track, true) } catch {}
        try { track.stop() } catch {}
      }
      const stopLoop = appLoopbackStopRef.current || loop?.stop
      appLoopbackStopRef.current = null
      if (stopLoop) {
        try { await stopLoop() } catch {}
      }
      try { screenShare.stop() } catch {}
      try { mediaTrack.stop() } catch {}
      await ensureLocalMicHealthy()
      throw err
    } finally {
      screenPublishingRef.current = false
    }
  }, [settings, stopScreenShare, ensureLocalMicHealthy, screenShare])

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
      const started = await screenShare.start(share.quality, share.framerate)
      if (started) await publishScreenStream(started, { audioMode: 'off' })
    } catch (err) {
      const msg = err?.message || 'Falha ao compartilhar a tela'
      flashToast(msg.includes('engine') ? 'Falha ao publicar a tela - tente de novo' : msg)
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
      const source = screenShare.availableSources.find((item) => item.id === sourceId)
      if (source && !source.isScreen && looksLikeBrowserWindow(source.name)) {
        flashToast('Janela de navegador pode ficar cinza ao focar o Voice. Prefira a tela inteira.')
      }
      const audioMode = opts.audioMode || 'off'
      if (!['off', 'app', 'system-excluding-voice'].includes(audioMode)) {
        throw new Error('Modo de audio de compartilhamento incompativel')
      }
      const share = resolveShareDefaults(settings)
      const started = await screenShare.startWithSource(sourceId, share.quality, share.framerate)
      if (started) await publishScreenStream(started, {
        audioMode,
        appPid: opts.appPid,
      })
    } catch (err) {
      const msg = err?.message || 'Falha ao compartilhar a tela'
      flashToast(msg.includes('engine') ? 'Falha ao publicar a tela - tente de novo' : msg)
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
