/**
 * ParticipantGrid — people tiles + optional stage (screen or promoted camera).
 *
 * Double-click a live camera to put it on the big stage. If a screen share
 * is already there, the two swap: camera goes Full HD, screen lands on
 * that person's card. Double-click again (card or stage) to swap back.
 */
import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { ParticipantCard } from './ParticipantCard'
import { ScreenShareStage } from './ScreenShareStage'

export function ParticipantGrid({
  participants,
  currentUserId,
  isCreator,
  selfSpeaking,
  remoteSpeaking,
  selfMuted,
  reducedMotion,
  onInvite,
  onStatusChange,
  screenStream = null,
  screenIsSelf = false,
  onStopShare,
  cameraStreams = {},
}) {
  const [sizeBucket, setSizeBucket] = useState('medium')
  // null = grid. 'screen' = screen on the stage. userId = that camera on the stage.
  const [featured, setFeatured] = useState(null)

  useEffect(() => {
    if (!screenStream && featured === 'screen') setFeatured(null)
  }, [screenStream, featured])

  useEffect(() => {
    if (typeof featured === 'string' && featured !== 'screen' && !cameraStreams[featured]) {
      setFeatured(screenStream ? 'screen' : null)
    }
  }, [cameraStreams, featured, screenStream])

  useEffect(() => {
    const n = participants.length
    if (n <= 1) setSizeBucket('solo')
    else if (n === 2) setSizeBucket('pair')
    else if (n <= 6) setSizeBucket('small')
    else if (n <= 12) setSizeBucket('medium')
    else setSizeBucket('large')
  }, [participants.length])

  const featuredCameraId = typeof featured === 'string' && featured !== 'screen' ? featured : null
  const stageIsCamera = !!featuredCameraId
  const stageStream = stageIsCamera ? cameraStreams[featuredCameraId] : screenStream
  const featuredMember = featuredCameraId
    ? participants.find((p) => p.userId === featuredCameraId)
    : null

  const promoteCamera = (userId) => {
    if (!userId) return
    if (featured === userId) {
      setFeatured(screenStream ? 'screen' : null)
      return
    }
    if (cameraStreams[userId] || featured === userId) setFeatured(userId)
  }

  const toggleStage = () => {
    if (featuredCameraId) {
      setFeatured(screenStream ? 'screen' : null)
      return
    }
    if (featured === 'screen') setFeatured(null)
    else if (screenStream) setFeatured('screen')
  }

  const renderCard = (p) => {
    const isSelf = p.userId === currentUserId
    const swapped = featuredCameraId === p.userId && !!screenStream
    const videoStream = swapped
      ? screenStream
      : featuredCameraId === p.userId
        ? null
        : (cameraStreams[p.userId] || null)
    const canPromote = !!cameraStreams[p.userId] || swapped
    return (
      <ParticipantCard
        key={p.userId}
        member={p}
        isSelf={isSelf}
        isCreator={isCreator && isSelf}
        isSpeaking={isSelf ? !!selfSpeaking : !!remoteSpeaking?.[p.userId]}
        isMuted={isSelf ? selfMuted : false}
        isListening={true}
        reducedMotion={reducedMotion}
        videoStream={videoStream}
        videoKind={swapped ? 'screen' : 'camera'}
        onPromote={canPromote ? () => promoteCamera(p.userId) : undefined}
      />
    )
  }

  if (featured && stageStream) {
    const stageSelf = stageIsCamera
      ? featuredCameraId === currentUserId
      : screenIsSelf
    const stageTitle = stageIsCamera
      ? (featuredMember?.displayName
        ? `${featuredCameraId === currentUserId ? 'Sua câmera' : `Câmera · ${featuredMember.displayName}`}`
        : 'Câmera')
      : undefined
    return (
      <div className="@container flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col @[640px]:flex-row gap-3 px-3 sm:px-5 pt-1 pb-24">
        <div className="flex-1 min-w-0 min-h-[40%] @[640px]:min-h-0">
          <ScreenShareStage
            stream={stageStream}
            isSelf={stageSelf}
            kind={stageIsCamera ? 'camera' : 'screen'}
            title={stageTitle}
            mirrored={stageIsCamera && stageSelf}
            expanded
            onToggleExpand={toggleStage}
            onStop={stageIsCamera ? undefined : onStopShare}
          />
        </div>
        <aside className="flex @[640px]:flex-col gap-2.5 overflow-x-auto @[640px]:overflow-y-auto @[640px]:overflow-x-visible shrink-0 @[640px]:w-[168px] @[720px]:w-[196px] @[640px]:h-full pb-1 @[640px]:pb-0 @[640px]:pr-0.5">
          {participants.map((p) => (
            <div key={p.userId || p.id} className="w-[140px] shrink-0 @[640px]:w-auto">
              {renderCard(p)}
            </div>
          ))}
        </aside>
      </div>
    )
  }

  if (participants.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 py-6">
        <div className="text-center max-w-sm">
          <p className="text-[15px] font-semibold text-strong">Você está na sala</p>
          <p className="text-[12.5px] text-muted mt-1.5">Convide alguém para começar a conversa.</p>
          <button
            type="button"
            onClick={onInvite}
            className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-pill bg-accent text-strong text-[12.5px] font-semibold"
          >
            <UserPlus size={14} />
            Convidar pessoas
          </button>
        </div>
      </div>
    )
  }

  if (sizeBucket === 'solo') {
    const me = participants[0]
    return (
      <div className="@container flex-1 min-h-0 flex items-center justify-center px-3 sm:px-6 py-4 sm:py-6">
        <div
          className="w-full max-w-[720px] min-w-0 grid gap-4 sm:gap-5 grid-cols-1 @[540px]:grid-cols-[minmax(0,340px)_minmax(0,1fr)]"
        >
          {renderCard(me)}
          {screenStream ? (
            <ScreenShareStage
              stream={screenStream}
              isSelf={screenIsSelf}
              onToggleExpand={() => setFeatured('screen')}
              onStop={onStopShare}
            />
          ) : (
          <div
            className="
              relative rounded-[16px] border border-white/[0.08] overflow-hidden
              bg-[#15171d]
              p-6 flex flex-col items-center justify-center text-center gap-3
              shadow-[0_18px_44px_-16px_rgba(0,0,0,0.6)]
            "
          >
            <div
              aria-hidden
              className="absolute inset-0 opacity-50"
              style={{
                background:
                  'radial-gradient(60% 80% at 50% 0%, color-mix(in srgb, var(--space-accent) 18%, transparent) 0%, transparent 70%)',
              }}
            />
            <div className="relative">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center bg-accent/15 text-accent ring-1 ring-accent/30"
                aria-hidden
              >
                <UserPlus size={20} strokeWidth={1.8} />
              </div>
            </div>
            <div className="relative">
              <p
                className="text-[16px] font-semibold text-strong tracking-tight"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }}
              >
                Você está na sala
              </p>
              <p className="text-[12.5px] text-muted mt-1.5 max-w-[280px] leading-snug">
                Convide alguém para começar a conversa.
              </p>
            </div>
            <button
              type="button"
              onClick={onInvite}
              className="
                relative inline-flex items-center gap-2 h-10 px-5 rounded-pill
                bg-gradient-to-r from-accent to-[#ff5a82]
                text-strong text-[12.5px] font-semibold
                shadow-[0_8px_22px_-8px_var(--space-accent-glow-32),inset_0_0_0_1px_rgba(255,255,255,0.10)]
                transition-[transform,box-shadow] duration-200
                hover:scale-[1.03] hover:shadow-[0_10px_28px_-8px_var(--space-accent-glow-40),inset_0_0_0_1px_rgba(255,255,255,0.18)]
                active:scale-[0.97]
                focus-visible:ring-2 focus-visible:ring-accent/60
              "
            >
              <UserPlus size={14} strokeWidth={1.9} />
              Convidar pessoas
            </button>
          </div>
          )}
        </div>
      </div>
    )
  }

  const minCard = sizeBucket === 'pair' ? 220
                : sizeBucket === 'large' ? 200
                : 240
  const maxCols = sizeBucket === 'pair' ? 2
                : sizeBucket === 'small' ? 3
                : sizeBucket === 'medium' ? 4
                : 4
  return (
    <div className="@container flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24">
      {screenStream && (
        <div className="mb-4 max-w-4xl mx-auto aspect-video">
          <ScreenShareStage
            stream={screenStream}
            isSelf={screenIsSelf}
            onToggleExpand={() => setFeatured('screen')}
            onStop={onStopShare}
          />
        </div>
      )}
      <div
        className="grid gap-3.5 mx-auto"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minCard}px), 1fr))`,
          maxWidth: '100%',
        }}
        data-cols={maxCols}
      >
        {participants.map(renderCard)}
      </div>
    </div>
  )
}
