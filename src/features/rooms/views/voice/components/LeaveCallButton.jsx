/**
 * LeaveCallButton — solid accent leave control.
 */
import { PhoneOff } from 'lucide-react'

export function LeaveCallButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Sair da chamada"
      title="Sair da chamada"
      disabled={disabled}
      className="
        group relative h-11 px-3.5 min-[420px]:px-4 rounded-full
        inline-flex items-center gap-2
        bg-accent text-strong text-[12.5px] font-semibold
        shadow-[0_10px_26px_-10px_var(--space-accent-glow-40)]
        transition-[transform,box-shadow,opacity,filter] duration-200
        hover:scale-[1.04] hover:brightness-110
        active:scale-[0.96]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25
        disabled:opacity-50 disabled:cursor-not-allowed
      "
    >
      <PhoneOff size={14} strokeWidth={2} />
      <span className="hidden min-[420px]:inline">Sair</span>
    </button>
  )
}
