/**
 * Shared helpers for personal home (Início) dashboard.
 */
import { getRecentSpaceIds } from '../../../features/spaces/model/spacePreferences'
import { isTextRoom, isVoiceRoom, nextUpcomingEvent } from '../space-overview/overviewHelpers'

export const HOME_CHIPS = [
  { id: 'all', label: 'Todos' },
  { id: 'games', label: 'Games', keywords: ['game', 'jogo', 'jogos', 'gaming', 'indie'] },
  { id: 'art', label: 'Arte & Design', keywords: ['arte', 'art', 'design', 'criativ'] },
  { id: 'tech', label: 'Tecnologia', keywords: ['tech', 'tecnologia', 'dev', 'program', 'código', 'codigo', 'code'] },
  { id: 'study', label: 'Estudos', keywords: ['estudo', 'estudos', 'study', 'aula', 'escola'] },
]

export function greetingForHour(d = new Date()) {
  const h = d.getHours()
  if (h < 5) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export function firstName(full) {
  const s = String(full || '').trim()
  if (!s) return 'você'
  return s.split(/\s+/)[0]
}

export function pickContinueSpace(spaces = []) {
  const byId = new Map(spaces.map((s) => [s.id, s]))
  for (const id of getRecentSpaceIds()) {
    if (byId.has(id)) return byId.get(id)
  }
  return spaces[0] || null
}

/** Best text room by lastMessageAt across roomsBySpace. */
export function pickBestConversation(spaces = [], roomsBySpace = {}) {
  let best = null
  for (const space of spaces) {
    const rooms = roomsBySpace[space.id] || []
    for (const room of rooms) {
      if (!isTextRoom(room)) continue
      const at = room.lastMessageAt || 0
      if (!best || at > (best.room.lastMessageAt || 0)) {
        best = { space, room }
      }
    }
  }
  if (best) return best
  const space = pickContinueSpace(spaces)
  if (!space) return { space: null, room: null }
  const rooms = roomsBySpace[space.id] || []
  const text = rooms.find(isTextRoom) || null
  return { space, room: text }
}

export function pickVoiceRoomFromMap(spaces = [], roomsBySpace = {}, preferSpaceId = null) {
  const order = preferSpaceId
    ? [spaces.find((s) => s.id === preferSpaceId), ...spaces].filter(Boolean)
    : spaces
  const seen = new Set()
  for (const space of order) {
    if (!space?.id || seen.has(space.id)) continue
    seen.add(space.id)
    const rooms = roomsBySpace[space.id] || []
    const voice = rooms.find(isVoiceRoom)
    if (voice) return { space, room: voice }
  }
  return { space: pickContinueSpace(spaces), room: null }
}

export function matchesHomeChip(space, chip) {
  if (!chip || chip.id === 'all') return true
  if (!chip.keywords?.length) return true
  const hay = `${space.name || ''} ${space.description || ''}`.toLowerCase()
  return chip.keywords.some((k) => hay.includes(k))
}

/** Flatten upcoming events across joined Spaces (when events are present on summaries). */
export function aggregateUpcomingEvents(spaces = [], now = Date.now()) {
  const out = []
  for (const space of spaces) {
    const events = Array.isArray(space?.events) ? space.events : []
    for (const ev of events) {
      if (typeof ev?.at !== 'number' || ev.at < now - 60_000) continue
      out.push({
        ...ev,
        spaceId: space.id,
        spaceName: space.name,
        spaceColor: space.color,
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

export function nextEventAcrossSpaces(spaces = []) {
  const list = aggregateUpcomingEvents(spaces)
  return list[0] || null
}

export function formatEventBadge(at) {
  if (!at) return { day: '—', month: '—', weekday: '' }
  try {
    const d = new Date(at)
    const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '').toUpperCase()
    const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(d)
    const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).replace('.', '').toUpperCase()
    return { weekday, day, month }
  } catch {
    return { day: '—', month: '—', weekday: '' }
  }
}

export function formatEventTimeRange(ev) {
  if (!ev?.at) return ''
  try {
    const start = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ev.at))
    if (ev.endAt && ev.endAt > ev.at) {
      const end = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ev.endAt))
      return `${start} – ${end}`
    }
    return start
  } catch {
    return ''
  }
}

export { nextUpcomingEvent }
