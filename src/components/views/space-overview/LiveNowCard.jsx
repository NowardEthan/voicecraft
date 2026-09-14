import { memo } from 'react'
import { ArrowRight, Headphones, Mic, Radio, Signal } from 'lucide-react'
import { PersonAvatar } from '../../../features/people/components/PersonAvatar'
import VcGradientButton from '../../../shared/ui/VcGradientButton'
import { isVoiceRoom, memberDisplayName, membersInRoom, roomPurposeMeta } from './overviewHelpers'

const LiveNowCard = memo(function LiveNowCard({
  rooms = [],
  members = [],
  onSelectRoom,
  onBrowseRooms,
  accent = null,
}) {
  const voiceRooms = rooms.filter(isVoiceRoom)
  let liveRoom = null
  let livePeople = []
  for (const room of voiceRooms) {
    const people = membersInRoom(members, room.id)
    if (people.length > livePeople.length) {
      liveRoom = room
      livePeople = people
    }
  }

  const purpose = liveRoom ? roomPurposeMeta(liveRoom) : null
  const Icon = purpose?.icon || Mic
  const isLive = !!(liveRoom && livePeople.length > 0)

  return (
    <section
      className={`rounded-[18px] overflow-hidden ${
        isLive
          ? 'border border-accent/35 bg-[#14161c]/95 shadow-[0_0_0_1px_rgba(255,63,108,0.12),0_18px_40px_-24px_var(--space-accent-glow-32)]'
          : 'border border-white/[0.07] bg-[#14161c]/90'
      }`}
    >
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Signal size={14} className="text-accent shrink-0" strokeWidth={1.75} />
          <h2 className="text-[14.5px] font-semibold text-strong tracking-tight">Ao vivo agora</h2>
        </div>
        {liveRoom && (
          <button
            type="button"
            onClick={() => onSelectRoom?.(liveRoom)}
            className="text-[12.5px] font-semibold text-accent hover:opacity-90 inline-flex items-center gap-1"
          >
            Ver sala
            <ArrowRight size={12} strokeWidth={2.25} />
          </button>
        )}
      </div>

      {!isLive ? (
        <div className="px-4 sm:px-5 pb-4 pt-1">
          <div className="rounded-[14px] border border-dashed border-white/[0.08] bg-[#0e1016]/55 px-4 py-6 text-center">
            <Radio size={18} className="text-muted mx-auto mb-2" />
            <p className="text-[13.5px] font-semibold text-strong">Nenhuma sala ao vivo</p>
            <p className="text-[12.5px] text-muted mt-1 leading-snug">
              Quando alguém entrar numa sala de voz, ela aparece aqui.
            </p>
            {voiceRooms[0] && (
              <VcGradientButton
                size="sm"
                accent={accent}
                className="mt-3.5"
                onClick={() => onSelectRoom?.(voiceRooms[0])}
              >
                <Headphones size={13} />
                Abrir {voiceRooms[0].name || 'sala de voz'}
              </VcGradientButton>
            )}
            {!voiceRooms[0] && onBrowseRooms && (
              <VcGradientButton
                size="sm"
                accent={accent}
                className="mt-3.5"
                onClick={onBrowseRooms}
              >
                Criar sala de voz
              </VcGradientButton>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-5 pb-4 pt-1">
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
              style={{ background: purpose.soft, color: purpose.color }}
            >
              <Icon size={16} strokeWidth={1.8} />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-strong truncate">
                {liveRoom.name || purpose.label}
              </p>
              <p className="text-[12px] text-muted">
                {livePeople.length} {livePeople.length === 1 ? 'pessoa' : 'pessoas'} na sala
              </p>
            </div>
          </div>

          <ul className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-3 mb-4">
            {livePeople.slice(0, 6).map((m, idx) => {
              const speaking = idx === 0
              return (
                <li key={m.userId} className="flex flex-col items-center text-center gap-1.5 w-[64px]">
                  <span
                    className={`rounded-full p-[2px] ${
                      speaking
                        ? 'bg-gradient-to-br from-accent to-accent/40 shadow-[0_0_18px_var(--space-accent-glow-32)]'
                        : 'bg-transparent'
                    }`}
                  >
                    <PersonAvatar
                      src={m.photoURL}
                      name={memberDisplayName(m)}
                      userId={m.userId}
                      size={48}
                      className="ring-2 ring-[#14161c]"
                    />
                  </span>
                  <p className="text-[11.5px] font-semibold text-strong truncate w-full">
                    {memberDisplayName(m)}
                  </p>
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${
                      speaking ? 'text-accent' : 'text-muted'
                    }`}
                  >
                    {speaking ? <Mic size={10} /> : <Headphones size={10} />}
                    {speaking ? 'Falando' : 'Ouvindo'}
                  </span>
                </li>
              )
            })}
          </ul>

          <VcGradientButton
            size="lg"
            block
            accent={accent}
            onClick={() => onSelectRoom?.(liveRoom)}
          >
            <Headphones size={15} />
            Entrar na sala
            <ArrowRight size={14} strokeWidth={2.4} />
          </VcGradientButton>
        </div>
      )}
    </section>
  )
})

export default LiveNowCard
