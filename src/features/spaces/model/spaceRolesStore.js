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
  applyRoleToggle,
  actorRoleRank,
  canSpacePermission,
  emptyPerms,
  mergeRolePerms,
  normalizePerms,
  normalizeRole,
  roleAssignCapabilities,
  roleRank,
  sortRolesByRank,
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
    const list = sortRolesByRank(snap.docs.map((d) => normalizeRole(d.id, d.data())))
    onChange?.(list)
  }, () => onChange?.([]))
}

export async function loadSpaceRoles(spaceId) {
  if (!spaceId) return []
  const snap = await getDocs(rolesCol(spaceId))
  return sortRolesByRank(snap.docs.map((d) => normalizeRole(d.id, d.data())))
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
  const existing = await loadSpaceRoles(spaceId)
  // New cargos start at the bottom of the hierarchy (lowest power).
  const lowest = existing.length
    ? Math.min(...existing.map((r) => roleRank(r)))
    : 100
  const ref = doc(rolesCol(spaceId))
  const payload = {
    name: trimmed,
    color: ROLE_COLOR_PRESETS.includes(color) ? color : (color || ROLE_COLOR_PRESETS[0]),
    permissions: normalizePerms(permissions),
    position: typeof position === 'number' ? position : lowest - 100,
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
  await recomputeMembersWithRole(spaceId, roleId)
}

/** Move a role one step up/down in the hierarchy (creator only). */
export async function moveSpaceRole(spaceId, roleId, direction = 'up') {
  await assertCreator(spaceId)
  const roles = await loadSpaceRoles(spaceId)
  const idx = roles.findIndex((r) => r.id === roleId)
  if (idx < 0) throw new Error('Cargo inválido')
  // roles are sorted highest-first; "up" = more power = toward index 0
  const swapWith = direction === 'up' ? idx - 1 : idx + 1
  if (swapWith < 0 || swapWith >= roles.length) return roles[idx]
  const a = roles[idx]
  const b = roles[swapWith]
  const batch = writeBatch(db)
  batch.update(roleRef(spaceId, a.id), { position: b.position })
  batch.update(roleRef(spaceId, b.id), { position: a.position })
  await batch.commit()
  return normalizeRole(a.id, { ...a, position: b.position })
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
    batch.update(d.ref, {
      perms: mergeRolePerms(held),
    })
    n += 1
  }
  if (n > 0) await batch.commit()
}

export async function setMemberRoleIds(spaceId, targetUid, roleIds, {
  actorUid,
  actorPerms,
  actorRoleIds,
  space,
} = {}) {
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

  // Resolve actor's current roles if not provided.
  let myRoleIds = Array.isArray(actorRoleIds) ? actorRoleIds : null
  if (!myRoleIds) {
    const meSnap = await getDoc(memberRef(spaceId, me))
    myRoleIds = Array.isArray(meSnap.data()?.roleIds) ? meSnap.data().roleIds : []
  }

  const targetSnap = await getDoc(memberRef(spaceId, targetUid))
  const currentIds = Array.isArray(targetSnap.data()?.roleIds) ? targetSnap.data().roleIds : []

  const caps = roleAssignCapabilities({
    space: spaceData,
    actorUid: me,
    actorRoleIds: myRoleIds,
    targetUid,
    targetRoleIds: currentIds,
    roles,
  })
  if (!caps.canManageTarget) {
    throw new Error('Não pode alterar cargos de quem tem nível igual ou maior que o seu')
  }

  const lockedIds = new Set(caps.lockedHeld.map((r) => r.id))
  const unique = []
  const seen = new Set()
  // Preserve locked (≥ actor) roles the target already has.
  for (const id of lockedIds) {
    if (!seen.has(id) && byId[id]) {
      seen.add(id)
      unique.push(id)
    }
  }
  for (const id of roleIds || []) {
    if (!id || seen.has(id) || !byId[id]) continue
    if (roleRank(byId[id]) >= caps.actorRank) {
      throw new Error(`Não pode atribuir "${byId[id].name}" — nível igual ou acima do seu`)
    }
    seen.add(id)
    unique.push(id)
  }

  // Also reject removing a locked role by omission (already preserved above).
  const held = unique.map((id) => byId[id])
  const perms = mergeRolePerms(held)

  await setDoc(memberRef(spaceId, targetUid), {
    roleIds: unique,
    perms,
  }, { merge: true })

  return { roleIds: unique, perms }
}

/** Toggle a single role with hierarchy checks (preferred UI path). */
export async function toggleMemberRole(spaceId, targetUid, roleId, opts = {}) {
  const me = opts.actorUid || auth.currentUser?.uid
  const spaceSnap = opts.space ? null : await getDoc(spaceRef(spaceId))
  const spaceData = opts.space || (spaceSnap?.exists() ? { id: spaceId, ...spaceSnap.data() } : null)
  if (!spaceData) throw new Error('Space não encontrado')

  let myRoleIds = Array.isArray(opts.actorRoleIds) ? opts.actorRoleIds : null
  if (!myRoleIds) {
    const meSnap = await getDoc(memberRef(spaceId, me))
    myRoleIds = Array.isArray(meSnap.data()?.roleIds) ? meSnap.data().roleIds : []
  }
  const targetSnap = await getDoc(memberRef(spaceId, targetUid))
  const currentIds = Array.isArray(targetSnap.data()?.roleIds) ? targetSnap.data().roleIds : []
  const roles = await loadSpaceRoles(spaceId)

  const nextIds = applyRoleToggle({
    space: spaceData,
    actorUid: me,
    actorRoleIds: myRoleIds,
    targetUid,
    currentRoleIds: currentIds,
    roles,
    toggleRoleId: roleId,
  })

  return setMemberRoleIds(spaceId, targetUid, nextIds, {
    ...opts,
    actorUid: me,
    actorRoleIds: myRoleIds,
    space: spaceData,
  })
}

export async function loadMemberPerms(spaceId, uid) {
  if (!spaceId || !uid) return emptyPerms()
  const snap = await getDoc(memberRef(spaceId, uid))
  return normalizePerms(snap.exists() ? snap.data()?.perms : null)
}

export { emptyPerms, normalizePerms, actorRoleRank }
