/**
 * VoiceRoomView — top-level orchestrator for the voice room.
 */
import { useEffect, useMemo, useState } from 'react'
import { useVoiceRoom } from './useVoiceRoom'
import { VoiceRoomHeader } from './components/VoiceRoomHeader'
import { ParticipantGrid } from './components/ParticipantGrid'
import { VoiceControlDock } from './components/VoiceControlDock'
import { ScreenSharePicker } from './components/ScreenSharePicker'
import { RoomActivitySidebar } from './components/RoomActivitySidebar'
import { PermissionDeniedState } from './components/PermissionDeniedState'
import { resolveSpaceCover, spaceTokens } from '../../../spaces'
import { SpaceCoverLayer } from '../../../spaces/components/SpaceCoverLayer'
import { getRoomCover } from '../../model/roomCover'
import { getLocalMemberStatus, setLocalMemberStatus } from '../../../people'
import { getSharedSignaling } from '../../../../shared/connection/useSignaling'
import useReducedMotion from '../../../../hooks/useReducedMotion'

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
  rightSidebarOpen = true,
  sidebarOverlay = false,
  onRightSidebarClose,
}) {
  void signaling
  const reducedMotion = useReducedMotion()
  const sig = getSharedSignaling()
  const tokens = useMemo(() => spaceTokens(space), [space])
  const spaceCover = resolveSpaceCover(space)

  const [roomCover, setRoomCoverState] = useState(() => getRoomCover(room?.id))
  useEffect(() => { setRoomCoverState(getRoomCover(room?.id)) }, [room?.id])
  const handleCoverChange = (dataUrl) => setRoomCoverState(dataUrl)

  const [selfStatus, setSelfStatus] = useState(() => getLocalMemberStatus())
  useEffect(() => {
    const stored = getLocalMemberStatus()
    if (stored) sig.sendMemberStatus?.(stored)
  }, [sig, room?.id])

  const participants = useMemo(() => {
    if (!room) return []
    const inRoom = members
      .filter(m => m.online && m.location?.roomId === room.id)
      .map(m => ({
        userId: m.userId,
        displayName: m.displayName,
        photoURL: m.photoURL,
        handle: m.handle,
        cover: m.cover,
        coverFit: m.coverFit,
        online: m.online,
        roomName: m.roomName,
        isCreator: space?.createdBy === m.userId,
        status: m.userId === currentUserId ? selfStatus : (m.status || m.statusText || ''),
      }))
    if (inRoom.some(m => m.userId === currentUserId)) return inRoom
    const self = members.find(m => m.userId === currentUserId)
    return [
      {
        userId: currentUserId,
        displayName: currentUserName || self?.displayName || 'você',
        photoURL: self?.photoURL,
        handle: self?.handle,
        cover: self?.cover,
        coverFit: self?.coverFit,
        online: true,
        isCreator: space?.createdBy === currentUserId,
        status: selfStatus,
      },
      ...inRoom,
    ]
  }, [members, room, space, currentUserId, currentUserName, selfStatus])

  const isCreator = space?.createdBy === currentUserId

  const {
    isMuted,
    isDeafened,
    connectionState,
    error,
    permissionDenied,
    elapsed,
    mics,
    activeDeviceId,
    selfSpeaking,
    remoteSpeaking,
    activity,
    handleToggleMute,
    handleToggleDeafen,
    handlePickDevice,
    handleShareScreen,
    handleToggleCamera,
    handlePickShareSource,
    handleCancelSharePicker,
    sendThought,
    screenSharing,
    screenStream,
    remoteScreenStream,
    cameraOn,
    cameraStream,
    remoteCameras,
    shareNeedsPicker,
    shareSources,
    onLeave: _unusedLeave,
  } = useVoiceRoom({
    room,
    currentUserId,
    currentUserName,
    members,
    onLeave,
    onInvite,
    onStatusChange,
  })
  void _unusedLeave

  const atmosphere = roomCover || spaceCover

  const handleStatusChange = (next) => {
    const value = String(next || '').trim().slice(0, 40)
    setSelfStatus(value)
    setLocalMemberStatus(value)
    sig.sendMemberStatus?.(value)
  }

  if (!room) return null

  return (
    <div
      className="h-full w-full flex min-h-0 relative overflow-hidden bg-[#0d0a0c]"
      style={tokens}
    >
      <div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {atmosphere && (
          <div aria-hidden className="absolute inset-0">
            {roomCover ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${roomCover})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ) : (
              <SpaceCoverLayer src={spaceCover} fit={space?.coverFit} />
            )}
          </div>
        )}
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
        {!atmosphere && (
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
        <VoiceRoomHeader
          space={space}
          room={room}
          elapsed={elapsed}
          participantsCount={participants.length}
          connectionState={connectionState}
          roomCover={roomCover}
          onCoverChange={handleCoverChange}
          onInvite={onInvite}
          onMore={() => {}}
        />

        {permissionDenied ? (
          <PermissionDeniedState onOpenSettings={() => window.open('chrome://settings/content/microphone', '_blank')} />
        ) : error ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div
              role="alert"
              className="max-w-md w-full rounded-[16px] border border-danger/30 bg-[#1a0f11]/85 backdrop-blur p-6 text-center"
            >
              <p className="text-[14px] font-semibold text-strong">Erro na chamada</p>
              <p className="text-[12.5px] text-muted mt-1.5">{error}</p>
              <button
                type="button"
                onClick={onLeave}
                className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-pill bg-accent text-strong text-[12.5px] font-semibold hover:scale-[1.03] active:scale-[0.97] transition-transform"
              >
                Sair da sala
              </button>
            </div>
          </div>
        ) : (
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
            screenStream={screenStream || remoteScreenStream}
            screenIsSelf={!!screenStream}
            onStopShare={handleShareScreen}
            cameraStreams={{
              ...remoteCameras,
              ...(cameraStream && currentUserId ? { [currentUserId]: cameraStream } : {}),
            }}
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-3 sm:bottom-6 flex justify-center px-2 sm:px-4 pb-[env(safe-area-inset-bottom)]">
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
            onLeave={onLeave}
            reducedMotion={reducedMotion}
          />
        </div>
        </div>
      </div>

      <ScreenSharePicker
        open={!!shareNeedsPicker}
        sources={shareSources}
        onPick={handlePickShareSource}
        onClose={handleCancelSharePicker}
      />

      {rightSidebarOpen && sidebarOverlay && (
        <button
          type="button"
          aria-label="Fechar atividades"
          className="absolute inset-0 z-20 bg-black/45"
          onClick={onRightSidebarClose}
        />
      )}
      {rightSidebarOpen && (
        <div
          className={
            sidebarOverlay
              ? 'absolute right-0 top-0 z-30 h-full w-[min(280px,88vw)] shadow-2xl'
              : 'relative z-10 w-[min(280px,30vw)] min-w-[220px] max-w-[280px] shrink-0 h-full'
          }
        >
          <RoomActivitySidebar
            participants={participants}
            currentUserId={currentUserId}
            selfSpeaking={selfSpeaking}
            remoteSpeaking={remoteSpeaking}
            selfMuted={isMuted}
            activity={activity}
            onClose={onRightSidebarClose}
            onInvite={onInvite}
            onSendThought={sendThought}
            selfStatus={selfStatus}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}
    </div>
  )
}
