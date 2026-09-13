/**
 * Schema helpers for space.chatAutomation.autopurge
 */

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || min))

export function defaultAutopurge() {
  return {
    enabled: false,
    everyHours: 24,
    olderThanHours: 72,
    roomIds: 'all',
  }
}

export function normalizeAutopurge(raw) {
  const base = defaultAutopurge()
  if (!raw || typeof raw !== 'object') return base
  const roomIds = raw.roomIds === 'all' || raw.roomIds == null
    ? 'all'
    : Array.isArray(raw.roomIds)
      ? raw.roomIds.map(String).filter(Boolean).slice(0, 64)
      : 'all'
  return {
    enabled: !!raw.enabled,
    everyHours: clamp(raw.everyHours, 1, 168),
    olderThanHours: clamp(raw.olderThanHours, 1, 720),
    roomIds,
  }
}

export function readAutopurgeFromSpace(space) {
  return normalizeAutopurge(space?.chatAutomation?.autopurge)
}
