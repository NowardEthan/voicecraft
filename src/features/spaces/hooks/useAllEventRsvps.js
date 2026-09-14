/**
 * useAllEventRsvps — aggregate RSVP data across multiple spaces.
 * Returns:
 *   - counts: Map keyed by `${spaceId}:${eventId}` with going count
 *   - attendeesByEvent: Map keyed the same way with the list of going RSVPs
 */
import { useEffect, useState } from 'react'
import { getSharedSignaling } from '../../../shared/connection/useSignaling'

const MAX_PER_EVENT = 6

export function useAllEventRsvps(spaceIds = []) {
  const [counts, setCounts] = useState(() => new Map())
  const [attendeesByEvent, setAttendeesByEvent] = useState(() => new Map())
  const sig = getSharedSignaling()

  useEffect(() => {
    if (!sig?.listenEventRsvps || !Array.isArray(spaceIds) || spaceIds.length === 0) {
      setCounts(new Map())
      setAttendeesByEvent(new Map())
      return undefined
    }
    const spaceIdList = spaceIds.filter(Boolean)
    const merged = {}
    const flush = () => {
      const nextCounts = new Map()
      const nextAttendees = new Map()
      for (const list of Object.values(merged)) {
        const going = list.filter((r) => r.status === 'going' && r.eventId)
        const byEvent = {}
        for (const r of going) {
          const key = `${r.spaceId || ''}:${r.eventId}`
          nextCounts.set(key, (nextCounts.get(key) || 0) + 1)
          if (!byEvent[key]) byEvent[key] = []
          if (byEvent[key].length < MAX_PER_EVENT) byEvent[key].push(r)
        }
        for (const [key, atts] of Object.entries(byEvent)) {
          nextAttendees.set(key, atts)
        }
      }
      setCounts(nextCounts)
      setAttendeesByEvent(nextAttendees)
    }
    const unsubs = spaceIdList.map((sid) => {
      let buf = []
      merged[sid] = buf
      const off = sig.listenEventRsvps(sid, (list) => {
        buf = (list || []).map((r) => ({ ...r, spaceId: sid }))
        merged[sid] = buf
        flush()
      })
      return off
    })
    return () => {
      unsubs.forEach((fn) => { try { fn && fn() } catch {} })
    }
  }, [sig, spaceIds.join('|')])

  return { counts, attendeesByEvent }
}
