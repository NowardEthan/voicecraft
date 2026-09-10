import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getSharedSignaling } from '../../shared/connection/useSignaling'
import { isSpaceNotifyOn } from '../spaces/model/spacePreferences'
import { flashToast } from '../../shared/utils/toast'
import {
  getInbox,
  isRoomUnread,
  markAllNotifsRead,
  markAllRoomsRead,
  markNotifRead,
  markRoomRead as persistMarkRoomRead,
  pushMessageNotif,
  roomKey,
} from './unreadStore'

const NotificationsContext = createContext(null)

export function NotificationsProvider({
  children,
  userId,
  spaces = [],
  currentSpaceId = null,
  currentRoomId = null,
}) {
  const sig = getSharedSignaling()
  const [roomsBySpace, setRoomsBySpace] = useState({})
  const [inbox, setInbox] = useState(() => getInbox(userId))
  const [tick, setTick] = useState(0)
  const hydratedRef = useRef(false)

  useEffect(() => {
    setInbox(getInbox(userId))
  }, [userId])

  const refreshInbox = useCallback(() => {
    setInbox(getInbox(userId))
    setTick((t) => t + 1)
  }, [userId])

  // Listen to rooms for every joined Space (lastMessage* denormalized on send).
  useEffect(() => {
    hydratedRef.current = false
    if (!userId || !sig?.listenSpaceRooms) {
      setRoomsBySpace({})
      return undefined
    }
    const ids = spaces.map((s) => s.id).filter(Boolean)
    if (ids.length === 0) {
      setRoomsBySpace({})
      return undefined
    }
    let pending = ids.length
    const offs = ids.map((spaceId) =>
      sig.listenSpaceRooms(spaceId, (rooms) => {
        setRoomsBySpace((prev) => ({ ...prev, [spaceId]: rooms }))
        pending -= 1
        if (pending <= 0) {
          // Allow toasts only after first full wave of snapshots.
          setTimeout(() => { hydratedRef.current = true }, 800)
        }
      }),
    )
    return () => offs.forEach((off) => {
      try { off() } catch { /* ignore */ }
    })
  }, [sig, userId, spaces.map((s) => s.id).join('|')])

  // Turn room activity into inbox entries + toast (respect mute).
  useEffect(() => {
    if (!userId) return
    const spaceNameById = Object.fromEntries(spaces.map((s) => [s.id, s.name]))
    Object.entries(roomsBySpace).forEach(([spaceId, rooms]) => {
      ;(rooms || []).forEach((room) => {
        if (!isRoomUnread(userId, spaceId, room, userId)) return
        if (!room.lastMessageId) return
        if (spaceId === currentSpaceId && room.id === currentRoomId) return

        const added = pushMessageNotif(userId, {
          id: `msg:${spaceId}:${room.id}:${room.lastMessageId}`,
          spaceId,
          roomId: room.id,
          spaceName: spaceNameById[spaceId] || '',
          roomName: room.name || 'sala',
          authorId: room.lastAuthorId,
          authorName: room.lastAuthorName || 'alguém',
          preview: room.lastMessagePreview || 'Nova mensagem',
          ts: room.lastMessageAt || Date.now(),
        })
        if (added) {
          refreshInbox()
          if (hydratedRef.current && isSpaceNotifyOn(spaceId)) {
            flashToast(`${added.authorName}: ${added.preview}`)
          }
        }
      })
    })
  }, [roomsBySpace, userId, spaces, currentSpaceId, currentRoomId, refreshInbox])

  // Auto-mark when viewing a room
  useEffect(() => {
    if (!userId || !currentSpaceId || !currentRoomId) return
    const rooms = roomsBySpace[currentSpaceId] || []
    const room = rooms.find((r) => r.id === currentRoomId)
    persistMarkRoomRead(userId, currentSpaceId, currentRoomId, {
      at: Math.max(Date.now(), Number(room?.lastMessageAt) || 0),
      id: room?.lastMessageId || null,
    })
    refreshInbox()
  }, [userId, currentSpaceId, currentRoomId, roomsBySpace, refreshInbox])

  const unreadByRoom = useMemo(() => {
    void tick
    const map = {}
    if (!userId) return map
    Object.entries(roomsBySpace).forEach(([spaceId, rooms]) => {
      ;(rooms || []).forEach((room) => {
        if (!isRoomUnread(userId, spaceId, room, userId)) return
        // Viewing this room → treat as read for badge purposes
        if (spaceId === currentSpaceId && room.id === currentRoomId) return
        map[roomKey(spaceId, room.id)] = true
      })
    })
    return map
  }, [roomsBySpace, userId, currentSpaceId, currentRoomId, tick])

  const unreadBySpace = useMemo(() => {
    const map = {}
    Object.keys(unreadByRoom).forEach((key) => {
      const spaceId = key.split(':')[0]
      map[spaceId] = (map[spaceId] || 0) + 1
    })
    return map
  }, [unreadByRoom])

  const unreadInboxCount = useMemo(
    () => inbox.filter((n) => !n.read).length,
    [inbox],
  )

  const totalUnreadRooms = useMemo(
    () => Object.keys(unreadByRoom).length,
    [unreadByRoom],
  )

  const bellCount = Math.max(unreadInboxCount, totalUnreadRooms)

  const markRoomRead = useCallback((spaceId, roomId, meta) => {
    if (!userId || !spaceId || !roomId) return
    persistMarkRoomRead(userId, spaceId, roomId, meta)
    refreshInbox()
  }, [userId, refreshInbox])

  const markOneRead = useCallback((notifId) => {
    if (!userId || !notifId) return
    setInbox(markNotifRead(userId, notifId))
    setTick((t) => t + 1)
  }, [userId])

  const markAllRead = useCallback(() => {
    if (!userId) return
    markAllRoomsRead(userId, roomsBySpace)
    setInbox(markAllNotifsRead(userId))
    setTick((t) => t + 1)
  }, [userId, roomsBySpace])

  const value = useMemo(() => ({
    inbox,
    unreadByRoom,
    unreadBySpace,
    bellCount,
    roomsBySpace,
    markRoomRead,
    markOneRead,
    markAllRead,
    refreshInbox,
    roomKey,
  }), [
    inbox,
    unreadByRoom,
    unreadBySpace,
    bellCount,
    roomsBySpace,
    markRoomRead,
    markOneRead,
    markAllRead,
    refreshInbox,
  ])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    return {
      inbox: [],
      unreadByRoom: {},
      unreadBySpace: {},
      bellCount: 0,
      roomsBySpace: {},
      markRoomRead: () => {},
      markOneRead: () => {},
      markAllRead: () => {},
      refreshInbox: () => {},
      roomKey,
    }
  }
  return ctx
}
