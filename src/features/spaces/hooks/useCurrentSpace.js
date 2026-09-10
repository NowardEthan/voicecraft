/**
 * useCurrentSpace — encapsulates the per-Space state.
 *
 * Owns:
 *   - currentSpace (the full object: rooms, members, etc)
 *   - spaceMembers (enriched view: location/roomName computed)
 *   - optimisticFirstRoom (placeholder for the wizard's first sala)
 *   - race tokens for in-flight space-switch and room-create requests
 *
 * Before: this was 100+ lines of useState + useCallback + token logic
 * inlined in App.jsx. After: App.jsx just calls the hook and passes the
 * resulting object to the shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSharedSignaling } from '../../../shared/connection/useSignaling'
import { flashToast } from '../../../shared/utils/toast'
import { serializeSpaceIcon } from '../model/spaceIcons'
import { markSpaceJoined, markSpaceLeft, markSpaceVisited } from '../model/spacePreferences'
import { clearSpaceCover, setSpaceCover } from '../model/spaceCover'

// Map a UI purpose key to the backend's binary 'voice' | 'text' discriminator.
// All non-voice purposes ride on type='text' plus an explicit `purpose` field.
function backendTypeForPurpose(purposeKey) {
  return purposeKey === 'voice' ? 'voice' : 'text'
}

function enrichMembers(members, space) {
  const seen = new Set()
  const out = []
  for (const m of members || []) {
    const isString = typeof m === 'string'
    const uid = isString ? m : m.userId
    if (!uid || seen.has(uid)) continue
    seen.add(uid)
    const loc = (isString ? null : m.location) || null
    const roomName = loc?.roomId && space?.rooms
      ? space.rooms.find(r => r.id === loc.roomId)?.name
      : null
    out.push({
      userId: uid,
      displayName: isString ? null : m.displayName,
      photoURL: isString ? '' : (m.photoURL || ''),
      handle: isString ? '' : (m.handle || ''),
      bio: isString ? '' : (m.bio || ''),
      statusText: isString ? '' : (m.statusText || ''),
      cover: isString ? '' : (m.cover || ''),
      coverFit: isString ? null : (m.coverFit || null),
      bannerHue: isString ? null : (m.bannerHue ?? null),
      cardThemeId: isString ? 'default' : (m.cardThemeId || 'default'),
      createdAt: isString ? null : (m.createdAt || null),
      lastSeen: isString ? null : (m.lastSeen || null),
      online: isString ? true : (m.online !== false),
      location: loc,
      roomName,
      status: isString ? null : (m.status || m.statusText || null),
    })
  }
  return out
}

function applySelfProfile(members, self) {
  const selfId = self?.uid
  if (!selfId) return members
  return members.map((m) => {
    if (m.userId !== selfId) return m
    return {
      ...m,
      displayName: self.displayName || m.displayName,
      photoURL: self.photoURL || m.photoURL,
      handle: self.handle || m.handle,
      bio: self.bio || m.bio,
      statusText: self.statusText || m.statusText,
      cover: self.cover || m.cover,
      coverFit: self.coverFit || m.coverFit,
      bannerHue: self.bannerHue ?? m.bannerHue ?? null,
      cardThemeId: self.cardThemeId || m.cardThemeId || 'default',
    }
  })
}

export function useCurrentSpace(selfProfile = null) {
  const sig = getSharedSignaling()
  const [currentSpace, setCurrentSpace] = useState(null)
  const [spaceMembers, setSpaceMembers] = useState([])
  const [optimisticFirstRoom, setOptimisticFirstRoom] = useState(null)
  const [switchingSpaceId, setSwitchingSpaceId] = useState(null)

  // Race condition guards (kept locally — these are private to this hook).
  const pendingSpaceTokenRef = useRef(0)
  const currentSpaceRef = useRef(null)
  currentSpaceRef.current = currentSpace

  // Wire up server-pushed updates. We use the multi-subscriber API so we
  // don't stomp on useRoomActions' own roomChanged listener (they need
  // to coexist — useCurrentSpace handles created/deleted, useRoomActions
  // handles entered/left).
  useEffect(() => {
    const offSpace   = sig.onSpaceChanged((info) => {
      if (info.space && !info.updated) {
        const pending = pendingSpaceTokenRef.current
        if (pending === 0 || pending === info.space.id) {
          if (pending !== 0) {
            pendingSpaceTokenRef.current = 0
            setSwitchingSpaceId(null)
          }
          setCurrentSpace(info.space)
          setSpaceMembers(enrichMembers(info.space.members || [], info.space))
        }
      }
      if (info.deleted) {
        setCurrentSpace(prev => prev?.id === info.deleted ? null : prev)
        setSpaceMembers([])
      }
      if (info.updated && info.space) {
        setCurrentSpace(prev => prev?.id === info.space.id ? { ...prev, ...info.space } : prev)
        if (info.space.members) {
          setSpaceMembers(enrichMembers(info.space.members, info.space))
        }
      }
      if (info.currentSpace === null && !info.space && info.spaces === undefined && info.deleted === undefined) {
        if (pendingSpaceTokenRef.current === 0) {
          setCurrentSpace(null)
          setSpaceMembers([])
        }
      }
    })
    const offJoined  = sig.onMemberJoined((msg) => {
      setSpaceMembers(prev => {
        const exists = prev.find(m => m.userId === msg.userId)
        if (exists) return prev.map(m => m.userId === msg.userId ? { ...m, ...msg, online: true } : m)
        return [...prev, { userId: msg.userId, displayName: msg.displayName, photoURL: msg.photoURL || '', online: true, location: null }]
      })
    })
    const offLeft    = sig.onMemberLeft((msg) => {
      setSpaceMembers(prev => prev.map(m => m.userId === msg.userId
        ? { ...m, online: false, location: null, roomName: null }
        : m))
    })
    const offStatus  = sig.onMemberStatus((msg) => {
      setSpaceMembers(prev => prev.map(m => m.userId === msg.userId
        ? { ...m, ...(msg.member || {}), status: msg.status ?? msg.member?.status ?? m.status }
        : m))
    })
    const offPresence = sig.onPresenceChanged?.((info) => {
      const map = info?.presence || {}
      const mapKeys = Object.keys(map)
      // Empty snapshot during RTDB reconnect must not wipe everyone's status.
      if (mapKeys.length === 0) return
      setSpaceMembers((prev) => prev.map((m) => {
        const p = map[m.userId]
        if (!p) {
          // Absent from a non-empty map → they have no live presence node.
          return { ...m, online: false, location: null, roomName: null }
        }
        return {
          ...m,
          online: !!p.online,
          location: p.online
            ? { spaceId: info.spaceId, roomId: p.roomId || null }
            : null,
          roomName: p.online && p.roomId
            ? (currentSpaceRef.current?.rooms || []).find((r) => r.id === p.roomId)?.name || m.roomName
            : null,
        }
      }))
    })
    const offRoom    = sig.onRoomChanged((info) => {
      if (info.kind === 'created') {
        const roomWithPurpose = info.room
        setCurrentSpace(prev => prev ? {
          ...prev,
          rooms: [...(prev.rooms || []).filter(r => r.id !== info.room.id), roomWithPurpose],
        } : prev)
        if (roomWithPurpose.name) {
          setOptimisticFirstRoom(prev => (prev && prev.name === roomWithPurpose.name) ? null : prev)
        }
      } else if (info.kind === 'updated' && info.room) {
        setCurrentSpace(prev => prev ? {
          ...prev,
          rooms: (prev.rooms || []).map(r => r.id === info.room.id ? info.room : r),
        } : prev)
      } else if (info.kind === 'deleted') {
        setCurrentSpace(prev => prev ? {
          ...prev,
          rooms: (prev.rooms || []).filter(r => r.id !== info.roomId),
        } : prev)
      } else if (info.kind === 'entered' || info.kind === 'left') {
        const selfUserId = sig.userId
        if (info.kind === 'entered') {
          const roomName = info.room?.name
          setSpaceMembers(prev => prev.map(m => m.userId === selfUserId
            ? { ...m, location: { roomId: info.room?.id }, roomName, online: true }
            : m))
        } else {
          setSpaceMembers(prev => prev.map(m => m.userId === selfUserId
            ? { ...m, location: null, roomName: null }
            : m))
        }
      }
    })
    return () => {
      offSpace()
      offJoined()
      offLeft()
      offStatus()
      offRoom()
      offPresence?.()
    }
  }, [sig])

  // Select / clear
  const selectSpace = useCallback(async (spaceId, opts = {}) => {
    if (!spaceId) {
      pendingSpaceTokenRef.current = 0
      setSwitchingSpaceId(null)
      setCurrentSpace(null)
      setSpaceMembers([])
      setOptimisticFirstRoom(null)
      return
    }
    if (spaceId === currentSpace?.id && !switchingSpaceId) return
    if (pendingSpaceTokenRef.current === spaceId) return
    pendingSpaceTokenRef.current = spaceId
    setSwitchingSpaceId(spaceId)

    // Instant rail feedback: paint identity from the list summary while we hydrate.
    const preview = opts.preview
    if (preview?.id === spaceId) {
      setCurrentSpace((prev) => {
        if (prev?.id === spaceId && Array.isArray(prev.rooms)) return prev
        return {
          ...preview,
          rooms: prev?.id === spaceId ? (prev.rooms || []) : [],
          members: prev?.id === spaceId ? (prev.members || []) : [],
          events: Array.isArray(preview.events) ? preview.events : [],
        }
      })
      setOptimisticFirstRoom(null)
    }

    const myToken = spaceId
    const timeoutId = setTimeout(() => {
      if (pendingSpaceTokenRef.current === myToken) {
        pendingSpaceTokenRef.current = 0
        setSwitchingSpaceId(null)
        flashToast('servidor não respondeu — tente novamente')
      }
    }, 8000)
    try {
      const { space: full } = await sig.joinSpace(spaceId)
      clearTimeout(timeoutId)
      if (pendingSpaceTokenRef.current !== spaceId) return
      pendingSpaceTokenRef.current = 0
      markSpaceJoined(spaceId)
      markSpaceVisited(spaceId)
      setCurrentSpace(full)
      setSpaceMembers(enrichMembers(full.members || [], full))
      setOptimisticFirstRoom(null)
      setSwitchingSpaceId(null)
    } catch (err) {
      clearTimeout(timeoutId)
      if (pendingSpaceTokenRef.current === spaceId) {
        pendingSpaceTokenRef.current = 0
        setSwitchingSpaceId(null)
        flashToast(`erro ao entrar: ${err.message || 'desconhecido'}`)
      }
    } finally {
      if (pendingSpaceTokenRef.current === spaceId) {
        pendingSpaceTokenRef.current = 0
        setSwitchingSpaceId(null)
      }
    }
  }, [sig, currentSpace?.id, switchingSpaceId])

  const clearSpace = useCallback((spaceId) => {
    const id = spaceId || currentSpace?.id
    if (id) {
      markSpaceLeft(id)
      clearSpaceCover(id)
    }
    sig.leaveSpace?.(id)
    setCurrentSpace(null)
    setSpaceMembers([])
    setOptimisticFirstRoom(null)
    setSwitchingSpaceId(null)
    return id
  }, [sig, currentSpace?.id])

  const editSpace = useCallback(async (updates) => {
    if (!currentSpace) return
    const next = { ...updates }
    if (next.icon != null) next.icon = serializeSpaceIcon(next.icon)
    try {
      const applied = await sig.updateSpace?.(currentSpace.id, next)
      const merged = { ...next, ...(applied || {}) }
      // If Storage upload failed/returned null, keep the data-URL locally.
      if (
        typeof updates.cover === 'string'
        && updates.cover.startsWith('data:image/')
        && !merged.cover
      ) {
        setSpaceCover(currentSpace.id, updates.cover)
        merged.cover = updates.cover
      } else if (typeof merged.cover === 'string' && /^https?:\/\//.test(merged.cover)) {
        clearSpaceCover(currentSpace.id)
      }
      setCurrentSpace((prev) => (prev ? { ...prev, ...merged } : prev))
      return merged
    } catch (err) {
      // Still apply identity fields locally; keep cover in localStorage.
      if (typeof updates.cover === 'string' && updates.cover.startsWith('data:image/')) {
        setSpaceCover(currentSpace.id, updates.cover)
      }
      setCurrentSpace((prev) => (prev ? { ...prev, ...next } : prev))
      throw err
    }
  }, [currentSpace, sig])

  const createSpace = useCallback(async ({ name, description, icon, color, cover, coverFit, themeId, firstRoom }) => {
    if (firstRoom?.purpose) {
      setOptimisticFirstRoom({
        name: firstRoom.name,
        purpose: firstRoom.purpose,
        type: firstRoom.type,
      })
    }
    const packedIcon = serializeSpaceIcon(icon)
    const { space } = await sig.createSpace(name, description, packedIcon, color, { cover, coverFit, themeId })
    markSpaceJoined(space.id)
    const { space: full } = await sig.joinSpace(space.id)
    setCurrentSpace(full)
    setSpaceMembers(enrichMembers(full.members || [], full))
    if (firstRoom?.purpose) {
      sig.createRoom?.(firstRoom.name, backendTypeForPurpose(firstRoom.purpose), firstRoom.purpose)
    }
  }, [sig])

  const enrichedMembers = useMemo(
    () => applySelfProfile(spaceMembers, selfProfile),
    [spaceMembers, selfProfile],
  )

  return {
    currentSpace,
    spaceMembers: enrichedMembers,
    optimisticFirstRoom,
    setOptimisticFirstRoom,
    switching: !!switchingSpaceId,
    switchingSpaceId,
    selectSpace,
    clearSpace,
    editSpace,
    createSpace,
    isCreator: currentSpace?.createdBy === sig.userId,
    currentUserId: sig.userId,
    currentUserName: selfProfile?.displayName || sig.displayName,
  }
}
