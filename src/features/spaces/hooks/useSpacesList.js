/**
 * useSpacesList — the summary list shown in the SpacesRail.
 *
 * Does not nest useCurrentSpace (that would create a second state
 * instance). Deletion/leave is reported via onSpaceDeleted.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSharedSignaling } from '../../../shared/connection/useSignaling'
import { auth } from '../../../shared/firebase/app'
import { readL1Spaces, writeL1Snapshot } from '../../../shared/cache/l1Snapshot'
import { hasLeftSpace, syncMembershipFromServer } from '../model/spacePreferences'

function currentUid(sig) {
  return sig?.userId || auth?.currentUser?.uid || null
}

function toSummary(s) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    slogan: s.slogan || '',
    icon: s.icon,
    color: s.color,
    cover: s.cover || null,
    coverFit: s.coverFit || null,
    memberCount: s.members?.length ?? s.memberCount ?? 0,
    roomCount: s.rooms?.length ?? s.roomCount ?? 0,
    events: Array.isArray(s.events) ? s.events : [],
    joined: s.joined === true,
  }
}

export function useSpacesList({ onSpaceDeleted } = {}) {
  const sig = getSharedSignaling()
  // Seed order: live signaling list (already connected) → L1 snapshot from
  // the last session → empty. The rail never starts blank on a warm start.
  const [spaces, setSpaces] = useState(() => {
    const cached = Array.isArray(sig._spacesList)
      ? sig._spacesList
      : readL1Spaces(currentUid(sig))
    return cached
      .filter(s => s.joined === true || (s.joined == null && !hasLeftSpace(s.id)))
      .map(s => toSummary({ ...s, joined: true }))
  })
  // Only persist once the server has answered at least once, so a stale or
  // empty seed is never written back as if it were fresh.
  const fromServerRef = useRef(Array.isArray(sig._spacesList))

  useEffect(() => {
    if (!fromServerRef.current) return
    const uid = currentUid(sig)
    if (uid) writeL1Snapshot(uid, { spaces })
  }, [sig, spaces])

  useEffect(() => {
    const off = sig.onSpaceChanged((info) => {
      if (info.spaces !== undefined) {
        fromServerRef.current = true
        syncMembershipFromServer(info.spaces)
        setSpaces(info.spaces
          .filter(s => s.joined === true || (s.joined == null && !hasLeftSpace(s.id)))
          .map(s => toSummary({ ...s, joined: true })))
      }
      if (info.left) {
        setSpaces(prev => prev.filter(s => s.id !== info.left))
        onSpaceDeleted?.(info.left)
      }
      if (info.deleted) {
        setSpaces(prev => prev.filter(s => s.id !== info.deleted))
        onSpaceDeleted?.(info.deleted)
      }
      if (info.space && !info.updated && info.space.id) {
        setSpaces(prev => {
          const next = toSummary({ ...info.space, joined: true })
          if (prev.some(s => s.id === next.id)) {
            return prev.map(s => s.id === next.id ? { ...s, ...next } : s)
          }
          return [...prev, next]
        })
      }
      if (info.updated && info.space) {
        setSpaces(prev => prev.map(s => s.id === info.space.id ? {
          ...s,
          name: info.space.name,
          description: info.space.description,
          icon: info.space.icon,
          color: info.space.color,
          cover: info.space.cover ?? s.cover,
          coverFit: info.space.coverFit ?? s.coverFit,
        } : s))
      }
    })
    return off
  }, [sig, onSpaceDeleted])

  const deleteSpace = useCallback(async (spaceId) => {
    try {
      await sig.deleteSpace(spaceId)
      setSpaces(prev => prev.filter(s => s.id !== spaceId))
      onSpaceDeleted?.(spaceId)
    } catch (err) {
      console.error('Failed to delete space:', err)
    }
  }, [sig, onSpaceDeleted])

  return { spaces, deleteSpace }
}
