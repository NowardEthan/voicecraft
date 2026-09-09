/**
 * RoomPreview — right-column preview that updates with type + name + theme + icon.
 *
 * Renders a type-specific component. Each preview shows the room name in
 * its header so name edits reflect immediately, and uses the space's theme
 * color via the passed accent (so changing theme in Step 1 propagates here
 * when the user goes back and forward).
 */
import { ConversationPreview } from './previews/ConversationPreview.jsx'
import { VoicePreview } from './previews/VoicePreview.jsx'
import { StudyPreview } from './previews/StudyPreview.jsx'
import { GamesPreview } from './previews/GamesPreview.jsx'
import { MusicPreview } from './previews/MusicPreview.jsx'

export function RoomPreview({ typeKey, typeLabel, roomName }) {
  if (!typeKey) {
    return (
      <div className="h-full min-h-[180px] rounded-[12px] border border-dashed border-line bg-[#16161a]/40 flex items-center justify-center px-6 text-center">
        <p className="text-[12px] text-muted leading-relaxed">
          Escolha um tipo de sala para ver a prévia.
        </p>
      </div>
    )
  }
  const common = { roomName, typeLabel }
  switch (typeKey) {
    case 'conversation': return <ConversationPreview {...common} />
    case 'voice':        return <VoicePreview {...common} />
    case 'study':        return <StudyPreview {...common} />
    case 'games':        return <GamesPreview {...common} />
    case 'music':        return <MusicPreview {...common} />
    default:             return null
  }
}
