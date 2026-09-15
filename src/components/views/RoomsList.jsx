/**
 * RoomList — the "Salas" tab. Grouped by purpose, NOT by voice/text.
 *
 * Per DESIGN_SYSTEM §7.2, room names never carry a "#" prefix; the
 * purpose icon + label identifies the activity. A sala is a place, not
 * a hashtag channel.
 *
 * The active/selected room gets the Space accent (left rail bar + tinted
 * row). An inline "+ criar sala" lives at the bottom so the user can pick
 * the purpose they actually want.
 */
import { useState } from 'react'
import { Plus, Trash2, ChevronDown } from 'lucide-react'
import EmptyState from '../../shared/ui/EmptyState'
import { groupByPurpose, PURPOSE_BY_KEY } from '../../features/rooms'
import { prefetchRoomMessages } from '../../shared/cache/chatPrefetch'

export default function RoomList({
  space,
  currentRoomId,
  selectedRoomId,
  isCreator,
  onSelectRoom,
  onCreateRoom,
  onDeleteRoom,
  purposeCounts,
}) {
  const [collapsed, setCollapsed] = useState({})
  const [creatingFor, setCreatingFor] = useState(null) // purpose key | null
  const [newName, setNewName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  if (!space) return null
  const rooms = space.rooms || []
  const grouped = groupByPurpose(rooms)

  const toggle = (key) => setCollapsed(c => ({ ...c, [key]: !c[key] }))

  const commitCreate = () => {
    const name = newName.trim()
    if (!name || !creatingFor) return
    onCreateRoom?.(creatingFor, name)
    setNewName('')
    setCreatingFor(null)
  }

  const cancelCreate = () => {
    setCreatingFor(null)
    setNewName('')
  }

  const askDelete = (roomId) => {
    if (confirmDelete === roomId) {
      onDeleteRoom?.(roomId)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(roomId)
      setTimeout(() => setConfirmDelete(null), 2500)
    }
  }

  if (rooms.length === 0) {
    return (
      <div className="px-4 py-6">
        <EmptyState
          icon={PURPOSE_BY_KEY.conversation.icon}
          title="Nenhuma sala ainda"
          body="Crie salas por atividade — conversa, voz, estudo, jogo ou música. Cada uma com sua vibe."
          action={{ label: 'Criar primeira sala', onClick: () => setCreatingFor('conversation') }}
          accent
        />
        {creatingFor && (
          <InlineCreate
            purposeKey={creatingFor}
            value={newName}
            onChange={setNewName}
            onCommit={commitCreate}
            onCancel={cancelCreate}
          />
        )}
      </div>
    )
  }

  return (
    <div className="py-2">
      {grouped.map(({ purpose, rooms }) => {
        const Icon = purpose.icon
        const isCollapsed = collapsed[purpose.key]
        return (
          <section key={purpose.key} className="px-2 pb-3">
            <button
              onClick={() => toggle(purpose.key)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 group"
              aria-expanded={!isCollapsed}
            >
              <ChevronDown
                size={10}
                className={
                  'text-muted group-hover:text-ink transition-transform ' +
                  (isCollapsed ? '-rotate-90' : '')
                }
              />
              <Icon size={11} style={{ color: purpose.color }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-ink/65 group-hover:text-strong transition-colors">
                {purpose.label}
              </span>
              <span className="text-[10px] text-muted ml-1">{rooms.length}</span>
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {rooms.map(room => {
                  const isActive = currentRoomId === room.id
                  const isSelected = selectedRoomId === room.id
                  return (
                    <RoomRow
                      key={room.id}
                      room={room}
                      spaceId={space.id}
                      isActive={isActive}
                      isSelected={isSelected}
                      purpose={purpose}
                      canDelete={isCreator && confirmDelete !== room.id}
                      confirmingDelete={confirmDelete === room.id}
                      onSelect={() => onSelectRoom?.(room)}
                      onDelete={() => askDelete(room.id)}
                      onCancelDelete={() => setConfirmDelete(null)}
                    />
                  )
                })}
                {creatingFor === purpose.key && (
                  <InlineCreate
                    purposeKey={purpose.key}
                    value={newName}
                    onChange={setNewName}
                    onCommit={commitCreate}
                    onCancel={cancelCreate}
                  />
                )}
              </div>
            )}
          </section>
        )
      })}

      {/* Footer: add new sala. Default purpose = conversation; user can rename. */}
      <div className="px-3 pt-1 pb-2 border-t border-line mt-1">
        {!creatingFor && (
          <button
            onClick={() => setCreatingFor('conversation')}
            className="
              w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md
              text-[11.5px] text-muted hover:text-strong hover:bg-surface1
              transition-colors text-left
            "
          >
            <Plus size={11} strokeWidth={2.25} />
            criar sala
          </button>
        )}
        {creatingFor && (
          <InlineCreate
            purposeKey={creatingFor}
            value={newName}
            onChange={setNewName}
            onCommit={commitCreate}
            onCancel={cancelCreate}
          />
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
function RoomRow({ room, spaceId, isActive, isSelected, purpose, canDelete, confirmingDelete, onSelect, onDelete, onCancelDelete }) {
  const Icon = purpose.icon
  const handlePointerDown = () => {
    if (spaceId && room?.id) prefetchRoomMessages(spaceId, room.id)
  }
  return (
    <div
      className={`
        group relative flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-md
        transition-colors cursor-pointer
        ${isActive
          ? 'bg-accent-soft text-strong'
          : isSelected
            ? 'bg-surface2 text-strong'
            : 'text-ink/75 hover:bg-surface1 hover:text-strong'}
      `}
      onClick={onSelect}
      onPointerDown={handlePointerDown}
    >
      {/* Left accent bar — Space-accent when active. */}
      <span
        className={`
          absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r transition-opacity
          ${isActive ? 'opacity-100 bg-accent' : 'opacity-0 bg-line'}
        `}
      />
      <Icon
        size={13}
        style={{ color: isActive ? 'var(--space-accent)' : purpose.color }}
        className="shrink-0"
      />
      <span className="text-[13px] font-medium truncate flex-1">
        {room.name}
      </span>
      {isActive && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-accent text-strong text-[9px] font-semibold uppercase tracking-wider">
          ao vivo
        </span>
      )}
      {canDelete && !confirmingDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-muted hover:text-danger hover:bg-danger/15 transition-all"
          title="Apagar sala"
          aria-label="Apagar sala"
        >
          <Trash2 size={10} />
        </button>
      )}
      {confirmingDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="px-2 py-0.5 rounded bg-danger/20 text-danger text-[10px] font-semibold hover:bg-danger/30 transition-colors"
        >
          apagar?
        </button>
      )}
    </div>
  )
}

function InlineCreate({ purposeKey, value, onChange, onCommit, onCancel }) {
  const purpose = PURPOSE_BY_KEY[purposeKey] || PURPOSE_BY_KEY.conversation
  const Icon = purpose.icon
  return (
    <div className="pl-5 pr-1 py-1">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-soft ring-1 ring-accent/30">
        <Icon size={12} style={{ color: purpose.color }} />
        <input
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onCommit()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder={`nome da sala (${purpose.label.toLowerCase()})`}
          maxLength={64}
          className="flex-1 bg-transparent text-[12.5px] text-strong placeholder:text-muted focus:outline-none"
        />
        <button
          onClick={onCommit}
          disabled={!value.trim()}
          className="text-[10px] font-semibold text-accent hover:opacity-80 disabled:opacity-30 transition-opacity"
        >
          criar
        </button>
        <button
          onClick={onCancel}
          className="text-[10px] text-muted hover:text-strong"
        >
          esc
        </button>
      </div>
    </div>
  )
}
