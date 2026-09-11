/**
 * RoomNameField — controlled text input for the first room's name.
 *
 * Spec:
 *   - 48–52px tall, single line, transparent-ish bg slightly darker than modal
 *   - Coral border on focus only
 *   - Char counter (X/64) right-aligned, subtle
 *   - Max 64 chars enforced via maxLength
 *   - Does NOT fill the column — sized to its content via max-width
 */
import { useId } from 'react'

export const ROOM_NAME_MAX = 64

export function RoomNameField({ value, onChange, placeholder = 'geral', style }) {
  const id = useId()
  const count = (value || '').length
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Nome da sala
        </label>
        <span className="text-[11px] text-muted tabular-nums" aria-live="polite">
          {count}/{ROOM_NAME_MAX}
        </span>
      </div>
      <input
        id={id}
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        maxLength={ROOM_NAME_MAX}
        placeholder={placeholder}
        style={style}
        className="
          w-full h-[50px] px-3.5 rounded-[10px]
          bg-[#0f1014] border border-line
          text-[14px] text-strong placeholder:text-muted
          focus:outline-none focus:border-accent
          transition-colors
        "
      />
    </div>
  )
}
