/**
 * RecentRoomActivity — a real activity feed rendered in the right-side
 * RoomActivitySidebar. Consumes the activity array produced by
 * useVoiceRoom, which is fed by real signaling events
 * (peer-joined, peer-left, screen-share). NEVER renders fabricated
 * events: if the feed is empty, we say so.
 */
import { LogIn, LogOut, Monitor, Sparkles, MessageCircle, Video } from 'lucide-react'
import { PersonAvatar } from '../../../../people'

const KIND_META = {
  'self-joined': { icon: Sparkles, label: 'entrou na sala',       color: 'text-accent' },
  'peer-joined': { icon: LogIn,    label: 'entrou na sala',            color: 'text-positive' },
  'peer-left':   { icon: LogOut,   label: 'saiu da sala',              color: 'text-muted' },
  'screen-share':{ icon: Monitor,  label: 'compartilhou a tela',      color: 'text-accent' },
  'camera':      { icon: Video,    label: 'ligou a câmera',           color: 'text-accent' },
  'thought':     { icon: MessageCircle, label: 'compartilhou um pensamento', color: 'text-ink' },
}

function relativeTime(ts) {
  const diff = Math.max(0, Date.now() - ts)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'agora'
  const min = Math.floor(sec / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  return `há ${Math.floor(h / 24)} d`
}

export function RecentRoomActivity({ activity, currentUserId, members = [] }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 pt-3 pb-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Atividades recentes
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {activity.length === 0 ? (
          <p className="px-2 py-3 text-[11.5px] text-muted">
            Nenhuma atividade ainda.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {activity.map(evt => {
              const meta = KIND_META[evt.kind] || KIND_META['peer-joined']
              const Icon = meta.icon
              const isSelf = evt.userId === currentUserId
              const label = evt.kind === 'camera' && evt.meta?.active === false
                ? 'desligou a câmera'
                : evt.kind === 'screen-share' && evt.meta?.active === false
                  ? 'parou de compartilhar'
                  : meta.label
              return (
                <li
                  key={evt.id}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-input"
                >
                  <PersonAvatar
                    src={evt.photoURL || members.find((m) => m.userId === evt.userId)?.photoURL}
                    name={evt.displayName}
                    userId={evt.userId}
                    size={28}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11.5px] leading-tight truncate">
                      <span
                        className="font-semibold"
                        style={{ color: isSelf ? 'var(--space-accent)' : 'var(--space-accent)' }}
                      >
                        {isSelf ? 'Você' : (evt.displayName || 'alguém')}
                      </span>{' '}
                      <span className={meta.color}>{label}</span>
                    </p>
                    {evt.kind === 'thought' && evt.meta?.text && (
                      <p className="text-[11px] text-ink/80 mt-0.5 truncate">“{evt.meta.text}”</p>
                    )}
                    <p className="text-[10px] text-muted mt-0.5 tabular-nums">
                      {relativeTime(evt.at)}
                    </p>
                  </div>
                  <Icon size={12} className={`${meta.color} shrink-0`} aria-hidden />
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
