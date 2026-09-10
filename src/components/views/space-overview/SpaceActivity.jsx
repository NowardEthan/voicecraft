import { memo, useMemo } from 'react'
import { Activity, ChevronRight, Radio, UserPlus } from 'lucide-react'
import { PersonAvatar } from '../../../features/people/components/PersonAvatar'
import { memberDisplayName, membersInRoom } from './overviewHelpers'

const SpaceActivity = memo(function SpaceActivity({
  space,
  members = [],
  rooms = [],
  onSelectRoom,
}) {
  const items = useMemo(() => {
    const out = []
    for (const room of rooms) {
      const people = membersInRoom(members, room.id)
      for (const m of people.slice(0, 3)) {
        out.push({
          id: `${m.userId}-${room.id}`,
          kind: 'in-room',
          member: m,
          room,
          title: `${memberDisplayName(m)} está em #${room.name || 'sala'}`,
          detail: `Ativo agora em ${space?.name || 'Space'}`,
        })
      }
    }
    const onlineIdle = members.filter((m) => m.online && !m.location?.roomId).slice(0, 3)
    for (const m of onlineIdle) {
      out.push({
        id: `online-${m.userId}`,
        kind: 'online',
        member: m,
        title: `${memberDisplayName(m)} entrou no ${space?.name || 'Space'}`,
        detail: 'Online agora',
      })
    }
    return out.slice(0, 6)
  }, [members, rooms, space?.name])

  return (
    <section className="rounded-[18px] border border-white/[0.07] bg-[#14161c]/90 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Activity size={15} className="text-accent shrink-0" strokeWidth={1.75} />
          <h2 className="text-[14.5px] font-semibold text-strong tracking-tight">Atividade do Space</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-5 pb-5">
          <div className="rounded-[14px] border border-dashed border-white/[0.08] bg-[#0e1016]/55 px-4 py-8 text-center">
            <p className="text-[13.5px] font-semibold text-strong">Ainda quieto por aqui</p>
            <p className="text-[12.5px] text-muted mt-1 leading-snug max-w-md mx-auto">
              A atividade do Space aparece aqui quando pessoas entram em salas ou ficam online.
            </p>
          </div>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => { if (item.room) onSelectRoom?.(item.room) }}
                className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-[14px] hover:bg-white/[0.04] transition-colors group"
              >
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    item.kind === 'in-room' ? 'bg-accent/15 text-accent' : 'bg-emerald-500/15 text-emerald-400'
                  }`}
                >
                  {item.kind === 'in-room' ? <Radio size={14} /> : <UserPlus size={14} />}
                </span>
                <PersonAvatar
                  src={item.member?.photoURL}
                  name={memberDisplayName(item.member)}
                  userId={item.member?.userId}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] text-strong leading-snug font-medium">
                    {item.title}
                  </p>
                  <p className="text-[11.5px] text-muted mt-0.5 truncate">{item.detail}</p>
                </div>
                <ChevronRight size={16} className="text-muted/60 group-hover:text-accent shrink-0 transition-colors" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
})

export default SpaceActivity
