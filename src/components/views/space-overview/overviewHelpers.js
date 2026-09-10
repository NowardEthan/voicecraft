import { PURPOSE_BY_KEY, purposeOf } from '../../../features/rooms'

export function isVoiceRoom(room) {
  if (!room) return false
  if (room.type === 'voice') return true
  const purpose = purposeOf?.(room) || room.purpose
  return purpose === 'voice'
}

export function isTextRoom(room) {
  return !!room && !isVoiceRoom(room)
}

export function membersInRoom(members = [], roomId) {
  if (!roomId) return []
  return members.filter((m) => m?.location?.roomId === roomId)
}

export function onlineMembers(members = []) {
  return members.filter((m) => m?.online)
}

/** Prefer voice room with people; else any voice; else first room. */
export function pickActiveRoom(rooms = [], members = []) {
  const list = Array.isArray(rooms) ? rooms : []
  const voice = list.filter(isVoiceRoom)
  let best = null
  let bestCount = -1
  for (const room of voice) {
    const count = membersInRoom(members, room.id).length
    if (count > bestCount) {
      best = room
      bestCount = count
    }
  }
  if (best && bestCount > 0) return { room: best, liveCount: bestCount }
  if (voice[0]) return { room: voice[0], liveCount: membersInRoom(members, voice[0].id).length }
  if (list[0]) return { room: list[0], liveCount: membersInRoom(members, list[0].id).length }
  return { room: null, liveCount: 0 }
}

export function roomPurposeMeta(room) {
  const key = purposeOf?.(room) || room?.purpose || (isVoiceRoom(room) ? 'voice' : 'conversation')
  return PURPOSE_BY_KEY[key] || PURPOSE_BY_KEY.conversation
}

export function nextUpcomingEvent(events = [], now = Date.now()) {
  const list = (Array.isArray(events) ? events : [])
    .filter((ev) => typeof ev?.at === 'number' && ev.at >= now - 60_000)
    .sort((a, b) => a.at - b.at)
  return list[0] || null
}

export function formatEventWhen(at) {
  if (!at) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(at))
  } catch {
    return new Date(at).toLocaleString('pt-BR')
  }
}

export function memberDisplayName(m) {
  return m?.displayName || m?.name || 'Alguém'
}

export function mergeRooms(spaceRooms = [], optimisticFirstRoom) {
  const realRooms = Array.isArray(spaceRooms) ? spaceRooms : []
  if (!optimisticFirstRoom) return realRooms
  const hasMatchingReal = realRooms.some((r) => r.name === optimisticFirstRoom.name)
  if (hasMatchingReal) return realRooms
  return [...realRooms, { ...optimisticFirstRoom, id: '__optimistic__' }]
}
