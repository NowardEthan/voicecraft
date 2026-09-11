/**
 * ParticipantCard — one tile in the voice room grid.
 * With a camera stream the tile becomes the live preview; without it
 * we keep the avatar + cover flow.
 */
import { memo, useEffect, useRef } from 'react'
import { MicOff, Mic, Crown, Video, Monitor } from 'lucide-react'
import { PersonAvatar } from '../../../../people'
import { UserTagChips } from '../../../../people/components/UserTagChips'
import { SpaceCoverLayer } from '../../../../spaces/components/SpaceCoverLayer'
import { SpeakingIndicator } from './SpeakingIndicator'

export const ParticipantCard = memo(function ParticipantCard({
  member,
  isSelf = false,
  isCreator = false,
  isSpeaking = false,
  isMuted = false,
  isListening = true,
  reducedMotion = false,
  videoStream = null,
  videoKind = 'camera',
  onPromote,
}) {
  const name = member.displayName || 'convidado'
  const hasVideo = !!videoStream
  const showingScreen = hasVideo && videoKind === 'screen'
  const hasCover = !hasVideo && typeof member.cover === 'string' && (member.cover.startsWith('http') || member.cover.startsWith('data:image/'))
  const customStatus = typeof member.status === 'string' ? member.status.trim() : ''
  const canPromote = typeof onPromote === 'function' && hasVideo
  const stateLabel = isMuted
    ? 'Microfone desligado'
    : isSpeaking
      ? 'Falando agora'
      : hasVideo
        ? 'Câmera ligada'
        : customStatus || (isListening ? 'Ouvindo' : 'Silenciado')

  return (
    <article
      onDoubleClick={canPromote ? onPromote : undefined}
      title={canPromote ? (showingScreen ? 'Clique duas vezes para devolver a tela ao palco' : 'Clique duas vezes para ver em tela cheia na sala') : undefined}
      className={[
        'relative min-w-0 w-full max-w-full rounded-[16px] overflow-hidden isolate',
        hasVideo ? 'bg-black' : hasCover ? 'bg-transparent' : 'bg-[#15171d]',
        canPromote ? 'cursor-zoom-in' : '',
        'border transition-[border-color,box-shadow] duration-300',
        isSpeaking
          ? 'border-accent shadow-[0_0_0_1px_var(--space-accent),0_0_32px_-4px_var(--space-accent-glow-40),inset_0_0_24px_-8px_var(--space-accent-glow-24)]'
          : 'border-white/[0.07] hover:border-white/[0.14]',
      ].join(' ')}
      aria-label={`${name}${isSelf ? ' (você)' : ''} — ${stateLabel}`}
    >
      {hasVideo && (
        <div className="relative w-full aspect-video overflow-hidden rounded-[15px] bg-black">
          <CardCameraPreview stream={videoStream} mirrored={isSelf && !showingScreen} contain={showingScreen} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />
        </div>
      )}
      {hasCover && (
        <>
          <SpaceCoverLayer src={member.cover} fit={member.coverFit} className="opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
        </>
      )}
      <div className={`relative z-10 ${hasVideo ? 'absolute inset-0 p-3.5 flex flex-col' : 'p-4 flex flex-col gap-3 min-h-[200px]'}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5">
            {hasVideo && (
              <span
                className="w-7 h-7 rounded-full bg-black/45 border border-white/15 text-white flex items-center justify-center"
                aria-hidden
                title={showingScreen ? 'Tela compartilhada' : 'Câmera ligada'}
              >
                {showingScreen
                  ? <Monitor size={12} strokeWidth={1.9} />
                  : <Video size={12} strokeWidth={1.9} />}
              </span>
            )}
            {isMuted && (
              <span
                className="w-7 h-7 rounded-full bg-danger/15 border border-danger/30 text-danger flex items-center justify-center"
                aria-hidden
                title="Microfone desligado"
              >
                <MicOff size={12} strokeWidth={1.9} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end max-w-[55%]">
            {isCreator && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-pill text-[9.5px] font-semibold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30"
                title="Criador do Space"
                aria-label="Criador do Space"
              >
                <Crown size={9} strokeWidth={2.25} />
              </span>
            )}
            <UserTagChips tags={member.tags} size="xs" />
            {isSelf && (
              <span
                className="px-1.5 py-0.5 rounded-pill text-[9.5px] font-semibold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30"
                aria-label="Você"
              >
                você
              </span>
            )}
          </div>
        </div>

        {!hasVideo && (
          <div className="flex-1 flex items-center justify-center">
            <div
              className={[
                'relative rounded-full shrink-0',
                'transition-[transform,box-shadow] duration-300',
                isSpeaking
                  ? 'scale-[1.04] shadow-[0_0_24px_-4px_var(--space-accent-glow-40),0_0_0_3px_color-mix(in_srgb,var(--space-accent)_35%,transparent)]'
                  : 'shadow-[0_8px_20px_-10px_rgba(0,0,0,0.6)]',
              ].join(' ')}
            >
              <PersonAvatar src={member.photoURL} name={name} userId={member.userId} size={76} />
              {isSpeaking && (
                <span
                  className="absolute inset-0 rounded-full border-2 border-accent animate-fade-in"
                  aria-hidden
                />
              )}
            </div>
          </div>
        )}

        <div className={`space-y-1 ${hasVideo ? 'mt-auto' : ''}`}>
          <p className={`text-[13.5px] font-semibold leading-tight truncate ${hasCover || hasVideo ? 'text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.65)]' : 'text-strong'}`}>
            {name}
          </p>
          <div className="flex items-center gap-1.5 min-h-[18px]">
            {isSpeaking ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 vc-anim-pulse-dot" aria-hidden />
                <span className="text-[11.5px] text-accent font-medium">Falando agora</span>
                <SpeakingIndicator active reducedMotion={reducedMotion} />
              </>
            ) : isMuted ? (
              <>
                <MicOff size={10} className="text-danger shrink-0" aria-hidden />
                <span className="text-[11.5px] text-muted">Microfone desligado</span>
              </>
            ) : hasVideo ? (
              <>
                {showingScreen
                  ? <Monitor size={10} className="text-white/80 shrink-0" aria-hidden />
                  : <Video size={10} className="text-white/80 shrink-0" aria-hidden />}
                <span className="text-[11.5px] text-white/80">{showingScreen ? 'Tela no card' : 'Câmera ligada'}</span>
              </>
            ) : customStatus ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-positive shrink-0" aria-hidden />
                <span className="text-[11.5px] text-ink truncate">{customStatus}</span>
              </>
            ) : isListening ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-positive shrink-0" aria-hidden />
                <span className="text-[11.5px] text-ink">Ouvindo</span>
              </>
            ) : (
              <>
                <Mic size={10} className="text-muted shrink-0" aria-hidden />
                <span className="text-[11.5px] text-muted">Aguardando</span>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  )
})

function CardCameraPreview({ stream, mirrored = false, contain = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.srcObject = stream || null
    return () => { el.srcObject = null }
  }, [stream])
  return (
    <div className={`absolute inset-0 overflow-hidden ${mirrored ? '-scale-x-100' : ''}`}>
      <video
        ref={ref}
        className={`block w-full h-full max-w-none pointer-events-none ${contain ? 'object-contain bg-black' : 'object-cover object-center'}`}
        autoPlay
        playsInline
        muted
      />
    </div>
  )
}
