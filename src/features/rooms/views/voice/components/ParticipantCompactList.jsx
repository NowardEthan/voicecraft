/**
 * ParticipantCompactList — compact list of everyone in the room.
 * Used in the right-side RoomActivitySidebar.
 */
import { MicOff, Mic } from 'lucide-react'
import { PersonAvatar } from '../../../../people'

export function ParticipantCompactList({
  participants,
  currentUserId,
  selfSpeaking,
  remoteSpeaking,
  selfMuted,
}) {
  if (participants.length === 0) {
    return (
      <p className="px-4 py-3 text-[11.5px] text-muted">Ninguém na sala ainda.</p>
    )
  }
  return (
    <ul className="px-2 space-y-0.5">
      {participants.map(p => {
        const isSelf = p.userId === currentUserId
        const speaking = isSelf ? !!selfSpeaking : !!remoteSpeaking?.[p.userId]
        const muted    = isSelf ? selfMuted : false
        return (
          <li
            key={p.userId}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-input"
          >
            <div className="relative shrink-0">
              <PersonAvatar src={p.photoURL} name={p.displayName} userId={p.userId} size={28} />
              {speaking && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent border-2 border-[#15171d]"
                  aria-hidden
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-semibold text-strong leading-tight truncate">
                {p.displayName || 'convidado'}
                {isSelf && <span className="text-muted font-normal ml-1">(você)</span>}
              </p>
              <p className="text-[10px] text-muted leading-tight">
                {speaking
                  ? 'Falando agora'
                  : muted
                    ? 'Microfone desligado'
                    : 'Ouvindo'}
              </p>
            </div>
            {muted && (
              <MicOff size={11} className="text-danger shrink-0" aria-label="Microfone desligado" />
            )}
          </li>
        )
      })}
    </ul>
  )
}
