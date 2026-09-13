import { useEffect } from 'react'

/**
 * Publishes due scheduled announcements while a mod has the text room open.
 * Interval is intentionally light; Cloud Functions can take over later.
 */
export function useScheduledAnnouncePublisher({
  signaling,
  roomId,
  enabled = false,
  intervalMs = 30_000,
}) {
  useEffect(() => {
    if (!enabled || !signaling?.publishDueAnnouncements || !roomId) return undefined

    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        await signaling.publishDueAnnouncements(roomId)
      } catch (err) {
        console.warn('[scheduledAnnounce]', err)
      }
    }

    tick()
    const id = setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [signaling, roomId, enabled, intervalMs])
}
