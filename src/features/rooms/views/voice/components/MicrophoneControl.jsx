/**
 * MicrophoneControl — flat glass mic toggle (no outline rings).
 */
import { Mic, MicOff } from 'lucide-react'

export function MicrophoneControl({ isMuted, permissionDenied, onClick, reducedMotion = false }) {
  void reducedMotion
  const label = permissionDenied
    ? 'Permissão negada — clique para tentar de novo'
    : isMuted
      ? 'Reativar microfone'
      : 'Silenciar microfone'

  const tone = permissionDenied
    ? 'bg-danger text-white shadow-[0_10px_24px_-10px_rgba(239,68,68,0.45)]'
    : isMuted
      ? 'bg-white/[0.08] text-white/70 hover:bg-white/[0.14] hover:text-white'
      : 'bg-accent text-strong shadow-[0_10px_24px_-10px_var(--space-accent-glow-40)]'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={!isMuted}
      title={label}
      className={[
        'relative h-11 w-11 rounded-full flex items-center justify-center',
        'transition-[transform,background-color,color,box-shadow] duration-200',
        'hover:scale-[1.05] active:scale-[0.95]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
        tone,
      ].join(' ')}
    >
      {isMuted || permissionDenied
        ? <MicOff size={16} strokeWidth={1.9} />
        : <Mic size={16} strokeWidth={1.9} />}
    </button>
  )
}
