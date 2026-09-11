/**
 * Room groups (categories) inside a Space — Discord-style sections.
 */
export const GROUP_COLOR_PRESETS = [
  '#f472b6', '#7dd3fc', '#fbbf24', '#86efac', '#c4b5fd',
  '#fb7185', '#5eead4', '#fdba74', '#a5b4fc', '#94a3b8',
]

export function normalizeRoomGroup(id, data = {}) {
  return {
    id,
    name: String(data.name || 'Grupo').slice(0, 40),
    color: typeof data.color === 'string' ? data.color : GROUP_COLOR_PRESETS[9],
    icon: data.icon || null,
    emoji: typeof data.emoji === 'string' ? data.emoji.slice(0, 8) : null,
    nameStyle: typeof data.nameStyle === 'string' ? data.nameStyle.slice(0, 24) : 'default',
    fontId: typeof data.fontId === 'string' ? data.fontId.slice(0, 64) : 'default',
    position: typeof data.position === 'number' ? data.position : 0,
    collapsed: data.collapsed === true,
    createdAt: data.createdAt || null,
    createdBy: data.createdBy || null,
  }
}

/** Sort rooms: sortOrder asc, then createdAt, then name. */
export function sortRooms(rooms = []) {
  return [...(rooms || [])].sort((a, b) => {
    const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER
    const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER
    if (ao !== bo) return ao - bo
    const ac = a.createdAt || 0
    const bc = b.createdAt || 0
    if (ac !== bc) return ac - bc
    return String(a.name || '').localeCompare(String(b.name || ''))
  })
}

/**
 * Build sidebar sections: ordered groups + ungrouped rooms.
 * Returns [{ type:'group', group, rooms }, { type:'ungrouped', rooms }]
 */
export function buildRoomSections(groups = [], rooms = []) {
  const sortedGroups = [...(groups || [])].sort((a, b) => (a.position - b.position) || a.name.localeCompare(b.name))
  const sortedRooms = sortRooms(rooms)
  const byGroup = new Map()
  const ungrouped = []
  for (const room of sortedRooms) {
    const gid = room.groupId || null
    if (gid && sortedGroups.some((g) => g.id === gid)) {
      if (!byGroup.has(gid)) byGroup.set(gid, [])
      byGroup.get(gid).push(room)
    } else {
      ungrouped.push(room)
    }
  }
  const sections = sortedGroups.map((group) => ({
    type: 'group',
    group,
    rooms: byGroup.get(group.id) || [],
  }))
  if (ungrouped.length > 0 || sections.length === 0) {
    sections.push({ type: 'ungrouped', group: null, rooms: ungrouped })
  }
  return sections
}
