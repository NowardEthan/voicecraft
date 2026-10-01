const CHAN_TIME_ZONE = 'America/Sao_Paulo'

function zonedParts(date, timeZone = CHAN_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

function zonedMidnightUtc(year, month, day, timeZone = CHAN_TIME_ZONE) {
  const wallClockUtc = Date.UTC(year, month - 1, day, 0, 0, 0)
  let candidate = wallClockUtc
  for (let pass = 0; pass < 3; pass += 1) {
    const local = zonedParts(new Date(candidate), timeZone)
    const representedUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
    candidate += wallClockUtc - representedUtc
  }
  return candidate
}

function chanDayWindow(now = new Date(), timeZone = CHAN_TIME_ZONE) {
  const instant = now instanceof Date ? now : new Date(now)
  if (Number.isNaN(instant.getTime())) throw new TypeError('Invalid Chan policy date')
  const local = zonedParts(instant, timeZone)
  const day = [local.year, local.month, local.day].map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0')).join('-')
  const followingDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1))
  const nextResetMs = zonedMidnightUtc(followingDay.getUTCFullYear(), followingDay.getUTCMonth() + 1, followingDay.getUTCDate(), timeZone)
  return { day, nextResetAt: new Date(nextResetMs).toISOString() }
}

function sameChanTarget(left, right) {
  return !!left && !!right
    && left.spaceId === right.spaceId
    && left.roomId === right.roomId
    && left.messageId === right.messageId
}

module.exports = { CHAN_TIME_ZONE, chanDayWindow, sameChanTarget, zonedMidnightUtc, zonedParts }
