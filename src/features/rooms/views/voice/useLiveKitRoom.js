/**
 * useLiveKitRoom — voice room over LiveKit SFU (Discord-style multi-party).
 * Keeps the same public shape as useVoiceRoom for VoiceRoomView.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Room,
  RoomEvent,
  Track,
  LocalVideoTrack,
  createLocalTracks,
  ConnectionState,
  ScreenSharePresets,
} from 'livekit-client'
import { useSettings } from '../../../settings'
import { enumerateMics, watchDeviceChanges } from '../../../../utils/devices'
import { flashToast } from '../../../../shared/utils/toast'
import { playCallSound, unlockCallSounds, configureCallSounds } from '../../../../shared/audio/callSounds'
import { useScreenShare, looksLikeBrowserWindow } from '../../../../hooks/useScreenShare'
import { makeActivityEvent } from './useVoiceRoom'
import {
  sessionKey as liveKitSessionKey,
  acquireSession,
  releaseSession,
  disposeSessionNow,
} from './liveKitSession'

async function fetchLiveKitToken(payload) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.livekit : null
  if (!api?.getToken) {
    throw new Error('LiveKit só está disponível no app Electron.')
  }
  const res = await api.getToken(payload)
  if (!res?.ok) throw new Error(res?.error || 'Falha ao obter token LiveKit')
  return res
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
  const hi = quality === '1080p' || quality === '1440p' || quality === '4k'
  if (hi) return framerate >= 30 ? ScreenSharePresets.h1080fps30 : ScreenSharePresets.h1080fps15
  return framerate >= 30 ? ScreenSharePresets.h720fps30 : ScreenSharePresets.h720fps15
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
  const [settings] = useSettings()
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
  const [remoteScreenStream, setRemoteScreenStream] = useState(null)
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
  const [activity, setActivity] = useState(() => [
    makeActivityEvent({
      kind: 'self-joined',
      userId: currentUserId,
      displayName: currentUserName || 'você',
    }),
  ])

  const joinedAtRef = useRef(Date.now())
  const roomRef = useRef(null)
  const localAudioTrackRef = useRef(null)
  const localVideoTrackRef = useRef(null)
  const localScreenTrackRef = useRef(null)
  const screenPublishingRef = useRef(false)
  const callReadyRef = useRef(false)
  const remoteAudiosRef = useRef(new Map())
  const initCancelledRef = useRef(false)
  const isMutedRef = useRef(false)
  const isDeafenedRef = useRef(false)

  isMutedRef.current = isMuted
  isDeafenedRef.current = isDeafened

  const pushActivity = useCallback((evt) => {
    setActivity((prev) => [evt, ...prev].slice(0, 30))
  }, [])

  const applyOutputToAudio = useCallback((audio) => {
    if (!audio) return
    const vol = Math.max(0, Math.min(100, Number(settings?.outputVolume ?? 80))) / 100
    audio.volume = isDeafenedRef.current ? 0 : vol
    if (typeof audio.setSinkId === 'function') {
      audio.setSinkId(settings?.speakerId || '').catch(() => {})
    }
  }, [settings?.outputVolume, settings?.speakerId])

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
        videoCodec: 'vp8',
        screenShareEncoding: ScreenSharePresets.h720fps30.encoding,
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
      setPeerInRoom(true)
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
      const others = [...lkRoom.remoteParticipants.values()]
      setPeerInRoom(others.length > 0)
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
    }

    const onTrackSubscribed = (track, _pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        attachRemoteAudio(participant, track)
        return
      }
      if (track.kind === Track.Kind.Video) {
        const media = new MediaStream([track.mediaStreamTrack])
        if (track.source === Track.Source.ScreenShare) {
          setRemoteScreenStream(media)
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
          setRemoteScreenStream(null)
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
        setPeerInRoom(true)
        for (const pub of p.trackPublications.values()) {
          if (pub.track) onTrackSubscribed(pub.track, pub, p)
        }
      }
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
            setJoinPhase('token')
            const { token, url } = await fetchLiveKitToken({
              spaceId: space?.id || null,
              roomId: room.id,
              identity: currentUserId,
              displayName: currentUserName || 'você',
            })

            setJoinPhase('mic')
            let audioTrack = session.audioTrack
            if (!audioTrack) {
              const audioTracks = await createLocalTracks({
                audio: preferredMicId ? { deviceId: preferredMicId } : true,
                video: false,
              })
              audioTrack = audioTracks.find((t) => t.kind === Track.Kind.Audio) || null
              session.audioTrack = audioTrack
            }

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

      // Do NOT stop mic / disconnect here — releaseSession defers dispose so
      // remounts (Strict Mode / navigation flicker) keep the same PC alive.
      releaseSession(key, {
        delayMs: 800,
        onDispose: () => {
          try { localVideoTrackRef.current?.stop() } catch {}
          try { localScreenTrackRef.current?.stop() } catch {}
          localVideoTrackRef.current = null
          localScreenTrackRef.current = null
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

  const stopScreenShare = useCallback(async () => {
    const lkRoom = roomRef.current
    const track = localScreenTrackRef.current
    localScreenTrackRef.current = null
    screenPublishingRef.current = false
    setScreenSharing(false)
    if (track) {
      try {
        if (lkRoom?.state === ConnectionState.Connected) {
          await lkRoom.localParticipant.unpublishTrack(track, true)
        }
      } catch {}
      try { track.stop() } catch {}
    }
    try { screenShare.stop() } catch {}
  }, [screenShare])

  const publishScreenStream = useCallback(async (mediaStream) => {
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

      try { mediaTrack.contentHint = 'detail' } catch {}

      // Electron supplies the MediaStreamTrack; userProvided=true so LK won't reacquire.
      const localTrack = new LocalVideoTrack(mediaTrack, undefined, true)
      const q = settings?.screenQuality || '720p'
      const fr = settings?.screenFramerate || 30
      const preset = screenSharePreset(q, fr)

      mediaTrack.addEventListener('ended', () => {
        if (localScreenTrackRef.current) stopScreenShare()
      })

      const publication = await lkRoom.localParticipant.publishTrack(localTrack, {
        source: Track.Source.ScreenShare,
        name: 'screen',
        simulcast: false,
        backupCodec: false,
        videoCodec: 'vp8',
        screenShareEncoding: {
          maxBitrate: preset.encoding.maxBitrate,
          maxFramerate: Math.min(fr, preset.encoding.maxFramerate || fr),
        },
        degradationPreference: 'maintain-resolution',
      })

      localScreenTrackRef.current = publication?.track || localTrack
      setScreenSharing(true)
    } catch (err) {
      localScreenTrackRef.current = null
      setScreenSharing(false)
      try { mediaTrack.stop() } catch {}
      throw err
    } finally {
      screenPublishingRef.current = false
    }
  }, [settings, stopScreenShare])

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
      const q = settings?.screenQuality || '720p'
      const fr = settings?.screenFramerate || 30
      // Electron: opens picker (returns null). Browser: getDisplayMedia stream.
      const started = await screenShare.start(q, fr)
      if (started) await publishScreenStream(started)
    } catch (err) {
      const msg = err?.message || 'Falha ao compartilhar a tela'
      flashToast(msg.includes('engine') ? 'Falha ao publicar a tela — tente de novo' : msg)
      try { await stopScreenShare() } catch {}
    }
  }, [screenShare, settings, stopScreenShare, publishScreenStream, screenSharing])

  const handlePickShareSource = useCallback(async (sourceId) => {
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
      const q = settings?.screenQuality || '720p'
      const fr = settings?.screenFramerate || 30
      const started = await screenShare.startWithSource(sourceId, q, fr)
      if (started) await publishScreenStream(started)
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
    remoteScreenStream,
    cameraOn,
    cameraStream: localVideoTrackRef.current?.mediaStream || null,
    remoteCameras,
    shareNeedsPicker: screenShare.needsPicker,
    shareSources: screenShare.availableSources,
    remoteSpeaking,
    onLeave: handleLeave,
    onInvite,
  }
}
