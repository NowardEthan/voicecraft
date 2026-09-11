import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, FolderPlus, GripVertical,
} from 'lucide-react'
import { RoomIconMark, roomAccentColor, roomSoftColor } from '../components/RoomIconMark'
import { resolveLabeledNameStyle } from '../model/roomCosmetics'
import { RoomUnreadPill } from '../../notifications'
import {
  buildRoomSections,
} from '../model/roomGroups'
import {
  createRoomGroup,
  deleteRoomGroup,
  reorderRoomsInGroup,
  subscribeRoomGroups,
  updateRoomGroup,
  setRoomPlacement,
} from '../model/roomGroupsStore'
import { RoomGroupModal } from '../components/RoomGroupModal'
import { SpaceIcon } from '../../spaces/model/spaceIcons'
import { flashToast } from '../../../shared/utils/toast'

/**
 * Sidebar rooms list with groups, reorder, and group customization.
 */
export function SpaceRoomsNav({
  space,
  rooms = [],
  currentRoomId,
  selectedRoomId,
  canManage = false,
  unreadByRoom = {},
  roomKey,
  onSelectRoom,
  onCreateRoom,
  onEditRoom,
  onDeleteRoom,
  confirmDeleteId,
  setConfirmDeleteId,
}) {
  const [groups, setGroups] = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [groupModal, setGroupModal] = useState(null) // { mode: 'create'|'edit', group?: object }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!space?.id) {
      setGroups([])
      return undefined
    }
    return subscribeRoomGroups(space.id, setGroups)
  }, [space?.id])

  const sections = useMemo(() => buildRoomSections(groups, rooms), [groups, rooms])

  const toggleCollapse = (key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const saveGroup = async (payload) => {
    if (busy || !space?.id || !groupModal) return
    setBusy(true)
    try {
      if (groupModal.mode === 'edit' && groupModal.group?.id) {
        await updateRoomGroup(space.id, groupModal.group.id, payload)
        flashToast('Grupo atualizado')
      } else {
        await createRoomGroup(space.id, payload)
        flashToast('Grupo criado')
      }
      setGroupModal(null)
    } catch (err) {
      flashToast(err?.message || 'Não deu pra salvar o grupo')
    } finally {
      setBusy(false)
    }
  }

  const removeGroup = async (groupId) => {
    if (!window.confirm('Apagar grupo? As salas ficam sem grupo.')) return
    setBusy(true)
    try {
      await deleteRoomGroup(space.id, groupId)
      flashToast('Grupo removido')
    } catch (err) {
      flashToast(err?.message || 'Não deu pra apagar')
    } finally {
      setBusy(false)
    }
  }

  const onRoomDrop = async (targetGroupId, targetIndex, roomId) => {
    if (!canManage || !space?.id || !roomId) return
    const section = sections.find((s) => (s.group?.id || null) === (targetGroupId || null))
    const ids = (section?.rooms || []).map((r) => r.id).filter((id) => id !== roomId)
    ids.splice(Math.max(0, targetIndex), 0, roomId)
    try {
      await reorderRoomsInGroup(space.id, targetGroupId || null, ids)
    } catch (err) {
      flashToast(err?.message || 'Não deu pra reordenar')
    }
  }

  const moveRoomToGroup = async (roomId, groupId) => {
    if (!canManage || !space?.id) return
    try {
      await setRoomPlacement(space.id, roomId, {
        groupId: groupId || null,
        sortOrder: Date.now(),
      })
    } catch (err) {
      flashToast(err?.message || 'Não deu pra mover')
    }
  }

  return (
    <div className="px-3 pt-2 pb-3">
      <div className="flex items-center justify-between mb-1.5 px-1 gap-1">
        <h4 className="text-[10.5px] font-semibold text-muted uppercase tracking-[0.10em]">
          Salas
        </h4>
        <div className="flex items-center gap-1">
          {canManage && (
            <button
              type="button"
              onClick={() => setGroupModal({ mode: 'create' })}
              title="Novo grupo"
              className="inline-flex items-center text-muted hover:text-accent transition-colors"
            >
              <FolderPlus size={12} strokeWidth={2.2} />
            </button>
          )}
          {canManage && (
            <button
              type="button"
              onClick={() => onCreateRoom?.()}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:opacity-80"
            >
              <Plus size={11} strokeWidth={2.5} />
              Criar sala
            </button>
          )}
        </div>
      </div>

      {rooms.length === 0 && groups.length === 0 ? (
        <p className="text-[11.5px] text-muted px-1 py-1.5 italic">Nenhuma sala ainda.</p>
      ) : (
        <div className="space-y-2.5">
          {sections.map((section) => {
            const key = section.group?.id || '__ungrouped__'
            const isCollapsed = !!collapsed[key]
            const label = section.group?.name || 'Sem grupo'
            const color = section.group?.color || 'rgba(255,255,255,0.35)'
            const groupNameStyle = section.group
              ? resolveLabeledNameStyle({
                nameStyle: section.group.nameStyle,
                fontId: section.group.fontId,
                fonts: space?.fonts,
              })
              : null

            return (
              <div key={key}>
                {(section.type === 'group' || groups.length > 0) && (
                  <div className="group/header flex items-center gap-0.5 px-0.5 mb-0.5">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(key)}
                      className="flex-1 min-w-0 flex items-center gap-1 py-0.5 text-left"
                    >
                      {isCollapsed
                        ? <ChevronRight size={11} className="text-muted shrink-0" />
                        : <ChevronDown size={11} className="text-muted shrink-0" />}
                      {section.group?.emoji ? (
                        <span className="text-[11px] leading-none">{section.group.emoji}</span>
                      ) : section.group?.icon ? (
                        <span className="shrink-0" style={{ color }}>
                          <SpaceIcon value={section.group.icon} size={11} />
                        </span>
                      ) : null}
                      <span
                        className="text-[10px] font-bold uppercase tracking-[0.12em] truncate"
                        style={{ color, ...(groupNameStyle || {}) }}
                      >
                        {label}
                      </span>
                    </button>
                    {canManage && section.group && (
                      <div className="flex items-center opacity-0 group-hover/header:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => setGroupModal({ mode: 'edit', group: section.group })}
                          className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-strong"
                          aria-label="Editar grupo"
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGroup(section.group.id)}
                          className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-danger"
                          aria-label="Apagar grupo"
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!isCollapsed && (
                  <ul
                    className="space-y-1"
                    onDragOver={(e) => { if (canManage) e.preventDefault() }}
                    onDrop={(e) => {
                      if (!canManage) return
                      e.preventDefault()
                      const roomId = e.dataTransfer.getData('text/room-id')
                      if (!roomId) return
                      onRoomDrop(section.group?.id || null, section.rooms.length, roomId)
                    }}
                  >
                    {section.rooms.map((room, index) => (
                      <RoomRow
                        key={room.id}
                        room={room}
                        index={index}
                        space={space}
                        groups={groups}
                        canManage={canManage}
                        isActive={currentRoomId === room.id || selectedRoomId === room.id}
                        hasUnread={!!(space?.id && unreadByRoom[roomKey?.(space.id, room.id)])}
                        confirming={confirmDeleteId === room.id}
                        onSelect={() => onSelectRoom?.(room)}
                        onEdit={() => onEditRoom?.(room)}
                        onAskDelete={() => setConfirmDeleteId?.(room.id)}
                        onConfirmDelete={() => {
                          onDeleteRoom?.(room.id)
                          setConfirmDeleteId?.(null)
                        }}
                        onCancelDelete={() => setConfirmDeleteId?.(null)}
                        onDragStart={(e) => {
                          if (!canManage) return
                          e.dataTransfer.setData('text/room-id', room.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDropAt={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const roomId = e.dataTransfer.getData('text/room-id')
                          if (!roomId || roomId === room.id) return
                          onRoomDrop(section.group?.id || null, index, roomId)
                        }}
                        onMoveToGroup={(gid) => moveRoomToGroup(room.id, gid)}
                      />
                    ))}
                    {section.rooms.length === 0 && section.type === 'group' && (
                      <li className="px-2 py-1.5 text-[10.5px] text-muted italic">
                        Arraste salas pra cá
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      <RoomGroupModal
        open={!!groupModal}
        mode={groupModal?.mode || 'create'}
        initial={groupModal?.group || null}
        spaceFonts={space?.fonts || []}
        busy={busy}
        onSave={saveGroup}
        onClose={() => { if (!busy) setGroupModal(null) }}
      />
    </div>
  )
}

function RoomRow({
  room,
  space,
  canManage,
  isActive,
  hasUnread,
  confirming,
  onSelect,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onDragStart,
  onDropAt,
  onMoveToGroup,
  groups = [],
}) {
  const isOptimistic = room.id === '__optimistic__'
  const accent = roomAccentColor(room)
  const soft = roomSoftColor(room)
  const nameStyle = resolveLabeledNameStyle({
    nameStyle: room.nameStyle,
    fontId: room.fontId,
    fonts: space?.fonts,
  })

  return (
    <li
      className="group relative"
      onDragOver={(e) => { if (canManage) e.preventDefault() }}
      onDrop={onDropAt}
    >
      <button
        type="button"
        draggable={canManage && !isOptimistic}
        onDragStart={onDragStart}
        onClick={() => onSelect?.()}
        aria-current={isActive ? 'true' : undefined}
        className={
          'relative w-full flex items-center gap-2 pl-2 pr-12 py-2 rounded-[10px] text-left overflow-hidden ' +
          'transition-[transform,background-color,color] duration-200 ' +
          'hover:translate-x-0.5 active:scale-[0.98] ' +
          (isActive
            ? 'bg-accent/[0.12] text-strong'
            : hasUnread
              ? 'text-strong hover:bg-surface2'
              : 'text-ink hover:bg-surface2 hover:text-strong')
        }
      >
        {canManage && !isOptimistic && (
          <GripVertical size={11} className="text-muted/50 shrink-0 -ml-0.5 cursor-grab" />
        )}
        {isActive && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
            style={{ background: accent }}
            aria-hidden
          />
        )}
        <span
          className="w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0"
          style={
            isActive
              ? { background: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }
              : { background: soft, color: accent }
          }
        >
          <RoomIconMark room={room} size={13} />
        </span>
        <p
          className={
            'min-w-0 flex-1 text-[13px] leading-tight truncate ' +
            (hasUnread && !isActive ? 'font-bold' : 'font-semibold')
          }
          style={{
            ...nameStyle,
            ...(room.color ? { color: isActive || hasUnread ? accent : undefined } : null),
          }}
        >
          {room.name}
        </p>
        {!isActive && <RoomUnreadPill show={hasUnread} />}
      </button>

      {!isOptimistic && canManage && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={onConfirmDelete}
                className="px-1.5 h-6 rounded-md bg-danger/20 text-danger text-[10px] font-semibold"
              >
                excluir?
              </button>
              <button type="button" onClick={onCancelDelete} className="text-[10px] text-muted px-1">
                não
              </button>
            </>
          ) : (
            <div className={'flex items-center transition-opacity ' + (isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
              {groups.length > 0 && (
                <select
                  aria-label="Mover para grupo"
                  className="max-w-[72px] h-6 text-[9px] rounded bg-surface2 border border-line text-muted mr-0.5"
                  value={room.groupId || ''}
                  onChange={(e) => onMoveToGroup?.(e.target.value || null)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="">—</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit?.() }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
              >
                <Pencil size={11} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAskDelete?.() }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
