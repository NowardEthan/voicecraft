/**
 * useFriends — subscribe to friend requests and accepted friendships.
 * Hydrates each "other user" with their public profile (displayName,
 * photoURL, cardThemeId, handle) so the UI can render rich cards.
 * Live presence: RTDB global (app) + joined Spaces (same green/yellow/gray
 * buckets as the Pessoas panel).
 *
 * Returns:
 *   - friends / onlineFriends
 *   - incoming / outgoing
 *   - actions: { send, accept, ignore, remove, search }
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSignaling } from '../../../shared/connection/useSignaling'
import {
  listenSpacePresence,
  listenUsersPresence,
} from '../../../shared/firebase/presence'
import { useSpacesList } from '../../spaces/hooks/useSpacesList'
import { presenceLabel } from '../model/presenceKind'
import {
  getCachedFriendsGraph,
  getCachedProfiles,
  setCachedProfile,
} from '../../../shared/media/profileCache'

function resolveFriendPresence(appOnline, spaceRow) {
  const roomId = spaceRow?.roomId || null
  const spaceOnline = !!spaceRow?.online
  if (roomId && spaceOnline) {
    return {
      presenceKind: 'in_room',
      online: true,
      appOnline: true,
      spaceOnline: true,
      location: { roomId },
    }
  }
  if (spaceOnline) {
    return {
      presenceKind: 'online',
      online: true,
      appOnline: true,
      spaceOnline: true,
      location: null,
    }
  }
  if (appOnline) {
    return {
      presenceKind: 'away',
      online: true, // still listed under "online" (Discord-style idle/away)
      appOnline: true,
      spaceOnline: false,
      location: null,
    }
  }
  return {
    presenceKind: 'offline',
    online: false,
    appOnline: false,
    spaceOnline: false,
    location: null,
  }
}

export function useFriends() {
  const sig = useSignaling({ enabled: true })
  const client = sig?.client
  const connected = sig?.status === 'connected'
  const userId = client?.userId || sig?.userId || null
  const { spaces } = useSpacesList()

  const [requests, setRequests] = useState(() => (
    getCachedFriendsGraph() || { incoming: [], outgoing: [], friends: [] }
  ))
  const [profiles, setProfiles] = useState(() => getCachedProfiles())
  const [presence, setPresence] = useState({}) // uid -> { online, lastChanged }
  const [spacePresenceBySpace, setSpacePresenceBySpace] = useState({}) // spaceId -> uid map

  const presenceIdsKey = useMemo(() => {
    const ids = new Set()
    for (const list of [requests.incoming, requests.outgoing, requests.friends]) {
      for (const r of list || []) {
        if (r.otherUserId) ids.add(r.otherUserId)
      }
    }
    return [...ids].sort().join(',')
  }, [requests])

  useEffect(() => {
    if (!client?.listenFriendRequests || !connected || !userId) return undefined
    const off = client.listenFriendRequests((next) => setRequests(next || { incoming: [], outgoing: [], friends: [] }))
    return () => { try { off && off() } catch {} }
  }, [client, connected, userId])

  // Live profiles for every person in the friends graph (covers/photos stay fresh).
  useEffect(() => {
    if (!client?.listenUserProfile) return undefined
    const ids = presenceIdsKey ? presenceIdsKey.split(',').filter(Boolean) : []
    if (ids.length === 0) return undefined
    const offs = ids.map((uid) => client.listenUserProfile(uid, (profile) => {
      if (!profile) return
      setCachedProfile(uid, profile)
      setProfiles((prev) => {
        const prevP = prev[uid]
        if (prevP
          && prevP.cover === profile.cover
          && prevP.photoURL === profile.photoURL
          && prevP.cardThemeId === profile.cardThemeId
          && prevP.displayName === profile.displayName
          && prevP.handle === profile.handle
        ) return prev
        return { ...prev, [uid]: profile }
      })
    }))
    // Fresh server read only when we don't already have a boot-seeded profile.
    ids.forEach((uid) => {
      const cached = getCachedProfiles()[uid]
      if (cached?.cover || cached?.photoURL || cached?.displayName) return
      client.getUserProfile(uid, { fresh: true }).then((profile) => {
        if (!profile) return
        setCachedProfile(uid, profile)
        setProfiles((prev) => ({ ...prev, [uid]: profile }))
      }).catch(() => {})
    })
    return () => {
      offs.forEach((off) => { try { off() } catch {} })
    }
  }, [client, presenceIdsKey])

  useEffect(() => {
    if (!presenceIdsKey) {
      setPresence({})
      return undefined
    }
    const ids = presenceIdsKey.split(',').filter(Boolean)
    return listenUsersPresence(ids, (map) => setPresence(map || {}))
  }, [presenceIdsKey])

  const spaceIdsKey = useMemo(
    () => (spaces || []).map((s) => s.id).filter(Boolean).sort().join(','),
    [spaces],
  )

  useEffect(() => {
    if (!spaceIdsKey) {
      setSpacePresenceBySpace({})
      return undefined
    }
    const ids = spaceIdsKey.split(',').filter(Boolean)
    const offs = ids.map((spaceId) => listenSpacePresence(spaceId, (map) => {
      setSpacePresenceBySpace((prev) => {
        const prevMap = prev[spaceId]
        // Shallow equality skip to avoid needless re-renders
        if (prevMap && mapsEqual(prevMap, map)) return prev
        return { ...prev, [spaceId]: map }
      })
    }))
    return () => {
      offs.forEach((off) => { try { off() } catch {} })
    }
  }, [spaceIdsKey])

  const spaceOnlineByUid = useMemo(() => {
    const out = {}
    for (const map of Object.values(spacePresenceBySpace)) {
      for (const [uid, row] of Object.entries(map || {})) {
        if (!row?.online) continue
        const prev = out[uid]
        out[uid] = {
          online: true,
          roomId: row.roomId || prev?.roomId || null,
        }
      }
    }
    return out
  }, [spacePresenceBySpace])

  const enrich = useCallback((r) => {
    const p = profiles[r.otherUserId]
    const live = presence[r.otherUserId]
    const spaceRow = spaceOnlineByUid[r.otherUserId]
    const appOnline = !!live?.online
    const resolved = resolveFriendPresence(appOnline, spaceRow)
    return {
      id: r.id,
      otherUserId: r.otherUserId,
      userId: r.otherUserId,
      name: p?.displayName || r.fromDisplayName || r.toDisplayName || '',
      handle: p?.handle || '',
      photo: p?.photoURL || r.fromPhotoURL || '',
      photoURL: p?.photoURL || r.fromPhotoURL || '',
      cardThemeId: p?.cardThemeId || 'default',
      bio: p?.bio || '',
      cover: p?.cover || '',
      coverFit: p?.coverFit || null,
      requestStatus: r.status,
      status: resolved.presenceKind === 'offline'
        ? null
        : { kind: resolved.presenceKind, label: presenceLabel(resolved.presenceKind) },
      createdAt: r.createdAt,
      respondedAt: r.respondedAt,
      ...resolved,
      lastChanged: live?.lastChanged || null,
    }
  }, [profiles, presence, spaceOnlineByUid])

  const friends = useMemo(
    () => (requests.friends || []).map(enrich),
    [requests.friends, enrich],
  )
  const incoming = useMemo(
    () => (requests.incoming || []).map(enrich),
    [requests.incoming, enrich],
  )
  const outgoing = useMemo(
    () => (requests.outgoing || []).map(enrich),
    [requests.outgoing, enrich],
  )

  const onlineFriends = useMemo(
    () => friends.filter((f) => f.online),
    [friends],
  )

  const send = useCallback(async (toUserId, profile = null) => {
    if (!client) return null
    return client.sendFriendRequest(toUserId, profile)
  }, [client])

  const accept = useCallback(async (requestId) => {
    if (!client) return
    return client.acceptFriendRequest(requestId)
  }, [client])

  const ignore = useCallback(async (requestId) => {
    if (!client) return
    return client.ignoreFriendRequest(requestId)
  }, [client])

  const remove = useCallback(async (requestId) => {
    if (!client) return
    return client.removeFriend(requestId)
  }, [client])

  const search = useCallback(async (term) => {
    if (!client) return []
    return client.searchUsers(term)
  }, [client])

  return {
    friends,
    onlineFriends,
    incoming,
    outgoing,
    pending: incoming,
    suggestions: [],
    actions: { send, accept, ignore, remove, search },
    profiles,
    loading: !client,
  }
}

function mapsEqual(a, b) {
  if (a === b) return true
  const aKeys = Object.keys(a || {})
  const bKeys = Object.keys(b || {})
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    const av = a[k]
    const bv = b[k]
    if (!bv) return false
    if (!!av.online !== !!bv.online) return false
    if ((av.roomId || null) !== (bv.roomId || null)) return false
  }
  return true
}
