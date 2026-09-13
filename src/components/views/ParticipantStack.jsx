/**
 * ParticipantStack — horizontal stack of online participant avatars.
 *
 * Layout component (Horizontal Layout Group, à la Unity):
 *   - Shows up to 3 member avatars stacked with negative margin
 *     (overlapping rings).
 *   - Each avatar opens the user profile on click (window.__vcOpenProfile).
 *   - If there are more than 3, shows a "+N" badge at the end.
 *
 * Standalone — receives members + selfId, no internal state.
 */
import { PersonAvatar } from '../../features/people'

export default function ParticipantStack({ members, selfId }) {
  const shown = members.slice(0, 3)
  const rest = members.length - shown.length

  const openProfile = (userId) => {
    if (typeof window !== 'undefined' && window.__vcOpenProfile) {
      window.__vcOpenProfile(userId)
    }
  }

  return (
    <div className="flex -space-x-1.5">
      {shown.map(m => (
        <button
          key={m.userId}
          type="button"
          onClick={(e) => { e.stopPropagation(); openProfile(m.userId) }}
          className="rounded-full ring-2 ring-[#12141a] transition-transform hover:scale-125 hover:z-10"
          title={m.displayName || (m.userId === selfId ? 'você' : 'convidado')}
        >
          <PersonAvatar src={m.photoURL} name={m.displayName} userId={m.userId} size={26} />
        </button>
      ))}
      {rest > 0 && (
        <div className="w-7 h-7 rounded-full ring-2 ring-[#12141a] bg-surface2 text-muted text-[10px] font-semibold flex items-center justify-center">
          +{rest}
        </div>
      )}
    </div>
  )
}
