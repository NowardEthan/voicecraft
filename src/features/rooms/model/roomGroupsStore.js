import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth, db, VC } from '../../../shared/firebase/app'
import { GROUP_COLOR_PRESETS, normalizeRoomGroup } from './roomGroups'

function groupsCol(spaceId) {
  return collection(db, VC.spaces, spaceId, 'room_groups')
}

function groupRef(spaceId, groupId) {
  return doc(db, VC.spaces, spaceId, 'room_groups', groupId)
}

function roomRef(spaceId, roomId) {
  return doc(db, VC.spaces, spaceId, 'rooms', roomId)
}

function spaceRef(spaceId) {
  return doc(db, VC.spaces, spaceId)
}

function memberRef(spaceId, uid) {
  return doc(db, VC.spaces, spaceId, 'members', uid)
}

async function assertManageRooms(spaceId) {
  const me = auth.currentUser?.uid
  if (!me) throw new Error('Faça login primeiro')
  const spaceSnap = await getDoc(spaceRef(spaceId))
  if (!spaceSnap.exists()) throw new Error('Space não encontrado')
  const space = spaceSnap.data()
  if (space.createdBy === me) return { me, space: { id: spaceId, ...space } }
  const memberSnap = await getDoc(memberRef(spaceId, me))
  if (memberSnap.exists() && memberSnap.data()?.perms?.manage_rooms === true) {
    return { me, space: { id: spaceId, ...space } }
  }
  throw new Error('Sem permissão para gerenciar salas')
}

export function subscribeRoomGroups(spaceId, onChange) {
  if (!spaceId) {
    onChange?.([])
    return () => {}
  }
  return onSnapshot(groupsCol(spaceId), (snap) => {
    const list = snap.docs
      .map((d) => normalizeRoomGroup(d.id, d.data()))
      .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
    onChange?.(list)
  }, () => onChange?.([]))
}

export async function createRoomGroup(spaceId, { name, color, icon, emoji, nameStyle, fontId, position } = {}) {
  const { me } = await assertManageRooms(spaceId)
  const trimmed = String(name || '').trim().slice(0, 40)
  if (!trimmed) throw new Error('Digite um nome pro grupo')
  const ref = doc(groupsCol(spaceId))
  const payload = {
    name: trimmed,
    color: (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color))
      ? color
      : (GROUP_COLOR_PRESETS[0]),
    icon: icon || null,
    emoji: emoji || null,
    nameStyle: typeof nameStyle === 'string' ? nameStyle.slice(0, 24) : 'default',
    fontId: typeof fontId === 'string' ? fontId.slice(0, 64) : 'default',
    position: typeof position === 'number' ? position : Date.now(),
    collapsed: false,
    createdAt: Date.now(),
    createdBy: me,
  }
  await setDoc(ref, payload)
  return normalizeRoomGroup(ref.id, payload)
}

export async function updateRoomGroup(spaceId, groupId, patch = {}) {
  await assertManageRooms(spaceId)
  if (!groupId) throw new Error('Grupo inválido')
  const next = {}
  if (typeof patch.name === 'string') {
    const trimmed = patch.name.trim().slice(0, 40)
    if (!trimmed) throw new Error('Digite um nome pro grupo')
    next.name = trimmed
  }
  if (typeof patch.color === 'string') next.color = patch.color.slice(0, 16)
  if (patch.icon === null || typeof patch.icon === 'string') next.icon = patch.icon
  if (patch.emoji === null || typeof patch.emoji === 'string') next.emoji = patch.emoji
  if (typeof patch.nameStyle === 'string') next.nameStyle = patch.nameStyle.slice(0, 24)
  if (typeof patch.fontId === 'string') next.fontId = patch.fontId.slice(0, 64)
  if (typeof patch.position === 'number') next.position = patch.position
  if (typeof patch.collapsed === 'boolean') next.collapsed = patch.collapsed
  if (Object.keys(next).length === 0) return
  await updateDoc(groupRef(spaceId, groupId), next)
}

export async function deleteRoomGroup(spaceId, groupId) {
  await assertManageRooms(spaceId)
  if (!groupId) return
  const roomsSnap = await getDocs(collection(db, VC.spaces, spaceId, 'rooms'))
  const batch = writeBatch(db)
  batch.delete(groupRef(spaceId, groupId))
  for (const d of roomsSnap.docs) {
    if (d.data()?.groupId === groupId) {
      batch.update(d.ref, { groupId: null })
    }
  }
  await batch.commit()
}

export async function setRoomPlacement(spaceId, roomId, { groupId, sortOrder }) {
  await assertManageRooms(spaceId)
  if (!roomId) throw new Error('Sala inválida')
  const next = {}
  if (groupId === null || typeof groupId === 'string') next.groupId = groupId
  if (typeof sortOrder === 'number') next.sortOrder = sortOrder
  if (Object.keys(next).length === 0) return
  await updateDoc(roomRef(spaceId, roomId), next)
}

/** Reorder rooms within a group (or ungrouped). Writes sortOrder 0..n */
export async function reorderRoomsInGroup(spaceId, groupId, roomIds) {
  await assertManageRooms(spaceId)
  const ids = (roomIds || []).filter(Boolean)
  if (ids.length === 0) return
  const batch = writeBatch(db)
  ids.forEach((id, index) => {
    batch.update(roomRef(spaceId, id), {
      groupId: groupId || null,
      sortOrder: index,
    })
  })
  await batch.commit()
}

export async function reorderRoomGroups(spaceId, groupIds) {
  await assertManageRooms(spaceId)
  const ids = (groupIds || []).filter(Boolean)
  const batch = writeBatch(db)
  ids.forEach((id, index) => {
    batch.update(groupRef(spaceId, id), { position: index })
  })
  await batch.commit()
}
