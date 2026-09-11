/**
 * ParticipantGrid — people tiles + screen-share stage.
 *
 * When anyone shares, one share fills the main stage; others sit in a
 * filmstrip. Double-click a share/thumbnail to promote it. Cameras can
 * still take the stage the same way.
 */
import { useEffect, useMemo, useState } from 'react'
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
  /** @deprecated prefer screenShares */
  screenStream = null,
  screenIsSelf = false,
  screenShares = null,
  onStopShare,
  cameraStreams = {},
  chromeVisible = true,
  onImmersiveChange,
  peerVolumes = null,
  onParticipantVolume,
}) {
  void onStatusChange
  const shares = useMemo(() => {
    const raw = Array.isArray(screenShares) && screenShares.length > 0
      ? screenShares.filter((s) => s?.stream)
      : screenStream
        ? [{ id: screenIsSelf ? 'self' : 'remote', stream: screenStream, isSelf: !!screenIsSelf }]
        : []
    // Drop duplicates (same id / same MediaStream) — attaching one stream to
    // many <video>s leaves black tiles.
    const out = []
    const seenIds = new Set()
    const seenStreams = new Set()
    for (const share of raw) {
      if (!share?.stream || seenIds.has(share.id) || seenStreams.has(share.stream)) continue
      seenIds.add(share.id)
      seenStreams.add(share.stream)
      out.push(share)
    }
    return out
  }, [screenShares, screenStream, screenIsSelf])

  const [sizeBucket, setSizeBucket] = useState('medium')
  // null = people grid only. share:<id> | userId = stage content.
  const [featured, setFeatured] = useState(null)
  // Cinema: stage fills the whole content pane (hides filmstrip / people).
  const [immersive, setImmersive] = useState(false)

  useEffect(() => {
    if (!immersive) return
    const onKey = (e) => {
      if (e.key === 'Escape') setImmersive(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive])

  useEffect(() => {
    onImmersiveChange?.(immersive)
  }, [immersive, onImmersiveChange])

  // Always keep a share on the stage while shares exist so it can fill the layout.
  useEffect(() => {
    if (shares.length === 0) {
      if (typeof featured === 'string' && featured.startsWith('share:')) setFeatured(null)
      if (immersive) setImmersive(false)
      return
    }
    if (typeof featured === 'string' && featured.startsWith('share:')) {
      const id = featured.slice(6)
      if (shares.some((s) => s.id === id)) return
    }
    if (typeof featured === 'string' && !featured.startsWith('share:') && cameraStreams[featured]) {
      return
    }
    const preferred = shares.find((s) => !s.isSelf) || shares[0]
    setFeatured(`share:${preferred.id}`)
  }, [shares, featured, cameraStreams, immersive])

  useEffect(() => {
    const n = participants.length
    if (n <= 1) setSizeBucket('solo')
    else if (n === 2) setSizeBucket('pair')
    else if (n <= 6) setSizeBucket('small')
    else if (n <= 12) setSizeBucket('medium')
    else setSizeBucket('large')
  }, [participants.length])

  const featuredShareId = typeof featured === 'string' && featured.startsWith('share:')
    ? featured.slice(6)
    : null
  const featuredCameraId = typeof featured === 'string' && !featured.startsWith('share:')
    ? featured
    : null
  const featuredShare = featuredShareId
    ? shares.find((s) => s.id === featuredShareId) || null
    : null
  const stageIsCamera = !!featuredCameraId
  const stageStream = stageIsCamera
    ? cameraStreams[featuredCameraId]
    : featuredShare?.stream || null
  const featuredMember = featuredCameraId
    ? participants.find((p) => p.userId === featuredCameraId)
    : null
  const otherShares = featuredShareId
    ? shares.filter((s) => s.id !== featuredShareId)
    : shares

  const promoteCamera = (userId) => {
    if (!userId) return
    if (featured === userId) {
      const preferred = shares.find((s) => !s.isSelf) || shares[0]
      setFeatured(preferred ? `share:${preferred.id}` : null)
      return
    }
    if (cameraStreams[userId]) setFeatured(userId)
  }

  const toggleShareFeatured = (shareId) => {
    setFeatured(`share:${shareId}`)
  }

  const toggleImmersive = () => setImmersive((v) => !v)

  const renderCard = (p) => {
    const isSelf = p.userId === currentUserId
    const swapped = featuredCameraId === p.userId && !!featuredShare
    const videoStream = swapped
      ? featuredShare.stream
      : featuredCameraId === p.userId
        ? null
        : (cameraStreams[p.userId] || null)
    const canPromote = !!cameraStreams[p.userId] || swapped
    return (
      <ParticipantCard
        key={p.userId}
        member={p}
        isSelf={isSelf}
        isCreator={!!p.isCreator}
        isSpeaking={isSelf ? !!selfSpeaking : !!remoteSpeaking?.[p.userId]}
        isMuted={isSelf ? selfMuted : false}
        isListening={true}
        reducedMotion={reducedMotion}
        videoStream={videoStream}
        videoKind={swapped ? 'screen' : 'camera'}
        onPromote={canPromote ? () => promoteCamera(p.userId) : undefined}
        volume={peerVolumes?.[p.userId] ?? 100}
        onVolumeChange={onParticipantVolume ? (v) => onParticipantVolume(p.userId, v) : undefined}
      />
    )
  }

  // —— Stage layout: featured share/camera fills the main pane ——
  if (featured && stageStream) {
    const stageSelf = stageIsCamera
      ? featuredCameraId === currentUserId
      : !!featuredShare?.isSelf
    const stageTitle = stageIsCamera
      ? (featuredMember?.displayName
        ? `${featuredCameraId === currentUserId ? 'Sua câmera' : `Câmera · ${featuredMember.displayName}`}`
        : 'Câmera')
      : featuredShare?.title

    return (
      <div
        className={[
          '@container flex-1 min-h-0 overflow-hidden flex',
          immersive
            ? 'relative flex-col p-0 h-full'
            : 'flex-col @[720px]:flex-row gap-2 sm:gap-3 px-2 sm:px-3 pt-1 pb-24',
        ].join(' ')}
      >
        {/* Main stage — immersive = edge-to-edge under overlays */}
        <div className={immersive ? 'absolute inset-0' : 'relative flex-1 min-w-0 min-h-0'}>
          <div className="absolute inset-0">
            <ScreenShareStage
              stream={stageStream}
              isSelf={stageSelf}
              kind={stageIsCamera ? 'camera' : 'screen'}
              title={stageTitle}
              mirrored={stageIsCamera && stageSelf}
              expanded={immersive}
              fill
              immersive={immersive}
              chromeVisible={chromeVisible}
              onToggleExpand={toggleImmersive}
              onStop={stageIsCamera ? undefined : (featuredShare?.isSelf ? onStopShare : undefined)}
            />
          </div>
        </div>

        {/* Filmstrip + people — hidden in immersive cinema mode */}
        {!immersive && (
          <aside className="shrink-0 flex flex-row @[720px]:flex-col gap-2 overflow-x-auto @[720px]:overflow-y-auto @[720px]:overflow-x-hidden @[720px]:w-[180px] @[900px]:w-[220px] @[720px]:h-full max-h-[28%] @[720px]:max-h-none pb-1">
            {otherShares.map((share) => (
              <div
                key={share.id}
                role="button"
                tabIndex={0}
                onClick={() => toggleShareFeatured(share.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleShareFeatured(share.id)
                  }
                }}
                className="relative w-[160px] @[720px]:w-full aspect-video shrink-0 rounded-[12px] overflow-hidden border border-white/10 hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                title="Mostrar em destaque"
              >
                <ScreenShareStage
                  stream={share.stream}
                  isSelf={!!share.isSelf}
                  title={share.title}
                  compact
                  onStop={share.isSelf ? onStopShare : undefined}
                />
              </div>
            ))}
            {participants.map((p) => (
              <div key={p.userId || p.id} className="w-[140px] @[720px]:w-auto shrink-0">
                {renderCard(p)}
              </div>
            ))}
          </aside>
        )}
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
        <div className="w-full max-w-[720px] min-w-0">
          {renderCard(me)}
          {!shares.length && (
            <div
              className="
                relative mt-4 rounded-[16px] border border-white/[0.08] overflow-hidden
                bg-[#15171d]
                p-6 flex flex-col items-center justify-center text-center gap-3
                shadow-[0_18px_44px_-16px_rgba(0,0,0,0.6)]
              "
            >
              <p
                className="text-[16px] font-semibold text-strong tracking-tight"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic' }}
              >
                Você está na sala
              </p>
              <p className="text-[12.5px] text-muted mt-1.5 max-w-[280px] leading-snug">
                Convide alguém para começar a conversa.
              </p>
              <button
                type="button"
                onClick={onInvite}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-pill bg-accent text-strong text-[12.5px] font-semibold"
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
