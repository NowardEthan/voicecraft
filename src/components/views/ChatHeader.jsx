/** Premium conversation header with progressive actions. */
import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import { purposeOf } from '../../features/rooms'
import { RoomIconMark } from '../../features/rooms/components/RoomIconMark'
import ParticipantStack from './ParticipantStack'
import ChatHeaderActions from './ChatHeaderActions'
import PinnedMessagesPanel from '../../features/chat/PinnedMessagesPanel'
import ConversationSearch from './ConversationSearch'

export default function ChatHeader({
  room, accent, nameStyle, onlineMembers, currentUserId, onlineCount, chatLocked = false,
  density, onDensityChange, onInvite, onClose, pinnedMessages = [], members = [], canModerate = false,
  onJumpToPinned, onUnpinMessage, search, notificationKey = '', commandsOpen = false, onToggleCommands,
}) {
  const [pinsOpen, setPinsOpen] = useState(false)
  const pinButtonRef = useRef(null)
  const searchButtonRef = useRef(null)
  useEffect(() => { setPinsOpen(false) }, [room?.id])
  const purpose = purposeOf(room)
  return (
    <header className="@container vc-channel-header vc-conversation-header">
      <div className="vc-channel-header__main">
        <div className="vc-channel-identity">
          <span className="vc-conversation-room-icon" style={{ '--vc-room-accent': accent }} aria-label={`Sala de ${purpose.label}`}><RoomIconMark room={room} size={19} /></span>
          <div className="vc-channel-copy">
            <h1><span className="vc-channel-name" style={nameStyle || undefined}>{room.name}</span>{chatLocked && <span className="vc-channel-locked"><Lock size={11} /> Trancada</span>}</h1>
            <p>{chatLocked ? 'Somente moderadores podem enviar mensagens' : purpose.description}</p>
          </div>
        </div>
        <div className="vc-channel-presence hidden @[760px]:flex"><ParticipantStack members={onlineMembers} selfId={currentUserId} />{onlineCount > 0 && <span>{onlineCount} online</span>}</div>
        <ChatHeaderActions
          accent={accent} density={density} onDensityChange={onDensityChange} onInvite={onInvite}
          onSearchClick={() => { setPinsOpen(false); search?.onOpen?.() }} searchButtonRef={searchButtonRef}
          onClose={onClose} pinCount={pinnedMessages.length} pinsOpen={pinsOpen}
          onTogglePins={() => setPinsOpen((value) => !value)} pinButtonRef={pinButtonRef}
          notificationKey={notificationKey} commandsOpen={commandsOpen} onToggleCommands={onToggleCommands}
        />
      </div>
      <ConversationSearch {...search} restoreFocusRef={searchButtonRef} />
      <PinnedMessagesPanel open={pinsOpen && !search?.open} onClose={() => setPinsOpen(false)} messages={pinnedMessages} members={members} currentUserId={currentUserId} canModerate={canModerate} accent={accent} onJump={onJumpToPinned} onUnpin={onUnpinMessage} anchorRef={pinButtonRef} />
    </header>
  )
}