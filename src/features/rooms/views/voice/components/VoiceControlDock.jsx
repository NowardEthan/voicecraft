/**
 * VoiceControlDock — the pill-shaped control bar pinned to the bottom
 * of the voice room main area.
 *
 * Contains:
 *   - MicrophoneControl + InputDeviceMenu (left)
 *   - Headphones / Output device (center-left)
 *   - ScreenShareControl (center)
 *   - More menu (center-right)
 *   - LeaveCallButton (right)
 *
 * The dock is the only thing that floats over the participant grid.
 * It must remain visible at all viewport sizes — even when the
 * participant list scrolls.
 */
import { Headphones, Video, VideoOff } from 'lucide-react'
import { MicrophoneControl } from './MicrophoneControl'
import { InputDeviceMenu } from './InputDeviceMenu'
import { LeaveCallButton } from './LeaveCallButton'

export function VoiceControlDock({
  isMuted, permissionDenied, onToggleMute,
  mics, activeDeviceId, onPickDevice,
  onLeave, onShareScreen, screenSharing, isDeafened, onToggleDeafen,
  onToggleCamera, cameraOn,
  reducedMotion,
}) {
  return (
    <div
      role="toolbar"
      aria-label="Controles da chamada"
      className="
        pointer-events-auto
        inline-flex items-center gap-1 sm:gap-1.5
        max-w-full
        rounded-pill bg-[#0f1014]
        border border-white/[0.07]
        shadow-[0_18px_44px_-12px_rgba(0,0,0,0.7)]
        p-1 sm:p-1.5 sm:pl-2.5 sm:pr-2
      "
    >
      {/* Microphone (with device selector) */}
      <div className="flex items-center">
        <MicrophoneControl
          isMuted={isMuted}
          permissionDenied={permissionDenied}
          onClick={onToggleMute}
          reducedMotion={reducedMotion}
        />
        <InputDeviceMenu
          devices={mics}
          activeId={activeDeviceId}
          onPick={onPickDevice}
        />
      </div>

      {/* Headphones (mute / deafen output) */}
      <button
        type="button"
        onClick={onToggleDeafen}
        aria-label={isDeafened ? 'Reativar áudio' : 'Silenciar áudio'}
        aria-pressed={!isDeafened}
        title={isDeafened ? 'Reativar áudio' : 'Silenciar áudio'}
        className={[
          'h-11 w-11 rounded-full flex items-center justify-center',
          'border transition-[transform,background-color,border-color,color] duration-200',
          'hover:scale-[1.06] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-accent/50',
          isDeafened
            ? 'bg-danger/15 border-danger/40 text-danger'
            : 'bg-surface2 border-line text-ink hover:bg-surface1 hover:text-strong',
        ].join(' ')}
      >
        <Headphones size={16} strokeWidth={1.8} />
      </button>

      <button
        type="button"
        onClick={onToggleCamera}
        aria-label={cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
        aria-pressed={!!cameraOn}
        title={cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
        className={[
          'h-11 w-11 rounded-full flex items-center justify-center',
          'border transition-[transform,background-color,border-color,color] duration-200',
          'hover:scale-[1.06] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-accent/50',
          cameraOn
            ? 'bg-accent/15 border-accent/40 text-accent'
            : 'bg-surface2 border-line text-ink hover:bg-surface1 hover:text-strong',
        ].join(' ')}
      >
        {cameraOn
          ? <Video size={16} strokeWidth={1.8} />
          : <VideoOff size={16} strokeWidth={1.8} />}
      </button>

      {/* Screen share */}
      <button
        type="button"
        onClick={onShareScreen}
        aria-label={screenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
        aria-pressed={!!screenSharing}
        title={screenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
        className={[
          'h-11 w-11 rounded-full flex items-center justify-center',
          'border transition-[transform,background-color,border-color,color] duration-200',
          'hover:scale-[1.06] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-accent/50',
          screenSharing
            ? 'bg-accent/15 border-accent/40 text-accent'
            : 'bg-surface2 border-line text-ink hover:bg-surface1 hover:text-strong',
        ].join(' ')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </button>

      <div className="w-px h-6 bg-white/10 mx-1" aria-hidden />

      <LeaveCallButton onClick={onLeave} />
    </div>
  )
}
