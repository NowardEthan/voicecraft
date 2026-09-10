/**
 * RoomTypeContext — short description of the selected room kind.
 */
import { Info } from 'lucide-react'

export function RoomTypeContext({ type }) {
  if (!type) return null
  const Icon = type.icon
  const isVoice = type.key === 'voice'
  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-3 rounded-2xl bg-white/[0.04] p-3.5">
        <div
          className={[
            'w-[56px] h-[56px] shrink-0 rounded-2xl flex items-center justify-center',
            isVoice
              ? 'bg-accent text-strong shadow-[0_10px_24px_-12px_var(--space-accent-glow-40)]'
              : 'bg-white/[0.08] text-white/85',
          ].join(' ')}
        >
          <Icon size={26} strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <h3 className="text-[14px] font-semibold text-strong leading-tight">
            {type.label}
          </h3>
          <p className="text-[12.5px] text-muted leading-snug mt-0.5">
            {type.contextDescription}
          </p>
        </div>
      </div>
      <div className="flex items-start gap-2 text-[11.5px] text-muted leading-relaxed px-1">
        <Info size={13} strokeWidth={1.75} className="shrink-0 mt-[1px] text-muted" />
        <span>Você pode mudar o nome e o tipo depois.</span>
      </div>
    </div>
  )
}
