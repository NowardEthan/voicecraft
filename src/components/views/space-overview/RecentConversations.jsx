import { memo } from 'react'
import { ArrowRight, ChevronRight, Hash, MessageCircle } from 'lucide-react'
import { PersonAvatar } from '../../../features/people/components/PersonAvatar'
import { memberDisplayName, membersInRoom, onlineMembers, roomPurposeMeta } from './overviewHelpers'

const RecentConversations = memo(function RecentConversations({
  rooms = [],
  members = [],
  onSelectRoom,
  onBrowseAll,
}) {
  const list = rooms.slice(0, 5)
  const online = onlineMembers(members)

  return (
    <section className="rounded-[18px] border border-white/[0.07] bg-[#14161c]/90 overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle size={15} className="text-accent shrink-0" strokeWidth={1.75} />
          <h2 className="text-[14.5px] font-semibold text-strong tracking-tight truncate">
            Conversas recentes
          </h2>
        </div>
        {onBrowseAll && (
          <button
            type="button"
            onClick={onBrowseAll}
            className="text-[12.5px] font-semibold text-accent hover:opacity-90 inline-flex items-center gap-1 shrink-0"
          >
            Ver todas
            <ArrowRight size={13} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <div className="px-5 pb-6 flex-1 flex items-center">
          <div className="w-full rounded-[14px] border border-dashed border-white/[0.08] bg-[#0e1016]/60 px-4 py-8 text-center">
            <p className="text-[13.5px] font-semibold text-strong">Nenhuma conversa ainda</p>
            <p className="text-[12.5px] text-muted mt-1 leading-snug">
              Salas de texto aparecem aqui com quem está por perto.
            </p>
          </div>
        </div>
      ) : (
        <ul className="px-3 pb-3 space-y-2 flex-1">
          {list.map((room) => {
            const purpose = roomPurposeMeta(room)
            const Icon = purpose.icon || Hash
            const inRoom = membersInRoom(members, room.id)
            const crowd = (inRoom.length ? inRoom : online).slice(0, 4)
            const extra = Math.max(0, (inRoom.length || online.length) - crowd.length)
            return (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => onSelectRoom?.(room)}
                  className="w-full text-left rounded-[14px] border border-white/[0.05] bg-[#0e1016]/55 hover:bg-[#12141a] hover:border-white/[0.1] transition-colors px-3.5 py-3 group"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: purpose.soft, color: purpose.color }}
                    >
                      <Icon size={16} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Hash size={13} className="text-muted shrink-0" />
                        <p className="text-[14px] font-semibold text-strong truncate">
                          {room.name || purpose.label}
                        </p>
                      </div>
                      <p className="text-[12px] text-muted mt-0.5 truncate">
                        {room.description || purpose.description || 'Conversa do Space'}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5">
                        <div className="flex -space-x-1.5">
                          {crowd.map((m) => (
                            <PersonAvatar
                              key={m.userId}
                              src={m.photoURL}
                              name={memberDisplayName(m)}
                              userId={m.userId}
                              size={22}
                              className="ring-2 ring-[#0e1016]"
                            />
                          ))}
                        </div>
                        {extra > 0 && (
                          <span className="text-[11px] text-muted font-medium">+{extra}</span>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end justify-between self-stretch shrink-0 min-w-[120px] pl-2">
                      <ChevronRight size={16} className="text-muted/70 group-hover:text-accent transition-colors" />
                      <p className="text-[11px] text-muted text-right max-w-[140px] line-clamp-2 leading-snug">
                        Abrir sala
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
})

export default RecentConversations
