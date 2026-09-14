/**
 * Presence buckets for the Pessoas list / profile chips / friends.
 *
 * - in_room  — in a sala of this Space
 * - online   — browsing / present in this Space (or app-online for friends)
 * - away     — app open (or in voice elsewhere), not in this Space
 * - offline  — app closed / disconnected
 */

export const PRESENCE_DOT = {
  in_room: null, // use room/purpose accent
  online: '#22C55E',
  away: '#EAB308',
  offline: '#6B7280',
}

export function memberPresenceKind(member) {
  if (!member) return 'offline'
  if (member.location?.roomId) return 'in_room'
  if (member.online) return 'online'
  if (member.appOnline) return 'away'
  return 'offline'
}

/** Friends list: no Space context — room > online (app) > offline. */
export function friendPresenceKind(person) {
  if (!person) return 'offline'
  if (person.presenceKind && ['in_room', 'online', 'away', 'offline'].includes(person.presenceKind)) {
    return person.presenceKind
  }
  if (person.location?.roomId) return 'in_room'
  if (person.online || person.appOnline) return 'online'
  return 'offline'
}

export function presenceLabel(kind) {
  switch (kind) {
    case 'in_room': return 'Na sala'
    case 'online': return 'Online'
    case 'away': return 'Ausente'
    default: return 'Offline'
  }
}

export function presenceDotColor(member, fallbackAccent) {
  const kind = memberPresenceKind(member)
  if (kind === 'in_room') return fallbackAccent || PRESENCE_DOT.online
  return PRESENCE_DOT[kind] || PRESENCE_DOT.offline
}

export function friendPresenceDotColor(person, fallbackAccent) {
  const kind = friendPresenceKind(person)
  if (kind === 'in_room') return fallbackAccent || PRESENCE_DOT.online
  return PRESENCE_DOT[kind] || PRESENCE_DOT.offline
}
