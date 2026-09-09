/**
 * RoomTypeContext — contextual card describing the selected room type.
 *
 * Shown in the left column under the name field. Content changes as the
 * user switches types. Includes a trailing hint that the type and name
 * can be changed later.
 */
import { Info } from 'lucide-react'

export function RoomTypeContext({ type }) {
  if (!type) return null
  const Icon = type.icon
  return (
    <div className="space-y-3">
      <div className="flex items-stretch gap-3 rounded-[12px] bg-[#0f1014] border border-line p-3.5">
        <div
          className="w-[58px] h-[58px] shrink-0 rounded-[12px] flex items-center justify-center"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,63,108,0.28) 0%, rgba(255,63,108,0.12) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,63,108,0.30)',
          }}
        >
          <Icon size={28} strokeWidth={1.6} className="text-[#ffb3c2]" />
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
        <span>Você poderá alterar o nome, o tipo e as configurações depois.</span>
      </div>
    </div>
  )
}
