/**
 * Space roles / permissions — per-Space ACL.
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
    hint: 'Dar ou tirar cargos de outros',
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

export function emptyPerms() {
  return Object.fromEntries(SPACE_PERMISSION_KEYS.map((k) => [k, false]))
}

export function fullPerms() {
  return Object.fromEntries(SPACE_PERMISSION_KEYS.map((k) => [k, true]))
}

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
