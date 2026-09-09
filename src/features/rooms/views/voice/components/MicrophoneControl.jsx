/**
 * MicrophoneControl — the dock's "Microfone" button. Toggles the local
 * mic track on/off (for outgoing audio). Visual state reflects both the
 * toggle and the real mic permission status.
 */
import { Mic, MicOff } from 'lucide-react'

export function MicrophoneControl({ isMuted, permissionDenied, onClick, reducedMotion = false }) {
  const label = permissionDenied
    ? 'Permissão negada — clique para tentar de novo'
    : isMuted
      ? 'Reativar microfone'
      : 'Silenciar microfone'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={!isMuted}
      title={label}
      className={[
        'group relative h-11 w-11 rounded-full flex items-center justify-center',
        'border transition-[transform,background-color,border-color,box-shadow] duration-200',
        'hover:scale-[1.06] active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-accent/50',
        permissionDenied
          ? 'bg-danger/15 border-danger/40 text-danger'
          : isMuted
            ? 'bg-surface2 border-line text-ink hover:bg-surface1'
            : 'bg-accent/15 border-accent/40 text-accent',
      ].join(' ')}
    >
      {isMuted || permissionDenied
        ? <MicOff size={16} strokeWidth={1.8} />
        : <Mic size={16} strokeWidth={1.8} />}
    </button>
  )
}
