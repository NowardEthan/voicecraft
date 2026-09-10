/**
 * SpaceOverview — live Space dashboard (post-setup home).
 *
 * With ≥1 room: hero + recent conversations + live voice + next event + activity.
 * With 0 rooms: hero + short empty state to create the first room.
 */
import { memo, useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import EmptyState from '../../../shared/ui/EmptyState'
import SpaceSettingsModal from '../../../features/spaces/components/SpaceSettingsModal'
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
    else onCreateRoom?.('voice')
  }

  const handleSelectRoom = (room) => {
    if (!room || room.id === '__optimistic__') return
    onSelectRoom?.(room)
  }

  const activeCta = activeRoom
    ? (isVoiceRoom(activeRoom) || liveCount > 0
      ? 'Entrar na sala ativa'
      : `Abrir ${activeRoom.name || 'sala'}`)
    : 'Criar sala de voz'

  const canEditSpace = isCreator && typeof onEditSpace === 'function'

  return (
    <div className="@container space-y-4 sm:space-y-5">
      <SpaceHero
        space={space}
        members={members}
        onlineCount={onlineCount}
        activeRoomLabel={activeCta}
        onJoinActive={handleJoinActive}
        onInvite={onInvite}
        onMore={canEditSpace ? () => setSettingsOpen(true) : undefined}
      />

      {!hasRooms ? (
        <EmptyState
          icon={MessageCircle}
          title="Crie sua primeira sala"
          body="Adicione uma sala de conversa ou voz para o Space ganhar vida."
          action={{ label: 'Criar sala', onClick: () => onCreateRoom?.('conversation') }}
          accent
        />
      ) : (
        <>
          <EventSpotlightBar
            events={space.events}
            members={members}
            onOpenEvents={onOpenEvents}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.85fr)] gap-4 sm:gap-5 items-start">
            <RecentConversations
              rooms={textRooms}
              members={members}
              onSelectRoom={handleSelectRoom}
              onBrowseAll={() => {
                const first = textRooms[0] || rooms[0]
                handleSelectRoom(first)
              }}
            />
            <div className="space-y-4 sm:space-y-5">
              <LiveNowCard
                rooms={rooms}
                members={members}
                onSelectRoom={handleSelectRoom}
                onBrowseRooms={() => onCreateRoom?.('voice')}
              />
              <NextEventCard
                events={space.events}
                onOpenEvents={onOpenEvents}
              />
            </div>
          </div>

          <SpaceActivity
            space={space}
            members={members}
            rooms={rooms}
            onSelectRoom={handleSelectRoom}
          />
        </>
      )}

      {canEditSpace && (
        <SpaceSettingsModal
          open={settingsOpen}
          space={space}
          onSave={onEditSpace}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
})

export default SpaceOverview
export { default as SpaceHero } from './SpaceHero'
