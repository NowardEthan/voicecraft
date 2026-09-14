/**
 * useEventRsvps — subscribe to RSVP changes for a Space's events.
 * Returns:
 *   - rsvps: flat list of all RSVPs
 *   - byEvent: { [eventId]: rsvp[] }
 *   - goingCount(eventId): number of users who said yes
 *   - myRsvp(eventId): the current user's RSVP for that event (or null)
 */
import { useEffect, useMemo, useState } from 'react'
import { useSignaling } from '../../../shared/connection/useSignaling'
import { useCurrentSpace } from './useCurrentSpace'

export function useEventRsvps(spaceId) {
  const sig = useSignaling({ enabled: true })
  // useSignaling returns a fresh object each render — only depend on the
  // stable singleton client so the subscription isn't torn down/rebuilt
  // every render (which would prevent the snapshot from ever updating state).
  const client = sig?.client
  const { currentUserId } = useCurrentSpace()
  const [rsvps, setRsvps] = useState([])

  useEffect(() => {
    if (!spaceId || !client?.listenEventRsvps) return undefined
    const off = client.listenEventRsvps(spaceId, (list) => setRsvps(list || []))
    return () => { try { off && off() } catch {} }
  }, [spaceId, client])

  const byEvent = useMemo(() => {
    const out = {}
    for (const r of rsvps) {
      if (!r.eventId) continue
      if (!out[r.eventId]) out[r.eventId] = []
      out[r.eventId].push(r)
    }
    return out
  }, [rsvps])

  const goingCount = (eventId) => {
    const list = byEvent[eventId] || []
    return list.filter((r) => r.status === 'going').length
  }

  const myRsvp = (eventId) => {
    if (!currentUserId) return null
    const list = byEvent[eventId] || []
    return list.find((r) => r.userId === currentUserId) || null
  }

  const setRsvp = async (eventId, status, profile = null) => {
    if (!spaceId || !eventId || !client) return
    return client.setEventRsvp(spaceId, eventId, status, profile)
  }

  const clearRsvp = async (eventId) => {
    if (!spaceId || !eventId || !client) return
    return client.clearEventRsvp(spaceId, eventId)
  }

  return { rsvps, byEvent, goingCount, myRsvp, setRsvp, clearRsvp }
}
