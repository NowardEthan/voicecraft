export function defaultAutopurge() {
  return {
    enabled: false,
    everyHours: 24,
    olderThanHours: 72,
    roomIds: 'all',
  }
}

export function normalizeAutopurge(raw) {
  if (!raw || typeof raw !== 'object') return defaultAutopurge()
  return {
    enabled: !!raw.enabled,
    everyHours: Number(raw.everyHours) || 24,
    olderThanHours: Number(raw.olderThanHours) || 72,
    roomIds: raw.roomIds || 'all',
  }
}

export function readAutopurgeFromSpace(space) {
  return normalizeAutopurge(space?.chatAutomation?.autopurge)
}
