/**
 * Space roles / permissions — per-Space ACL.
 *
 * Hierarchy: higher `position` = higher rank (more power).
 * Creator is above every role. You may only assign/remove roles strictly
 * below your own top rank (Discord-style).
 */
export const SPACE_PERMISSION_KEYS = [
  'edit_space',
  'manage_rooms',
  'manage_events',
  'kick',
  'assign_roles',
  'mod_chat',
]

export const SPACE_PERMISSIONS = [
  {
    id: 'edit_space',
    label: 'Editar Space',
    hint: 'Nome, capa, frase e visibilidade',
  },
  {
    id: 'manage_rooms',
    label: 'Gerenciar salas',
    hint: 'Criar, editar e apagar canais',
  },
  {
    id: 'manage_events',
    label: 'Eventos',
    hint: 'Criar e remover eventos',
  },
  {
    id: 'kick',
    label: 'Expulsar membros',
    hint: 'Remover pessoas do Space',
  },
  {
    id: 'assign_roles',
    label: 'Atribuir cargos',
    hint: 'Dar ou tirar cargos abaixo do seu nível',
  },
  {
    id: 'mod_chat',
    label: 'Moderar chat',
    hint: 'Apagar mensagens de outras pessoas',
  },
]

export const ROLE_COLOR_PRESETS = [
  '#f472b6', '#7dd3fc', '#fbbf24', '#86efac', '#c4b5fd',
  '#fb7185', '#5eead4', '#fdba74', '#a5b4fc', '#fde68a',
]

/** Creator sentinel — always above every role position. */
export const CREATOR_ROLE_RANK = Number.POSITIVE_INFINITY

export function emptyPerms() {
  return Object.fromEntries(SPACE_PERMISSION_KEYS.map((k) => [k, false]))
}

export function fullPerms() {
  return Object.fromEntries(SPACE_PERMISSION_KEYS.map((k) => [k, true]))
}

/** Stable full-perms object — safe to use as React dependency. */
export const FULL_PERMS = Object.freeze(fullPerms())

export function normalizePerms(raw) {
  const base = emptyPerms()
  if (!raw || typeof raw !== 'object') return base
  for (const key of SPACE_PERMISSION_KEYS) {
    if (raw[key] === true) base[key] = true
  }
  return base
}

export function mergeRolePerms(roles = []) {
  const out = emptyPerms()
  for (const role of roles || []) {
    const p = normalizePerms(role?.permissions)
    for (const key of SPACE_PERMISSION_KEYS) {
      if (p[key]) out[key] = true
    }
  }
  return out
}

export function canSpacePermission(space, { userId, perms } = {}, permission) {
  if (!space || !permission || !userId) return false
  if (space.createdBy === userId) return true
  return normalizePerms(perms)[permission] === true
}

export function normalizeRole(id, data = {}) {
  return {
    id,
    name: String(data.name || 'Cargo').slice(0, 32),
    color: typeof data.color === 'string' ? data.color : ROLE_COLOR_PRESETS[0],
    position: typeof data.position === 'number' ? data.position : 0,
    permissions: normalizePerms(data.permissions),
    createdAt: data.createdAt || null,
    createdBy: data.createdBy || null,
  }
}

/** Numeric rank for a role definition (higher = more power). */
export function roleRank(role) {
  const n = Number(role?.position)
  return Number.isFinite(n) ? n : 0
}

/** Highest rank among held role ids. */
export function memberTopRank(roleIds = [], rolesById = {}) {
  let top = 0
  for (const id of roleIds || []) {
    const r = rolesById[id]
    if (!r) continue
    top = Math.max(top, roleRank(r))
  }
  return top
}

/** Actor rank in a Space (creator = ∞). */
export function actorRoleRank(space, actorUid, actorRoleIds = [], rolesById = {}) {
  if (!space || !actorUid) return 0
  if (space.createdBy === actorUid) return CREATOR_ROLE_RANK
  return memberTopRank(actorRoleIds, rolesById)
}

/** Sort highest rank first (UI hierarchy). */
export function sortRolesByRank(roles = []) {
  return [...(roles || [])].sort((a, b) => (
    (roleRank(b) - roleRank(a)) || String(a.name || '').localeCompare(String(b.name || ''))
  ))
}

/**
 * Resolve which roles the actor may toggle on a target.
 * - Cannot touch roles at or above own rank
 * - Cannot edit a target whose top rank is >= own rank (except creator)
 */
export function roleAssignCapabilities({
  space,
  actorUid,
  actorRoleIds = [],
  targetUid,
  targetRoleIds = [],
  roles = [],
} = {}) {
  const byId = Object.fromEntries((roles || []).map((r) => [r.id, r]))
  const actorRank = actorRoleRank(space, actorUid, actorRoleIds, byId)
  const targetRank = space?.createdBy === targetUid
    ? CREATOR_ROLE_RANK
    : memberTopRank(targetRoleIds, byId)
  const isCreatorActor = actorRank === CREATOR_ROLE_RANK
  const canManageTarget = isCreatorActor || targetRank < actorRank
  const assignable = []
  const lockedHeld = []
  for (const role of sortRolesByRank(roles)) {
    const rank = roleRank(role)
    const held = (targetRoleIds || []).includes(role.id)
    if (rank >= actorRank) {
      if (held) lockedHeld.push(role)
      continue
    }
    if (canManageTarget) assignable.push(role)
    else if (held) lockedHeld.push(role)
  }
  return {
    actorRank,
    targetRank,
    canManageTarget,
    assignable,
    lockedHeld,
    rolesById: byId,
  }
}

/**
 * Merge a toggle into the next roleIds set, respecting hierarchy.
 * Locked (≥ actor) roles on the target are preserved.
 */
export function applyRoleToggle({
  space,
  actorUid,
  actorRoleIds = [],
  targetUid,
  currentRoleIds = [],
  roles = [],
  toggleRoleId,
} = {}) {
  const caps = roleAssignCapabilities({
    space,
    actorUid,
    actorRoleIds,
    targetUid,
    targetRoleIds: currentRoleIds,
    roles,
  })
  if (!caps.canManageTarget) {
    throw new Error('Não pode alterar cargos de quem tem nível igual ou maior que o seu')
  }
  const role = caps.rolesById[toggleRoleId]
  if (!role) throw new Error('Cargo inválido')
  if (roleRank(role) >= caps.actorRank) {
    throw new Error('Não pode dar ou tirar um cargo no seu nível ou acima')
  }
  const lockedIds = new Set(caps.lockedHeld.map((r) => r.id))
  const next = new Set(
    (currentRoleIds || []).filter((id) => (
      lockedIds.has(id) || caps.assignable.some((r) => r.id === id)
    )),
  )
  for (const id of lockedIds) next.add(id)
  if (next.has(toggleRoleId)) next.delete(toggleRoleId)
  else next.add(toggleRoleId)
  for (const id of [...next]) {
    const r = caps.rolesById[id]
    if (r && roleRank(r) >= caps.actorRank && !lockedIds.has(id)) next.delete(id)
  }
  return [...next]
}

/** Attach resolved role objects onto members for UI. */
export function attachRolesToMembers(members = [], roles = []) {
  const byId = Object.fromEntries((roles || []).map((r) => [r.id, r]))
  return (members || []).map((m) => {
    const held = sortRolesByRank(
      (m.roleIds || []).map((id) => byId[id]).filter(Boolean),
    )
    return {
      ...m,
      roles: held,
      topRole: held[0] || null,
    }
  })
}
