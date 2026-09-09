/**
 * GamesPreview — preview of a "Jogos" (gaming / co-op lobby) room.
 *
 * Visual: room name + "Participantes" section showing empty avatar slots
 * (a "lobby" affordance). No real participant data — visual only.
 */
import { Gamepad2, Users } from 'lucide-react'

export function GamesPreview({ roomName, typeLabel }) {
  const slots = [0, 1, 2, 3]
  return (
    <div className="flex flex-col h-full rounded-[12px] border border-line bg-[#16161a] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,63,108,0.30) 0%, rgba(255,63,108,0.14) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,63,108,0.35)',
          }}
        >
          <Gamepad2 size={18} strokeWidth={1.7} className="text-[#ffb3c2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-strong leading-tight truncate">
            {roomName || 'lobby'}
          </p>
          <p className="text-[11px] text-muted leading-tight">{typeLabel || 'Jogos'}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
          <Users size={12} strokeWidth={1.75} />
          0/4
        </span>
      </div>

      <div className="flex-1 flex flex-col px-4 py-4 gap-3 min-h-[140px]">
        <p className="text-[10.5px] font-semibold text-muted uppercase tracking-wider">
          Lobby
        </p>
        <div className="grid grid-cols-4 gap-2">
          {slots.map((s) => (
            <div
              key={s}
              className="aspect-square rounded-[10px] border border-dashed border-line flex items-center justify-center text-muted/40"
              aria-label="Slot vazio"
            >
              <Users size={16} strokeWidth={1.4} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted leading-relaxed text-center mt-1">
          Convide amigos para entrar no lobby e combinar a próxima partida.
        </p>
      </div>
    </div>
  )
}
