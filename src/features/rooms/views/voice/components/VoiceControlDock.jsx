/**
 * VoiceControlDock — floating glass control bar for the voice room.
 */
import { Headphones, Video, VideoOff, Monitor } from 'lucide-react'
import { MicrophoneControl } from './MicrophoneControl'
import { InputDeviceMenu } from './InputDeviceMenu'
import { LeaveCallButton } from './LeaveCallButton'
import useReducedMotion from '../../../../../hooks/useReducedMotion'

const dockBtn = [
  'h-11 w-11 rounded-full flex items-center justify-center',
  'transition-[transform,background-color,color] duration-200',
  'hover:scale-[1.05] active:scale-[0.95]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
  'disabled:opacity-40 disabled:pointer-events-none disabled:hover:scale-100',
].join(' ')

const dockBtnIdle = 'bg-white/[0.08] text-white/85 hover:bg-white/[0.14] hover:text-white'
const dockBtnOn = 'bg-accent text-strong shadow-[0_10px_24px_-10px_var(--space-accent-glow-40)]'
const dockBtnDanger = 'bg-danger text-white shadow-[0_10px_24px_-10px_rgba(239,68,68,0.45)]'

export function VoiceControlDock({
  isMuted, permissionDenied, onToggleMute,
  mics, activeDeviceId, onPickDevice,
  onLeave, onShareScreen, screenSharing, isDeafened, onToggleDeafen,
  onToggleCamera, cameraOn,
  reducedMotion: reducedMotionProp,
  mediaEnabled = true,
  cinema = false,
}) {
  const hookReducedMotion = useReducedMotion()
  const reducedMotion = reducedMotionProp ?? hookReducedMotion
  const mediaLocked = !mediaEnabled
  return (
    <div
      role="toolbar"
      aria-label="Controles da chamada"
      className={[
        'pointer-events-auto',
        'inline-flex items-center gap-1 sm:gap-1.5',
        'max-w-full',
        'rounded-full',
        'p-1.5 sm:pl-2 sm:pr-2',
        cinema
          ? 'bg-black/75 backdrop-blur-xl border border-white/20 shadow-[0_22px_50px_-14px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'bg-black/45 backdrop-blur-xl shadow-[0_22px_50px_-18px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.06)]',
      ].join(' ')}
    >
      <div className={`flex items-center gap-0.5 ${mediaLocked ? 'opacity-40 pointer-events-none' : ''}`}>
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

      <button
        type="button"
        onClick={onToggleDeafen}
        disabled={mediaLocked}
        aria-label={isDeafened ? 'Reativar áudio' : 'Silenciar áudio'}
        aria-pressed={!isDeafened}
        title={mediaLocked ? 'Aguarde conectar' : (isDeafened ? 'Reativar áudio' : 'Silenciar áudio')}
        className={[dockBtn, isDeafened ? dockBtnDanger : dockBtnIdle].join(' ')}
      >
        <Headphones size={16} strokeWidth={1.9} />
      </button>

      <button
        type="button"
        onClick={onToggleCamera}
        disabled={mediaLocked}
        aria-label={cameraOn ? 'Desligar câmera' : 'Ligar câmera'}
        aria-pressed={!!cameraOn}
        title={mediaLocked ? 'Aguarde conectar' : (cameraOn ? 'Desligar câmera' : 'Ligar câmera')}
        className={[dockBtn, cameraOn ? dockBtnOn : dockBtnIdle].join(' ')}
      >
        {cameraOn
          ? <Video size={16} strokeWidth={1.9} />
          : <VideoOff size={16} strokeWidth={1.9} />}
      </button>

      <button
        type="button"
        onClick={onShareScreen}
        disabled={mediaLocked}
        aria-label={screenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
        aria-pressed={!!screenSharing}
        title={mediaLocked ? 'Aguarde conectar' : (screenSharing ? 'Parar compartilhamento' : 'Compartilhar tela')}
        className={[dockBtn, screenSharing ? dockBtnOn : dockBtnIdle].join(' ')}
      >
        <Monitor size={16} strokeWidth={1.9} />
      </button>

      <div className="w-px h-5 bg-white/[0.08] mx-0.5 sm:mx-1" aria-hidden />

      <LeaveCallButton onClick={onLeave} />
    </div>
  )
}
