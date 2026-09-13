import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, GripVertical,
  MoreHorizontal, Move, ArrowDown,
} from 'lucide-react'
import { createPortal } from 'react-dom'
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
    /* Pega a lista de IDs atual da seção, removendo o item sendo
     * arrastado (caso ele já esteja aqui — reordering dentro do
     * mesmo grupo). O splice abaixo adiciona na posição desejada. */
    const ids = (section?.rooms || []).map((r) => r.id).filter((id) => id !== roomId)
    /* Clamp do índice pra evitar overflow. */
    const clamped = Math.max(0, Math.min(targetIndex, ids.length))
    ids.splice(clamped, 0, roomId)
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
        {canManage && (
          <button
            type="button"
            onClick={() => setGroupModal({ mode: 'create' })}
            title="Novo grupo"
            aria-label="Novo grupo"
            className="w-6 h-6 rounded-md inline-flex items-center justify-center text-muted hover:text-accent hover:bg-white/[0.06] transition-colors"
          >
            <Plus size={14} strokeWidth={2.4} />
          </button>
        )}
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
                      <div className="flex items-center opacity-0 group-hover/header:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => onCreateRoom?.(section.group.id)}
                          className="w-5 h-5 rounded flex items-center justify-center text-muted hover:text-accent"
                          aria-label={`Criar sala em ${section.group.name}`}
                          title="Criar sala neste grupo"
                        >
                          <Plus size={11} strokeWidth={2.5} />
                        </button>
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
                      /* Drop no <ul> vazio: insere no final. */
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
                        onDropAt={(e, targetIndex, draggingId) => {
                          /* Drop-to-replace: insere o item arrastado no
                           *  índice da row alvo. O pai remove o item
                           *  sendo arrastado da lista e re-insere no
                           *  índice — se for a mesma posição, ele
                           *  efetivamente substitui a row alvo.       */
                          onRoomDrop(section.group?.id || null, targetIndex, draggingId)
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
  index,
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

  /* UX de drag-and-drop — drop-to-replace: ao soltar em cima da row
   *  alvo, o item arrastado toma o lugar dela. Sem histerese de
   *  before/after — é só "highlight da row alvo".                     */
  const [dropTargetId, setDropTargetId] = useState(null) // id da row alvo

  const handleRowDragOver = (e) => {
    if (!canManage) return
    e.preventDefault()
    if (dropTargetId !== room.id) setDropTargetId(room.id)
  }
  const handleRowDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDropTargetId(null)
  }
  const handleRowDragEnd = () => setDropTargetId(null)

  /* Listener global de dragend — garante limpeza mesmo se o drop
   * ocorre fora de qualquer row alvo.                                */
  useEffect(() => {
    if (!canManage) return undefined
    const clear = () => setDropTargetId(null)
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [canManage])

  const isDragOver = dropTargetId === room.id

  return (
    <li
      className="group/row relative"
      onDragOver={handleRowDragOver}
      onDragLeave={handleRowDragLeave}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        /* Pega o id da row sendo dropada e passa o índice dela.    */
        const draggingId = e.dataTransfer.getData('text/room-id')
        if (!draggingId || draggingId === room.id) return
        onDropAt(e, index, draggingId)
      }}
      style={isDragOver ? {
        background: `color-mix(in srgb, ${accent} 22%, transparent)`,
        boxShadow: `inset 0 0 0 2px ${accent}, 0 0 12px color-mix(in srgb, ${accent} 50%, transparent)`,
      } : undefined}
    >
      {/* Indicator — ícone "→ substituir" no canto direito da row
       *  alvo, esclarece o gesto "drop aqui toma o lugar".            */}
      {isDragOver && (
        <div
          aria-hidden
          className="absolute -right-1 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full flex items-center justify-center pointer-events-none text-like shadow-lg"
          style={{ background: accent, color: 'var(--vc-on-accent, #fff)' }}
        >
          <ArrowDown size={12} strokeWidth={2.4} />
        </div>
      )}
      <button
        type="button"
        draggable={canManage && !isOptimistic}
        onDragStart={onDragStart}
        onDragEnd={handleRowDragEnd}
        onClick={() => onSelect?.()}
        aria-current={isActive ? 'true' : undefined}
        className={
          'relative w-full flex items-center gap-2 pl-2 pr-12 py-2 rounded-[10px] text-left overflow-hidden ' +
          'transition-[transform,background-color,box-shadow,filter] duration-200 ' +
          (isActive
            ? 'shadow-md scale-[1.01] '
            : 'hover:translate-x-0.5 hover:bg-surface2 hover:shadow-md hover:scale-[1.01] active:scale-[0.98] ')
        }
        style={
          isActive
            ? { background: accent, color: 'var(--vc-on-accent, #fff)' }
            : undefined
        }
      >
        {canManage && !isOptimistic && (
          <GripVertical size={11} className="text-muted/50 shrink-0 -ml-0.5 cursor-grab" />
        )}
        <span
          className={
            'w-7 h-7 rounded-[8px] flex items-center justify-center shrink-0 '
          }
          style={
            isActive
              ? { background: 'var(--vc-bg-canvas)', color: accent }
              : { background: accent, color: 'var(--vc-on-accent, #fff)' }
          }
        >
          <RoomIconMark room={room} size={13} />
        </span>
        <p
          className={
            'min-w-0 flex-1 text-[13px] leading-tight truncate font-semibold'
          }
          style={{
            color: isActive ? 'var(--vc-on-accent, #fff)' : accent,
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
                <MoveToGroupButton
                  groups={groups}
                  currentGroupId={room.groupId || null}
                  onPick={(gid) => onMoveToGroup?.(gid)}
                />
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit?.() }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
                aria-label="Editar sala"
                title="Editar sala"
              >
                <Pencil size={11} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onAskDelete?.() }}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10"
                aria-label="Excluir sala"
                title="Excluir sala"
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

function MoveToGroupButton({ groups, currentGroupId, onPick }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        popRef.current && !popRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  const handleOpen = (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (open) { setOpen(false); return }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) {
      const width = 192
      let left = rect.right - width
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12))
      let top = rect.bottom + 4
      const estHeight = 28 + groups.length * 28 + (currentGroupId ? 28 : 0)
      if (top + estHeight > window.innerHeight) top = Math.max(12, rect.top - estHeight)
      setPos({ top, left })
    }
    setOpen(true)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
        aria-label="Mais ações da sala"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mover para…"
      >
        <MoreHorizontal size={11} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          role="menu"
          data-move-to-group-menu
          className="fixed z-[80] w-48 py-1 rounded-xl bg-surface1 border border-line shadow-2xl animate-fade-in-up"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Mover para…
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onPick?.(null); setOpen(false) }}
            className={
              'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors ' +
              (!currentGroupId
                ? 'text-accent bg-accent/[0.08]'
                : 'text-ink hover:bg-surface2 hover:text-strong')
            }
          >
            Sem grupo
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="menuitem"
              onClick={() => { onPick?.(g.id); setOpen(false) }}
              className={
                'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors ' +
                (currentGroupId === g.id
                  ? 'text-accent bg-accent/[0.08]'
                  : 'text-ink hover:bg-surface2 hover:text-strong')
              }
            >
              {g.emoji ? <span className="text-[11px]">{g.emoji}</span> : <Move size={11} className="text-muted" />}
              <span className="truncate flex-1">{g.name}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
