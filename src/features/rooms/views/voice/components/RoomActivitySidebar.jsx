/**
 * RoomActivitySidebar — right-side panel for the voice room.
 *
 * Two stacked regions:
 *   1. Na sala agora (N) — compact list of all current participants
 *      with their state (speaking / muted / listening).
 *   2. Atividades recentes — the real activity feed (peer-joined,
 *      peer-left, screen-share), populated by the useVoiceRoom hook
 *      from actual signaling events. No fabricated data.
 *
 * This replaces the old `RightActivitySidebar` inside VoiceRoomView
 * and the old shell `PeoplePanel` was kept separate for the Spaces
 * outside a call.
 */
import { useState } from 'react'
import { X, UserPlus, Users, Smile } from 'lucide-react'
import { ParticipantCompactList } from './ParticipantCompactList'
import { RecentRoomActivity } from './RecentRoomActivity'

export function RoomActivitySidebar({
  participants,
  currentUserId,
  selfSpeaking,
  remoteSpeaking,
  selfMuted,
  activity,
  onClose,
  onInvite,
  onSendThought,
  selfStatus,
  onStatusChange,
}) {
  return (
    <aside
      aria-label="Atividade da sala"
      className="
        relative z-10 w-full h-full
        flex flex-col
        bg-[#15171d]
        border-l border-white/[0.06]
      "
    >
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-muted" />
          <h2 className="text-[13.5px] font-semibold text-strong tracking-tight">
            Na sala agora <span className="text-muted">({participants.length})</span>
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onInvite}
            aria-label="Convidar pessoas"
            title="Convidar pessoas"
            className="
              w-7 h-7 rounded-md flex items-center justify-center
              text-accent hover:bg-accent/10
              transition-colors duration-150
            "
          >
            <UserPlus size={13} strokeWidth={1.8} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar painel"
              title="Fechar painel"
              className="
                w-7 h-7 rounded-md flex items-center justify-center
                text-muted hover:text-strong hover:bg-white/5
                transition-colors duration-150
              "
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Participants */}
      <div className="shrink-0 max-h-[42%] overflow-y-auto py-1.5 border-b border-white/[0.06]">
        <ParticipantCompactList
          participants={participants}
          currentUserId={currentUserId}
          selfSpeaking={selfSpeaking}
          remoteSpeaking={remoteSpeaking}
          selfMuted={selfMuted}
        />
      </div>

      {/* Recent activity — real events only */}
      <RecentRoomActivity activity={activity} currentUserId={currentUserId} members={participants} />

      <ThoughtComposer
        selfStatus={selfStatus}
        onStatusChange={onStatusChange}
        onSendThought={onSendThought}
      />
    </aside>
  )
}

function ThoughtComposer({ selfStatus, onStatusChange, onSendThought }) {
  const [text, setText] = useState('')
  const [statusDraft, setStatusDraft] = useState(selfStatus || '')

  const submit = (e) => {
    e?.preventDefault?.()
    const trimmed = text.trim()
    if (!trimmed) return
    onSendThought?.(trimmed)
    setText('')
  }

  const saveStatus = () => {
    onStatusChange?.(statusDraft)
  }

  return (
    <div className="shrink-0 px-3 py-3 border-t border-white/[0.06] space-y-2">
      {onStatusChange && (
        <input
          type="text"
          value={statusDraft}
          maxLength={40}
          onChange={(e) => setStatusDraft(e.target.value)}
          onBlur={saveStatus}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveStatus(); e.currentTarget.blur() } }}
          placeholder="Seu status (ex.: Só na vibe)"
          className="w-full h-8 px-3 rounded-pill bg-white/[0.04] border border-white/[0.08] text-[12px] text-strong placeholder:text-muted focus:outline-none focus:border-accent/40"
        />
      )}
      <form onSubmit={submit} className="flex items-center gap-2">
        <Smile size={14} className="shrink-0 text-muted" />
        <input
          type="text"
          value={text}
          maxLength={180}
          onChange={(e) => setText(e.target.value)}
          placeholder="Compartilhe um pensamento…"
          className="flex-1 min-w-0 h-9 px-3 rounded-pill bg-white/[0.04] border border-white/[0.08] text-[12.5px] text-strong placeholder:text-muted focus:outline-none focus:border-accent/40"
        />
      </form>
    </div>
  )
}
