/**
 * App principal (Ethan) can assign global user tags.
 * Prefer VITE_PRINCIPAL_UID; otherwise claim via vc_config/admins once.
 */
export const TAG_CATALOG = [
  {
    id: 'staff',
    label: 'Staff',
    color: '#7dd3fc',
    hint: 'Equipe VoiceCraft',
  },
  {
    id: 'friend',
    label: 'Amigo',
    color: '#f9a8d4',
    hint: 'Amigo do Ethan',
  },
  {
    id: 'vip',
    label: 'VIP',
    color: '#fbbf24',
    hint: 'Convidado especial',
  },
  {
    id: 'og',
    label: 'OG',
    color: '#c4b5fd',
    hint: 'Dos primeiros',
  },
  {
    id: 'mod',
    label: 'Mod',
    color: '#86efac',
    hint: 'Moderação',
  },
]

const BY_ID = Object.fromEntries(TAG_CATALOG.map((t) => [t.id, t]))

export function resolveTag(tagOrId) {
  if (!tagOrId) return null
  if (typeof tagOrId === 'string') {
    const base = BY_ID[tagOrId]
    return base ? { ...base } : { id: tagOrId, label: tagOrId, color: '#a3a3a3', hint: '' }
  }
  const base = BY_ID[tagOrId.id] || {}
  return {
    id: tagOrId.id || base.id || 'tag',
    label: tagOrId.label || base.label || tagOrId.id || 'Tag',
    color: tagOrId.color || base.color || '#a3a3a3',
    hint: tagOrId.hint || base.hint || '',
  }
}

export function normalizeTags(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const tag = resolveTag(item)
    if (!tag?.id || seen.has(tag.id)) continue
    seen.add(tag.id)
    out.push(tag)
  }
  return out
}

/** Apply owner displayOrder; unknown ids ignored; missing tags append at end. */
export function orderTags(tags, displayOrder) {
  const list = normalizeTags(tags)
  if (!Array.isArray(displayOrder) || displayOrder.length === 0) return list
  const byId = Object.fromEntries(list.map((t) => [t.id, t]))
  const ordered = []
  const seen = new Set()
  for (const id of displayOrder) {
    if (!id || seen.has(id) || !byId[id]) continue
    ordered.push(byId[id])
    seen.add(id)
  }
  for (const t of list) {
    if (!seen.has(t.id)) ordered.push(t)
  }
  return ordered
}

export function syncDisplayOrder(existingOrder, tags) {
  const ids = normalizeTags(tags).map((t) => t.id)
  const idSet = new Set(ids)
  const kept = (Array.isArray(existingOrder) ? existingOrder : []).filter((id) => idSet.has(id))
  const seen = new Set(kept)
  for (const id of ids) {
    if (!seen.has(id)) {
      kept.push(id)
      seen.add(id)
    }
  }
  return kept
}

/** Soft match for first-time principal claim UI (not used for security). */
export function looksLikePrincipalProfile(profile) {
  const name = String(profile?.displayName || '').trim().toLowerCase()
  const handle = String(profile?.handle || '').trim().toLowerCase()
  if (/ethan/.test(name) && /noward/.test(name)) return true
  if (name === 'ethan noward' || name === 'ethannoward') return true
  if (handle === 'ethan' || handle === 'noward' || handle === 'ethannoward') return true
  return false
}

export function slugTagId(label) {
  const base = String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  return `c_${base || 'tag'}_${Math.random().toString(36).slice(2, 6)}`
}

export const TAG_COLOR_PRESETS = [
  '#7dd3fc', '#f9a8d4', '#fbbf24', '#c4b5fd', '#86efac',
  '#fb7185', '#fdba74', '#a5b4fc', '#5eead4', '#fde68a',
]

export function envPrincipalUid() {
  const raw = import.meta.env.VITE_PRINCIPAL_UID
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
}
