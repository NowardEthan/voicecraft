/**
 * LeaveCallButton — the red "Sair" button in the dock.
 *
 * Behavior:
 *   - Tells the server we're leaving the room
 *   - Tears down the local media tracks and peer connection
 *   - Calls onLeave (App-level handler) which clears currentRoom
 *
 * The button is clearly distinguished from the other controls with
 * a coral fill so it's identifiable at a glance.
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
        group relative h-11 px-3 min-[420px]:px-4 rounded-pill
        inline-flex items-center gap-2
        bg-gradient-to-r from-accent to-[#ff5a82]
        text-strong text-[12.5px] font-semibold
        shadow-[0_8px_22px_-8px_var(--space-accent-glow-32),inset_0_0_0_1px_rgba(255,255,255,0.10)]
        transition-[transform,box-shadow,opacity] duration-200
        hover:scale-[1.04] hover:shadow-[0_10px_28px_-8px_var(--space-accent-glow-40),inset_0_0_0_1px_rgba(255,255,255,0.18)]
        active:scale-[0.96]
        focus-visible:ring-2 focus-visible:ring-accent/60
        disabled:opacity-50 disabled:cursor-not-allowed
      "
    >
      <PhoneOff size={14} strokeWidth={1.9} />
      <span className="hidden min-[420px]:inline">Sair</span>
    </button>
  )
}
