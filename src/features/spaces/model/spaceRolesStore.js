/**
 * Firestore helpers for vc_spaces/{id}/roles and member roleIds/perms.
 */
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
import {
  ROLE_COLOR_PRESETS,
  canSpacePermission,
  emptyPerms,
  mergeRolePerms,
  normalizePerms,
  normalizeRole,
} from './spaceRoles'

function rolesCol(spaceId) {
  return collection(db, VC.spaces, spaceId, 'roles')
}

function roleRef(spaceId, roleId) {
  return doc(db, VC.spaces, spaceId, 'roles', roleId)
}

function memberRef(spaceId, uid) {
  return doc(db, VC.spaces, spaceId, 'members', uid)
}

function spaceRef(spaceId) {
  return doc(db, VC.spaces, spaceId)
}

function membersCol(spaceId) {
  return collection(db, VC.spaces, spaceId, 'members')
}

export function subscribeSpaceRoles(spaceId, onChange) {
  if (!spaceId) {
    onChange?.([])
    return () => {}
  }
  return onSnapshot(rolesCol(spaceId), (snap) => {
    const list = snap.docs
      .map((d) => normalizeRole(d.id, d.data()))
      .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
    onChange?.(list)
  }, () => onChange?.([]))
}

export async function loadSpaceRoles(spaceId) {
  if (!spaceId) return []
  const snap = await getDocs(rolesCol(spaceId))
  return snap.docs
    .map((d) => normalizeRole(d.id, d.data()))
    .sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
}

async function assertCreator(spaceId) {
  const me = auth.currentUser?.uid
  if (!me) throw new Error('Faça login primeiro')
  const snap = await getDoc(spaceRef(spaceId))
  if (!snap.exists()) throw new Error('Space não encontrado')
  if (snap.data()?.createdBy !== me) {
    throw new Error('Só o criador pode gerenciar cargos')
  }
  return { me, space: { id: spaceId, ...snap.data() } }
}

export async function createSpaceRole(spaceId, { name, color, permissions, position } = {}) {
  const { me } = await assertCreator(spaceId)
  const trimmed = String(name || '').trim().slice(0, 32)
  if (!trimmed) throw new Error('Digite um nome pro cargo')
  const ref = doc(rolesCol(spaceId))
  const payload = {
    name: trimmed,
    color: ROLE_COLOR_PRESETS.includes(color) ? color : (color || ROLE_COLOR_PRESETS[0]),
    permissions: normalizePerms(permissions),
    position: typeof position === 'number' ? position : Date.now(),
    createdAt: Date.now(),
    createdBy: me,
  }
  await setDoc(ref, payload)
  return normalizeRole(ref.id, payload)
}

export async function updateSpaceRole(spaceId, roleId, patch = {}) {
  await assertCreator(spaceId)
  if (!roleId) throw new Error('Cargo inválido')
  const next = {}
  if (typeof patch.name === 'string') {
    const trimmed = patch.name.trim().slice(0, 32)
    if (!trimmed) throw new Error('Digite um nome pro cargo')
    next.name = trimmed
  }
  if (typeof patch.color === 'string') next.color = patch.color.slice(0, 16)
  if (patch.permissions) next.permissions = normalizePerms(patch.permissions)
  if (typeof patch.position === 'number') next.position = patch.position
  if (Object.keys(next).length === 0) return
  await updateDoc(roleRef(spaceId, roleId), next)
  // Refresh denormalized perms for members that hold this role.
  await recomputeMembersWithRole(spaceId, roleId)
}

export async function deleteSpaceRole(spaceId, roleId) {
  await assertCreator(spaceId)
  if (!roleId) return
  const membersSnap = await getDocs(membersCol(spaceId))
  const roles = await loadSpaceRoles(spaceId)
  const remainingRoles = roles.filter((r) => r.id !== roleId)
  const byId = Object.fromEntries(remainingRoles.map((r) => [r.id, r]))

  const batch = writeBatch(db)
  batch.delete(roleRef(spaceId, roleId))
  for (const d of membersSnap.docs) {
    const data = d.data() || {}
    const roleIds = Array.isArray(data.roleIds) ? data.roleIds.filter((id) => id !== roleId) : []
    if (!Array.isArray(data.roleIds) || data.roleIds.includes(roleId)) {
      const held = roleIds.map((id) => byId[id]).filter(Boolean)
      batch.update(d.ref, {
        roleIds,
        perms: mergeRolePerms(held),
      })
    }
  }
  await batch.commit()
}

async function recomputeMembersWithRole(spaceId, roleId) {
  const roles = await loadSpaceRoles(spaceId)
  const byId = Object.fromEntries(roles.map((r) => [r.id, r]))
  const membersSnap = await getDocs(membersCol(spaceId))
  const batch = writeBatch(db)
  let n = 0
  for (const d of membersSnap.docs) {
    const roleIds = Array.isArray(d.data()?.roleIds) ? d.data().roleIds : []
    if (!roleIds.includes(roleId)) continue
    const held = roleIds.map((id) => byId[id]).filter(Boolean)
    batch.update(d.ref, { perms: mergeRolePerms(held) })
    n += 1
  }
  if (n > 0) await batch.commit()
}

export async function setMemberRoleIds(spaceId, targetUid, roleIds, { actorUid, actorPerms, space } = {}) {
  const me = actorUid || auth.currentUser?.uid
  if (!me || !spaceId || !targetUid) throw new Error('Dados inválidos')

  const spaceSnap = space ? null : await getDoc(spaceRef(spaceId))
  const spaceData = space || (spaceSnap?.exists() ? { id: spaceId, ...spaceSnap.data() } : null)
  if (!spaceData) throw new Error('Space não encontrado')

  if (spaceData.createdBy === targetUid) {
    throw new Error('O criador não precisa de cargos')
  }

  const allowed = canSpacePermission(spaceData, { userId: me, perms: actorPerms }, 'assign_roles')
  if (!allowed) throw new Error('Sem permissão para atribuir cargos')

  const roles = await loadSpaceRoles(spaceId)
  const byId = Object.fromEntries(roles.map((r) => [r.id, r]))
  const unique = []
  const seen = new Set()
  for (const id of roleIds || []) {
    if (!id || seen.has(id) || !byId[id]) continue
    seen.add(id)
    unique.push(id)
  }
  const held = unique.map((id) => byId[id])
  const perms = mergeRolePerms(held)

  await setDoc(memberRef(spaceId, targetUid), {
    roleIds: unique,
    perms,
  }, { merge: true })

  return { roleIds: unique, perms }
}

export async function loadMemberPerms(spaceId, uid) {
  if (!spaceId || !uid) return emptyPerms()
  const snap = await getDoc(memberRef(spaceId, uid))
  return normalizePerms(snap.exists() ? snap.data()?.perms : null)
}

export { emptyPerms, normalizePerms }
