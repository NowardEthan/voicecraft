/**
 * SpaceOverview — live Space dashboard (post-setup home).
 *
 * With ≥1 room: hero + recent conversations + live voice + next event + activity.
 * With 0 rooms: hero + short empty state to create the first room.
 */
import { memo, useMemo, useState } from 'react'
import { CalendarDays, Hash, MessageCircle, Palette, Plus, Radio, UserPlus, Users } from 'lucide-react'
import EmptyState from '../../../shared/ui/EmptyState'
import SpaceSettingsModal from '../../../features/spaces/components/SpaceSettingsModal'
import { Appear, AppearGroup, AppearItem } from '../../../shared/motion/Appear'
import SpaceHero from './SpaceHero'
import EventSpotlightBar from './EventSpotlightBar'
import RecentConversations from './RecentConversations'
import LiveNowCard from './LiveNowCard'
import NextEventCard from './NextEventCard'
import SpaceActivity from './SpaceActivity'
import {
  isTextRoom,
  isVoiceRoom,
  mergeRooms,
  onlineMembers,
  pickActiveRoom,
} from './overviewHelpers'
import { motion } from 'framer-motion'

const SpaceOverview = memo(function SpaceOverview({
  space,
  members = [],
  currentUserId,
  currentUserName,
  onSelectRoom,
  onCreateRoom,
  onInvite,
  onOpenEvents,
  onEditSpace,
  isCreator = false,
  canEditSpace: canEditSpaceProp = false,
  canManageRooms = false,
  optimisticFirstRoom,
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)

  const rooms = useMemo(
    () => (space ? mergeRooms(space.rooms, optimisticFirstRoom) : []),
    [space?.rooms, optimisticFirstRoom],
  )
  const onlineCount = useMemo(() => onlineMembers(members).length, [members])
  const textRooms = useMemo(() => rooms.filter(isTextRoom), [rooms])
  const { room: activeRoom, liveCount } = useMemo(
    () => pickActiveRoom(rooms, members),
    [rooms, members],
  )

  if (!space) return null

  const hasRooms = rooms.length > 0

  const handleJoinActive = () => {
    if (activeRoom?.id === '__optimistic__') return
    if (activeRoom) onSelectRoom?.(activeRoom)
    else onCreateRoom?.({ initialPurpose: 'voice' })
  }

  const handleSelectRoom = (room) => {
    if (!room || room.id === '__optimistic__') return
    onSelectRoom?.(room)
  }

  const canEditSpace = (canEditSpaceProp || isCreator) && typeof onEditSpace === 'function'
  const canCreateRoom = canManageRooms || isCreator
  const activeCta = activeRoom
    ? (isVoiceRoom(activeRoom) || liveCount > 0
      ? 'Entrar na sala ativa'
      : `Abrir ${activeRoom.name || 'sala'}`)
    : (canCreateRoom ? 'Criar sala de voz' : null)

  return (
    <AppearGroup
      key={space.id}
      className="vc-space-overview @container space-y-4 sm:space-y-5"
      stagger={0.055}
      delayChildren={0.04}
    >
      <AppearItem as={motion.div}>
        <SpaceHero
          space={space}
          members={members}
          onlineCount={onlineCount}
          activeRoomLabel={activeCta}
          onJoinActive={activeCta ? handleJoinActive : undefined}
          onInvite={onInvite}
          onCustomize={canEditSpace ? () => setSettingsOpen(true) : undefined}
        />
      </AppearItem>

      <AppearItem as={motion.div}>
        <section className="vc-space-command-strip" aria-label="Resumo do Space">
          <div className="vc-space-command-strip__metrics">
            <div className="vc-space-metric">
              <Users size={15} />
              <span><strong>{members.length}</strong> membros</span>
            </div>
            <div className="vc-space-metric is-online">
              <span className="vc-space-metric__dot" />
              <span><strong>{onlineCount}</strong> online</span>
            </div>
            <div className="vc-space-metric">
              <Hash size={15} />
              <span><strong>{rooms.length}</strong> salas</span>
            </div>
            <div className="vc-space-metric">
              <Radio size={15} />
              <span><strong>{liveCount}</strong> ao vivo</span>
            </div>
          </div>
          <div className="vc-space-command-strip__actions" aria-label="Ações rápidas">
            {canCreateRoom && (
              <button type="button" onClick={() => onCreateRoom?.({ initialPurpose: 'conversation' })}>
                <Plus size={14} /> Criar sala
              </button>
            )}
            {onInvite && (
              <button type="button" onClick={onInvite}>
                <UserPlus size={14} /> Convidar
              </button>
            )}
            {onOpenEvents && (
              <button type="button" onClick={onOpenEvents}>
                <CalendarDays size={14} /> Eventos
              </button>
            )}
            {canEditSpace && (
              <button type="button" onClick={() => setSettingsOpen(true)} className="is-accent">
                <Palette size={14} /> Personalizar
              </button>
            )}
          </div>
        </section>
      </AppearItem>

      {!hasRooms ? (
        <AppearItem as={motion.div}>
          <EmptyState
            icon={MessageCircle}
            title="Crie sua primeira sala"
            body="Adicione uma sala de conversa ou voz para o Space ganhar vida."
            action={canCreateRoom ? { label: 'Criar sala', onClick: () => onCreateRoom?.({ initialPurpose: 'conversation' }) } : undefined}
            accent
          />
        </AppearItem>
      ) : (
        <>
          <AppearItem as={motion.div}>
            <EventSpotlightBar
              events={space.events}
              members={members}
              onOpenEvents={onOpenEvents}
            />
          </AppearItem>

          <div className="vc-space-dashboard-grid">
            <AppearItem as={motion.div} className="vc-space-dashboard-grid__conversations">
              <RecentConversations
                rooms={textRooms}
                members={members}
                onSelectRoom={handleSelectRoom}
                onBrowseAll={() => {
                  const first = textRooms[0] || rooms[0]
                  handleSelectRoom(first)
                }}
              />
            </AppearItem>
            <AppearItem as={motion.div} className="vc-space-dashboard-grid__live">
              <LiveNowCard
                rooms={rooms}
                members={members}
                onSelectRoom={handleSelectRoom}
                onBrowseRooms={canCreateRoom ? () => onCreateRoom?.({ initialPurpose: 'voice' }) : undefined}
              />
            </AppearItem>
            <AppearItem as={motion.div} className="vc-space-dashboard-grid__event">
              <NextEventCard events={space.events} onOpenEvents={onOpenEvents} />
            </AppearItem>
            <AppearItem as={motion.div} className="vc-space-dashboard-grid__activity">
              <SpaceActivity
                space={space}
                members={members}
                rooms={rooms}
                onSelectRoom={handleSelectRoom}
              />
            </AppearItem>
          </div>
        </>
      )}

      {canEditSpace && (
        <SpaceSettingsModal
          open={settingsOpen}
          space={space}
          onSave={onEditSpace}
          onClose={() => setSettingsOpen(false)}
          isCreator={isCreator}
        />
      )}
    </AppearGroup>
  )
})

export default SpaceOverview
export { default as SpaceHero } from './SpaceHero'
