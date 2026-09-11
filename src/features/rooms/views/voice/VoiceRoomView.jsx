/**
 * VoiceRoomView — top-level orchestrator for the voice room.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveKitRoom } from './useLiveKitRoom'
import { VoiceRoomHeader } from './components/VoiceRoomHeader'
import { ParticipantGrid } from './components/ParticipantGrid'
import { VoiceControlDock } from './components/VoiceControlDock'
import { ScreenSharePicker } from './components/ScreenSharePicker'
import { PermissionDeniedState } from './components/PermissionDeniedState'
import { CallConnectingState } from './components/CallConnectingState'
import { unlockCallSounds } from '../../../../shared/audio/callSounds'
import { resolveSpaceCover, spaceTokens } from '../../../spaces'
import { SpaceCoverLayer } from '../../../spaces/components/SpaceCoverLayer'
import { getRoomCover } from '../../model/roomCover'
import { getLocalMemberStatus, setLocalMemberStatus } from '../../../people'
import { getSharedSignaling } from '../../../../shared/connection/useSignaling'
import useReducedMotion from '../../../../hooks/useReducedMotion'

const CINEMA_IDLE_MS = 2400

export default function VoiceRoomView({
  room,
  space,
  signaling,
  currentUserId,
  currentUserName,
  members = [],
  onLeave,
  onInvite,
  onStatusChange,
  onOpenSettings,
}) {
  void signaling
  const reducedMotion = useReducedMotion()
  const sig = getSharedSignaling()
  const tokens = useMemo(() => spaceTokens(space), [space])
  const spaceCover = resolveSpaceCover(space)

  const [roomCover, setRoomCoverState] = useState(() => getRoomCover(room?.id))
  useEffect(() => { setRoomCoverState(getRoomCover(room?.id)) }, [room?.id])
  const handleCoverChange = (dataUrl) => setRoomCoverState(dataUrl)

  // Local personal override → shared room cover → space cover.
  const sharedRoomCover = room?.cover || null
  const atmosphere = roomCover || sharedRoomCover || spaceCover
  const atmosphereIsRoom = !!(roomCover || sharedRoomCover)
  const atmosphereSrc = roomCover || sharedRoomCover || spaceCover
  const atmosphereFit = roomCover
    ? null
    : sharedRoomCover
      ? (room?.coverFit || null)
      : space?.coverFit

  const [selfStatus, setSelfStatus] = useState(() => getLocalMemberStatus())
  useEffect(() => {
    const stored = getLocalMemberStatus()
    if (stored) sig.sendMemberStatus?.(stored)
  }, [sig, room?.id])

  const handleStatusChange = (next) => {
    const value = String(next || '').trim().slice(0, 40)
    setSelfStatus(value)
    setLocalMemberStatus(value)
    sig.sendMemberStatus?.(value)
  }

  const isCreator = space?.createdBy === currentUserId

  const {
    isMuted,
    isDeafened,
    connectionState,
    joinPhase,
    isCallReady,
    error,
    permissionDenied,
    elapsed,
    mics,
    activeDeviceId,
    selfSpeaking,
    remoteSpeaking,
    handleToggleMute,
    handleToggleDeafen,
    handlePickDevice,
    handleShareScreen,
    handleToggleCamera,
    handlePickShareSource,
    handleCancelSharePicker,
    screenSharing,
    screenStream,
    remoteScreenStreams,
    remoteCameras,
    cameraOn,
    cameraStream,
    shareNeedsPicker,
    shareSources,
    livePeerIds,
    peerVolumes,
    setParticipantVolume,
    onLeave: leaveWithSound,
  } = useLiveKitRoom({
    room,
    space,
    currentUserId,
    currentUserName,
    onLeave,
    onInvite,
    onStatusChange,
  })

  const participants = useMemo(() => {
    if (!room) return []
    const byId = new Map()

    const upsert = (row) => {
      if (!row?.userId || byId.has(row.userId)) return
      byId.set(row.userId, row)
    }

    const fromMember = (m, overrides = {}) => ({
      userId: m.userId,
      displayName: m.displayName,
      photoURL: m.photoURL,
      handle: m.handle,
      cover: m.cover,
      coverFit: m.coverFit,
      online: m.online !== false,
      roomName: m.roomName,
      isCreator: space?.createdBy === m.userId,
      status: m.userId === currentUserId ? selfStatus : (m.status || m.statusText || ''),
      ...overrides,
    })

    // Match People panel: roomId is enough (don't require online — presence flickers).
    for (const m of members) {
      if (m?.location?.roomId === room.id) upsert(fromMember(m))
    }

    // LiveKit / Firestore peers — keep cards even when presence lags.
    for (const id of livePeerIds || []) {
      if (!id || byId.has(id)) continue
      const m = members.find((x) => x.userId === id)
      if (m) upsert(fromMember(m, { online: true }))
      else {
        upsert({
          userId: id,
          displayName: id === currentUserId ? (currentUserName || 'você') : 'convidado',
          photoURL: '',
          online: true,
          isCreator: space?.createdBy === id,
          status: '',
        })
      }
    }

    if (currentUserId && !byId.has(currentUserId)) {
      const self = members.find((m) => m.userId === currentUserId)
      upsert({
        userId: currentUserId,
        displayName: currentUserName || self?.displayName || 'você',
        photoURL: self?.photoURL,
        handle: self?.handle,
        cover: self?.cover,
        coverFit: self?.coverFit,
        online: true,
        isCreator: space?.createdBy === currentUserId,
        status: selfStatus,
      })
    }

    return [...byId.values()]
  }, [members, room, space, currentUserId, currentUserName, selfStatus, livePeerIds])

  const screenShares = useMemo(() => {
    const list = []
    if (screenStream) {
      list.push({
        id: `self:${currentUserId || 'me'}`,
        stream: screenStream,
        isSelf: true,
        title: 'Você está compartilhando',
      })
    }
    for (const [userId, stream] of Object.entries(remoteScreenStreams || {})) {
      if (!stream) continue
      // Never mirror our own publish as a second "remote" tile.
      if (currentUserId && userId === currentUserId) continue
      const member = members.find((m) => m.userId === userId)
      const name = member?.displayName || userId
      list.push({
        id: `remote:${userId}`,
        stream,
        isSelf: false,
        title: `Tela · ${name}`,
      })
    }
    return list
  }, [screenStream, remoteScreenStreams, currentUserId, members])

  useEffect(() => {
    unlockCallSounds()
  }, [])

  // Cinema: shared screen fills the room; chrome overlays and auto-hides.
  const [cinemaMode, setCinemaMode] = useState(false)
  const [cinemaChrome, setCinemaChrome] = useState(true)
  const cinemaIdleRef = useRef(null)
  const chromePinnedRef = useRef(false)

  const clearCinemaIdle = useCallback(() => {
    if (cinemaIdleRef.current) {
      clearTimeout(cinemaIdleRef.current)
      cinemaIdleRef.current = null
    }
  }, [])

  const scheduleCinemaHide = useCallback(() => {
    clearCinemaIdle()
    if (!cinemaMode || chromePinnedRef.current) return
    cinemaIdleRef.current = setTimeout(() => {
      setCinemaChrome(false)
    }, CINEMA_IDLE_MS)
  }, [cinemaMode, clearCinemaIdle])

  const revealCinemaChrome = useCallback(() => {
    if (!cinemaMode) return
    setCinemaChrome(true)
    scheduleCinemaHide()
  }, [cinemaMode, scheduleCinemaHide])

  const pinCinemaChrome = useCallback((pinned) => {
    chromePinnedRef.current = pinned
    if (pinned) {
      setCinemaChrome(true)
      clearCinemaIdle()
    } else {
      scheduleCinemaHide()
    }
  }, [clearCinemaIdle, scheduleCinemaHide])

  useEffect(() => {
    if (!cinemaMode) {
      setCinemaChrome(true)
      chromePinnedRef.current = false
      clearCinemaIdle()
      return
    }
    setCinemaChrome(true)
    scheduleCinemaHide()
    return clearCinemaIdle
  }, [cinemaMode, clearCinemaIdle, scheduleCinemaHide])

  const showConnecting = !permissionDenied && !error && (
    joinPhase === 'reconnecting'
    || (!isCallReady && joinPhase !== 'failed' && joinPhase !== 'ready')
  )

  const chromeVisible = !cinemaMode || cinemaChrome
  const chromeMotion = reducedMotion
    ? ''
    : 'transition-[opacity,transform] duration-300 ease-out'

  if (!room) return null

  return (
    <div
      className="h-full w-full flex min-h-0 relative overflow-hidden bg-[#0d0a0c]"
      style={tokens}
    >
      <div
        className={[
          'relative z-10 flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden',
          cinemaMode && !chromeVisible ? 'cursor-none' : '',
        ].filter(Boolean).join(' ')}
        onMouseMove={cinemaMode ? revealCinemaChrome : undefined}
        onPointerDown={cinemaMode ? revealCinemaChrome : undefined}
      >
        {!cinemaMode && atmosphere && (
          <div aria-hidden className="absolute inset-0">
            {atmosphereIsRoom && roomCover ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${roomCover})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ) : (
              <SpaceCoverLayer src={atmosphereSrc} fit={atmosphereFit} />
            )}
          </div>
        )}
        {!cinemaMode && (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: atmosphere
                ? 'linear-gradient(180deg, rgba(13,10,12,0.55) 0%, rgba(13,10,12,0.88) 100%)'
                : 'radial-gradient(45% 40% at 8% 0%, color-mix(in srgb, var(--space-accent) 28%, transparent) 0%, transparent 60%),' +
                  'radial-gradient(40% 45% at 100% 100%, color-mix(in srgb, #ff8aa3 18%, transparent) 0%, transparent 55%),' +
                  'radial-gradient(60% 50% at 50% 50%, color-mix(in srgb, var(--space-accent) 6%, transparent) 0%, transparent 60%),' +
                  'linear-gradient(180deg, #1a0f14 0%, #15090d 50%, #0d0a0c 100%)',
            }}
          />
        )}
        {!cinemaMode && !atmosphere && (
          <div
            aria-hidden
            className="absolute top-20 right-8 z-[1] pointer-events-none select-none hidden lg:block"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontStyle: 'italic',
              fontWeight: 500,
              color: 'color-mix(in srgb, var(--space-accent) 35%, transparent)',
              fontSize: 'clamp(28px, 3.2vw, 44px)',
              lineHeight: 1.05,
              letterSpacing: '-0.01em',
              maxWidth: '300px',
              textAlign: 'right',
              transform: 'rotate(-3deg)',
            }}
          >
            Boas pessoas,<br />melhores dias
          </div>
        )}

        <div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0">
          {permissionDenied ? (
            <>
              <VoiceRoomHeader
                space={space}
                room={room}
                elapsed={elapsed}
                participantsCount={participants.length}
                connectionState={connectionState}
                roomCover={roomCover || sharedRoomCover}
                onCoverChange={handleCoverChange}
                onInvite={onInvite}
                onOpenSettings={onOpenSettings}
                onLeave={leaveWithSound}
              />
              <PermissionDeniedState onOpenSettings={() => window.open('chrome://settings/content/microphone', '_blank')} />
            </>
          ) : error ? (
            <>
              <VoiceRoomHeader
                space={space}
                room={room}
                elapsed={elapsed}
                participantsCount={participants.length}
                connectionState={connectionState}
                roomCover={roomCover || sharedRoomCover}
                onCoverChange={handleCoverChange}
                onInvite={onInvite}
                onOpenSettings={onOpenSettings}
                onLeave={leaveWithSound}
              />
              <div className="flex-1 flex items-center justify-center px-6">
                <div
                  role="alert"
                  className="max-w-md w-full rounded-[16px] border border-danger/30 bg-[#1a0f11]/85 backdrop-blur p-6 text-center"
                >
                  <p className="text-[14px] font-semibold text-strong">Erro na chamada</p>
                  <p className="text-[12.5px] text-muted mt-1.5">{error}</p>
                  <button
                    type="button"
                    onClick={leaveWithSound}
                    className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-accent text-strong text-[12.5px] font-semibold hover:scale-[1.03] active:scale-[0.97] transition-transform"
                  >
                    Sair da sala
                  </button>
                </div>
              </div>
            </>
          ) : showConnecting ? (
            <>
              <VoiceRoomHeader
                space={space}
                room={room}
                elapsed={elapsed}
                participantsCount={participants.length}
                connectionState={connectionState}
                roomCover={roomCover || sharedRoomCover}
                onCoverChange={handleCoverChange}
                onInvite={onInvite}
                onOpenSettings={onOpenSettings}
                onLeave={leaveWithSound}
              />
              <CallConnectingState
                roomName={room?.name}
                phase={joinPhase === 'reconnecting' ? 'reconnecting' : joinPhase}
                onLeave={leaveWithSound}
                reducedMotion={reducedMotion}
              />
            </>
          ) : (
            <>
              {/* Header — flow in normal mode, overlay in cinema */}
              <div
                className={[
                  cinemaMode
                    ? [
                      'absolute inset-x-0 top-0 z-20',
                      chromeMotion,
                      chromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none',
                    ].join(' ')
                    : 'relative z-20 shrink-0',
                ].filter(Boolean).join(' ')}
                onMouseEnter={cinemaMode ? () => pinCinemaChrome(true) : undefined}
                onMouseLeave={cinemaMode ? () => pinCinemaChrome(false) : undefined}
                onFocusCapture={cinemaMode ? () => pinCinemaChrome(true) : undefined}
                onBlurCapture={cinemaMode ? (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) pinCinemaChrome(false)
                } : undefined}
              >
                {cinemaMode && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/85 via-black/45 to-transparent"
                  />
                )}
                <VoiceRoomHeader
                  space={space}
                  room={room}
                  elapsed={elapsed}
                  participantsCount={participants.length}
                  connectionState={connectionState}
                  roomCover={roomCover || sharedRoomCover}
                  onCoverChange={handleCoverChange}
                  onInvite={onInvite}
                  onOpenSettings={onOpenSettings}
                  onLeave={leaveWithSound}
                  cinema={cinemaMode}
                />
              </div>

              {/* Stage — edge-to-edge under chrome when cinema */}
              <div className={cinemaMode ? 'absolute inset-0 z-0' : 'relative flex-1 min-h-0 flex flex-col'}>
                <ParticipantGrid
                  participants={participants}
                  currentUserId={currentUserId}
                  isCreator={isCreator}
                  selfSpeaking={selfSpeaking}
                  remoteSpeaking={remoteSpeaking}
                  selfMuted={isMuted}
                  reducedMotion={reducedMotion}
                  onInvite={onInvite}
                  onStatusChange={handleStatusChange}
                  screenShares={screenShares}
                  onStopShare={handleShareScreen}
                  chromeVisible={chromeVisible}
                  onImmersiveChange={setCinemaMode}
                  peerVolumes={peerVolumes}
                  onParticipantVolume={setParticipantVolume}
                  cameraStreams={{
                    ...remoteCameras,
                    ...(cameraStream && currentUserId ? { [currentUserId]: cameraStream } : {}),
                  }}
                />
              </div>

              <div
                className={[
                  'absolute inset-x-0 bottom-0 z-20 flex justify-center px-2 sm:px-4',
                  'pt-16 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6',
                  chromeMotion,
                  cinemaMode
                    ? (chromeVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3 pointer-events-none')
                    : 'pointer-events-none',
                ].filter(Boolean).join(' ')}
                onMouseEnter={cinemaMode ? () => pinCinemaChrome(true) : undefined}
                onMouseLeave={cinemaMode ? () => pinCinemaChrome(false) : undefined}
                onFocusCapture={cinemaMode ? () => pinCinemaChrome(true) : undefined}
                onBlurCapture={cinemaMode ? (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget)) pinCinemaChrome(false)
                } : undefined}
              >
                {cinemaMode && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
                  />
                )}
                <VoiceControlDock
                  isMuted={isMuted}
                  permissionDenied={permissionDenied}
                  onToggleMute={handleToggleMute}
                  mics={mics}
                  activeDeviceId={activeDeviceId}
                  onPickDevice={handlePickDevice}
                  isDeafened={isDeafened}
                  onToggleDeafen={handleToggleDeafen}
                  onShareScreen={handleShareScreen}
                  screenSharing={screenSharing}
                  onToggleCamera={handleToggleCamera}
                  cameraOn={cameraOn}
                  onLeave={leaveWithSound}
                  reducedMotion={reducedMotion}
                  mediaEnabled={isCallReady && !permissionDenied && !error}
                  cinema={cinemaMode}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <ScreenSharePicker
        open={!!shareNeedsPicker}
        sources={shareSources}
        onPick={handlePickShareSource}
        onClose={handleCancelSharePicker}
      />
    </div>
  )
}
