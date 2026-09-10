import { PhoneOff } from 'lucide-react'

/**
 * Compact “still in call” strip — sits above SelfControls in the Space sidebar
 * (Discord-style Voice Connected).
 *
 * Avoid Tailwind opacity modifiers on CSS-var colors (border-accent/25 etc.) —
 * they resolve to invalid/white borders.
 */
export default function VoiceActiveBar({ room, onReturn, onLeave }) {
  if (!room) return null
  return (
    <div className="shrink-0 px-2.5 pt-2.5 pb-1.5 bg-surface1">
      <div className="rounded-lg px-2.5 py-2 flex items-center gap-2 min-w-0 bg-accent-soft">
        <button
          type="button"
          onClick={onReturn}
          className="min-w-0 flex-1 text-left group"
          title="Voltar para a call"
        >
          <span className="flex items-center gap-1.5 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-positive animate-pulse" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-wide leading-none text-positive">
              Em call
            </span>
          </span>
          <span className="block text-[12px] font-medium text-strong truncate group-hover:underline decoration-white/25 underline-offset-2">
            {room.name}
          </span>
        </button>
        <button
          type="button"
          onClick={onLeave}
          title="Sair da call"
          aria-label="Sair da call"
          className="
            vc-voice-leave
            shrink-0 h-7 px-2 rounded-md
            inline-flex items-center gap-1
            text-[11px] font-semibold text-danger
            transition-colors
          "
        >
          <PhoneOff size={12} strokeWidth={2.25} />
          Sair
        </button>
      </div>
    </div>
  )
}
