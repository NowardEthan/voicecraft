/**
 * AppShell — signed-in layout (rail, panels, rooms, modals).
 * Lazy-loaded from App.jsx so login does not pay for this graph.
 */
import { useEffect, useState, lazy, Suspense, useCallback, useMemo, useRef } from 'react'
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import ErrorBoundary from '../components/ErrorBoundary'
import SpacesRail from '../components/SpacesRail'
import SpaceContextPanel from '../components/layout/SpaceContextPanel'
import HomeNavPanel from '../components/layout/HomeNavPanel'
import HomeAside from '../components/layout/HomeAside'
import { useFriends } from '../features/people/hooks/useFriends'
import SpaceHome from '../components/views/SpaceHome'
import VoiceActiveBar from '../features/rooms/views/voice/components/VoiceActiveBar'
import { nextEventAcrossSpaces, aggregateUpcomingEvents } from '../components/views/home/homeData'

import { useCurrentSpace, useSpacesList, isSpaceInRail, spaceTokens, ensureFullSpaceIcons } from '../features/spaces'
import { useSpaceFonts } from '../features/spaces/hooks/useSpaceFonts'
import { useAllEventRsvps } from '../features/spaces/hooks/useAllEventRsvps'
import { parseSpaceInvite } from '../features/spaces/model/spaceInvite'
import { useRoomActions } from '../features/rooms'
import { useProfilePopover, useMemberTags } from '../features/people'
import { usePrincipal } from '../features/people/hooks/usePrincipal'
import { useSettings } from '../features/settings'
import { usePerfProfile } from '../shared/perf/usePerfProfile'
import { useAccountProfile } from '../features/account'
import { NotificationsProvider } from '../features/notifications'
import NotificationBell from '../features/notifications/NotificationBell'
import { useSignaling } from '../shared/connection/useSignaling'
import { flashToast } from '../shared/utils/toast'
import { getLocalIP, getHostname } from '../shared/utils/network'
import { useViewport } from '../shared/hooks/useViewport'
import { signOutAccount } from '../features/auth'
import { useAppWarmup, warmLikelyNext } from '../shared/media/useAppWarmup'
import { warmImage } from '../shared/media/imageWarm'
import { resolveSpaceCover } from '../features/spaces/model/spaceCover'
import { warmLiveKitClient, prefetchLiveKitToken } from '../features/rooms/views/voice/livekitPrefetch'
import {
  findRulesRoom,
  spaceRequiresRulesAccept,
} from '../features/chat/rulesSchema'

const VoiceRoomView = lazy(() => import('../features/rooms/views/voice/VoiceRoomView'))
const ConversationRoom = lazy(() => import('../components/views/TextRoomView'))
const PeoplePanel = lazy(() => import('../components/layout/PeoplePanel'))
const InviteModal = lazy(() => import('../components/ui/InviteModal'))
const SpaceCreator = lazy(() => import('../components/SpaceCreator'))
const SpaceHubModal = lazy(() => import('../features/spaces/components/SpaceHubModal'))
const RoomEditorModal = lazy(() => import('../features/rooms/components/RoomEditorModal'))
const SettingsModal = lazy(() => import('../features/settings/components/SettingsModal'))
const AccountShell = lazy(() =>
  import('../features/account/components/AccountShell').then((m) => ({ default: m.AccountShell })),
)
const ProfilePopover = lazy(() => import('../features/people/components/ProfilePopover'))
const SpaceEventsView = lazy(() => import('../features/spaces/views/SpaceEventsView'))

const PANEL_COLLAPSED_KEY = 'voicecraft:panelCollapsed'

/** Silent shell while a pre-warmed chunk resolves — no spinner flash. */
function ViewLoader() {
  return <div className="flex-1 bg-canvas" aria-hidden />
}

export default function AppShell({ account }) {
  // Prefetch Phosphor pack after login without blocking first paint.
  useEffect(() => {
    ensureFullSpaceIcons().catch(() => {})
  }, [])

  // Connection + identity
  const { client: signalingClient, status: connStatus, error: connError } = useSignaling({ enabled: true })
  const accountProfile = useAccountProfile(account)

  // Settings
  const [settings, updateSettings] = useSettings()
  const [showAccount, setShowAccount] = useState(false)
  const [accountPage, setAccountPage] = useState('profile')

  // Spaces
  const {
    currentSpace, spaceMembers, optimisticFirstRoom,
    switchingSpaceId,
    selectSpace, clearSpace, editSpace, createSpace, isCreator, can: canPerm, selfPerms,

    currentUserId, currentUserName, setOptimisticFirstRoom,
  } = useCurrentSpace(accountProfile.profile)

  useSpaceFonts(currentSpace)

  const tagsByUser = useMemberTags(spaceMembers)
  const membersWithTags = useMemo(
    () => (spaceMembers || []).map((m) => ({
      ...m,
      tags: tagsByUser.get(m.userId) || m.tags || [],
    })),
    [spaceMembers, tagsByUser],
  )
  const { isPrincipal, canClaim, claim } = usePrincipal(currentUserId, accountProfile.profile)
  // Rooms
  const {
    selectedRoom, currentRoom,
    selectRoom, closeTextRoom, leaveCall, focusVoiceRoom, createRoom, updateRoom, deleteRoom,
    creatingRoom, setSelectedRoom,
  } = useRoomActions()

  const handleSpaceDeleted = useCallback((id) => {
    if (currentSpace?.id === id) {
      leaveCall()
      clearSpace()
    }
  }, [currentSpace?.id, leaveCall, clearSpace])

  const { spaces, deleteSpace } = useSpacesList({ onSpaceDeleted: handleSpaceDeleted })

  // People
  const profile = useProfilePopover()

  // UI state
  const [activeView, setActiveView] = useState('overview')
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [roomEditor, setRoomEditor] = useState(null)
  const [showSpaceCreator, setShowSpaceCreator] = useState(false)
  const [showSpaceHub, setShowSpaceHub] = useState(false)
  const [homeTab, setHomeTab] = useState('para-voce')
  const pendingHomeEventsRef = useRef(null)
  const [inviteRoom, setInviteRoom] = useState(null)
  const { compactRail, overlayNav, overlayPeople } = useViewport()
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    if (window.innerWidth < 1100) return true
    try { return window.localStorage.getItem(PANEL_COLLAPSED_KEY) === '1' }
    catch { return false }
  })
  const [peoplePanelCollapsed, setPeoplePanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1280
  })
  const [voiceStatus, setVoiceStatus] = useState('')
  const [localIP, setLocalIP] = useState('')
  const [hostname, setHostname] = useState('')
  // Space that owns the active LiveKit call — keep stable while browsing UI.
  const [callSpace, setCallSpace] = useState(null)

  useEffect(() => {
    if (!currentRoom) {
      setCallSpace(null)
      return
    }
    if (!currentSpace?.id) return
    setCallSpace((prev) => {
      if (prev?.id === currentSpace.id) return prev
      return currentSpace
    })
  }, [currentRoom, currentSpace])

  // Reset contextual view when Space changes. activeView drives whether
  // overview/events beat the live call in the main pane (see browsingSpacePage).
  useEffect(() => {
    setSelectedRoom(null)
    if (pendingHomeEventsRef.current && pendingHomeEventsRef.current === currentSpace?.id) {
      pendingHomeEventsRef.current = null
      setActiveView('events')
      return
    }
    setActiveView('overview')
  }, [currentSpace?.id, setSelectedRoom])

  // Network info
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const ip = await getLocalIP()
      const name = await getHostname()
      if (mounted) { setLocalIP(ip); setHostname(name) }
    })()
    return () => { mounted = false }
  }, [])

  // Persist panel preference
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(PANEL_COLLAPSED_KEY, panelCollapsed ? '1' : '0') } catch {}
  }, [panelCollapsed])

  // Crossing into a tight viewport: hide docked panels so the room isn't crushed.
  // Opening a drawer afterwards is fine — overlay doesn't steal column width.
  useEffect(() => {
    if (overlayNav) setPanelCollapsed(true)
  }, [overlayNav])
  useEffect(() => {
    if (overlayPeople) setPeoplePanelCollapsed(true)
  }, [overlayPeople])

  // Profile popover data feed — keep deps stable (no fresh objects per render).
  const canAssignRoles = canPerm('assign_roles')
  const canKick = canPerm('kick')
  useEffect(() => {
    const member = profile.userId
      ? membersWithTags.find((m) => m.userId === profile.userId) || null
      : null
    const selfMember = membersWithTags.find((m) => m.userId === currentUserId) || null
    profile.setData({
      member,
      space: currentSpace,
      isCreator,
      canAssignRoles,
      canKick,
      selfPerms,
      selfMember,
    })
  }, [
    profile.userId,
    profile.setData,
    membersWithTags,
    currentSpace,
    isCreator,
    canAssignRoles,
    canKick,
    selfPerms,
    currentUserId,
  ])

  const handleKickMember = useCallback(async (userId) => {
    try {
      await signalingClient?.kickMember?.(userId)
      flashToast('Membro removido do Space')
      profile.closeProfile?.()
    } catch (err) {
      flashToast(err?.message || 'Não deu pra expulsar')
    }
  }, [signalingClient, profile])

  // Handlers wired to feature hooks
  const handleCreateSpace = useCallback(async (payload) => {
    try {
      await createSpace(payload)
      setShowSpaceCreator(false)
    } catch (err) {
      setOptimisticFirstRoom(null)
      throw err
    }
  }, [createSpace, setOptimisticFirstRoom])

  const handleSelectSpace = useCallback(async (spaceId) => {
    setShowAccount(false)
    setSelectedRoom(null)

    // Home: always show Início. Call stays alive (LiveKit is independent of
    // which Space is selected in the shell).
    if (!spaceId) {
      setActiveView('overview')
      setHomeTab('para-voce')
      await selectSpace(null)
      return
    }

    if (spaceId === currentSpace?.id) {
      setActiveView('overview')
      return
    }

    // Prefetch wallpaper before panel mounts (kills black banner).
    const preview = spaces.find((s) => s.id === spaceId) || null
    const cover = resolveSpaceCover(preview)
    if (cover) warmImage(cover)

    // Switch Spaces freely — call stays until leave or join another voice room.
    setActiveView('overview')
    await selectSpace(spaceId, {
      preview: preview || undefined,
      keepVoice: !!currentRoom,
    })
  }, [currentRoom, currentSpace?.id, selectSpace, setSelectedRoom, spaces])

  const handleHubJoined = useCallback(async (spaceId, { alreadyMember } = {}) => {
    await handleSelectSpace(spaceId)
    if (!alreadyMember) flashToast('Você entrou no Space')
  }, [handleSelectSpace])

  const handleOpenSpaceEvents = useCallback(async (spaceId) => {
    if (!spaceId) return
    pendingHomeEventsRef.current = spaceId
    await handleSelectSpace(spaceId)
  }, [handleSelectSpace])

  // Deep link: /invite/:space(/:room) or /?space=ID (&room= optional) after login
  const deepLinkConsumed = useRef(false)
  useEffect(() => {
    if (deepLinkConsumed.current) return
    if (connStatus !== 'connected' || !signalingClient?.userId) return
    if (typeof window === 'undefined') return
    const fromPath = parseSpaceInvite(`${window.location.origin}${window.location.pathname}${window.location.search}`)
    const fromQuery = parseSpaceInvite(window.location.search)
    const parsed = fromPath?.spaceId ? fromPath : fromQuery
    if (!parsed?.spaceId) return
    deepLinkConsumed.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete('space')
    url.searchParams.delete('s')
    url.searchParams.delete('room')
    url.searchParams.delete('r')
    if (/^\/(?:invite|i)\//i.test(url.pathname)) {
      url.pathname = '/'
    }
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, '', next)
    ;(async () => {
      try {
        await handleSelectSpace(parsed.spaceId)
        flashToast('Você entrou no Space')
      } catch (err) {
        flashToast(err?.message || 'Não foi possível abrir o convite')
      }
    })()
  }, [connStatus, signalingClient?.userId, handleSelectSpace])

  const visibleSpaces = useMemo(
    () => spaces.filter(s => isSpaceInRail(s, currentSpace?.id)),
    [spaces, currentSpace?.id],
  )

  const { counts: homeRsvpCounts, attendeesByEvent: homeRsvpAttendees } =
    useAllEventRsvps(visibleSpaces.map((s) => s.id))

  // Real friends (Firestore-backed) — drives the HomeAside sidebar.
  const { friends: realFriends, onlineFriends: realOnlineFriends, incoming: realIncoming } = useFriends()

  useAppWarmup({
    enabled: true,
    connected: connStatus === 'connected',
    homeTab,
    currentSpaceId: currentSpace?.id || null,
    spaces: visibleSpaces,
    friends: realFriends,
    members: membersWithTags || [],
  })

  // Keep current Space wallpaper hot (sidebar banner).
  useEffect(() => {
    const cover = resolveSpaceCover(currentSpace)
    if (cover) warmImage(cover)
  }, [currentSpace?.id, currentSpace?.cover, currentSpace?.coverFit])

  // Nudge room chunks + LiveKit when user is already in a Space.
  useEffect(() => {
    if (!currentSpace?.id) return undefined
    warmLikelyNext('voice')
    warmLikelyNext('text')
    warmLikelyNext('people')
    warmLiveKitClient()
    return undefined
  }, [currentSpace?.id])

  // Prefetch join token for the first voice room (hover will refresh).
  useEffect(() => {
    if (!currentSpace?.id || !currentUserId) return undefined
    const voice = (currentSpace.rooms || []).find((r) => r.type === 'voice' || r.purpose === 'voice')
    if (!voice?.id) return undefined
    prefetchLiveKitToken({
      spaceId: currentSpace.id,
      roomId: voice.id,
      identity: currentUserId,
      displayName: currentUserName || 'você',
    }).catch(() => {})
    return undefined
  }, [currentSpace?.id, currentSpace?.rooms, currentUserId, currentUserName])

  const homeNextEvent = useMemo(
    () => nextEventAcrossSpaces(visibleSpaces),
    [visibleSpaces],
  )

  const showHomeChrome = !currentSpace && !showAccount

  const handleLeaveSpace = useCallback(() => {
    leaveCall()
    setSelectedRoom(null)
    clearSpace()
  }, [leaveCall, setSelectedRoom, clearSpace])

  const rootTokens = useMemo(() => spaceTokens(currentSpace), [currentSpace])

  const handleSignOut = useCallback(async () => {
    try { await signOutAccount() } catch {}
    window.location.reload()
  }, [])

  const handleOpenInvite = useCallback((room) => {
    const target = (room && room.id) ? room : (currentRoom || selectedRoom || { id: null })
    setInviteRoom(target)
  }, [currentRoom, selectedRoom])

  const togglePanel = useCallback(() => setPanelCollapsed(c => !c), [])

  const panelVisible = !!currentSpace && !panelCollapsed

  // Peer context for VoiceRoomView
  const browsingTextWhileInVoice = !!(
    currentRoom
    && selectedRoom
    && selectedRoom.type !== 'voice'
    && selectedRoom.id !== currentRoom.id
  )
  // Prefer activeView so overview/events stay visible while in a call
  // (Discord-style browse — room focus only when activeView === 'room').
  const browsingSpacePage = activeView === 'overview' || activeView === 'events'
  const showVoiceFullscreen = !!(currentRoom && !browsingTextWhileInVoice && !browsingSpacePage)
  const showTextRoom = !!(
    selectedRoom
    && selectedRoom.type !== 'voice'
    && !browsingSpacePage
    && (browsingTextWhileInVoice || !currentRoom)
  )
  const showSpacePage = !showVoiceFullscreen && !showTextRoom
  // When Início has no Space panel, still offer return-to-call controls.
  const showHomeVoiceBar = !!(currentRoom && showSpacePage && !panelVisible)

  const [keptTextRooms, setKeptTextRooms] = useState([])
  const perfProfile = usePerfProfile()
  const textKeepAlive = Math.max(1, Number(perfProfile?.budgets?.textKeepAlive) || 1)

  // Keep last N text rooms mounted (voice keep-alive pattern) so covers don't remount black.
  useEffect(() => {
    if (selectedRoom && selectedRoom.type !== 'voice') {
      setKeptTextRooms((prev) => {
        const next = [selectedRoom, ...prev.filter((r) => r?.id && r.id !== selectedRoom.id)]
        return next.slice(0, textKeepAlive)
      })
    }
  }, [selectedRoom, textKeepAlive])

  useEffect(() => {
    setKeptTextRooms([])
  }, [currentSpace?.id])

  const textRoomAlive = keptTextRooms.length > 0 && !!currentSpace
  const activeTextId = showTextRoom ? selectedRoom?.id : null

  const openSpaceView = useCallback((view) => {
    setActiveView(view)
    closeTextRoom()
  }, [closeTextRoom])

  const openRoomFocus = useCallback((room) => {
    if (!room) return
    const self = membersWithTags.find((m) => m.userId === currentUserId) || null
    const bypass = canPerm('mod_chat') || isCreator
    const needsAccept = spaceRequiresRulesAccept({
      space: currentSpace,
      member: self,
      canBypass: bypass,
    })
    if (needsAccept) {
      const rulesRoom = findRulesRoom(currentSpace)
      const isRules = room.id && rulesRoom?.id === room.id
      if (!isRules) {
        flashToast('Aceite as regras para liberar o Space')
        if (rulesRoom) {
          setActiveView('room')
          selectRoom(rulesRoom)
        }
        return
      }
    }
    setActiveView('room')
    selectRoom(room)
  }, [
    selectRoom,
    membersWithTags,
    currentUserId,
    canPerm,
    isCreator,
    currentSpace,
  ])

  const returnToVoice = useCallback(() => {
    setActiveView('room')
    focusVoiceRoom()
  }, [focusVoiceRoom])

  const leaveTextToOverview = useCallback(() => {
    closeTextRoom()
    setActiveView('overview')
  }, [closeTextRoom])

  const peer = useMemo(() => {
    const space = callSpace || currentSpace
    if (!currentRoom || !space) return null
    return {
      id: currentRoom.id,
      name: currentRoom.name,
      spaceName: space.name,
      roomId: currentRoom.id,
      spaceId: space.id,
      isCreator: currentRoom.createdBy === currentUserId,
    }
  }, [currentRoom, callSpace, currentSpace, currentUserId])

  const [pendingNotifRoom, setPendingNotifRoom] = useState(null)

  const handleOpenNotifTarget = useCallback(async ({ spaceId, roomId }) => {
    if (!spaceId) return
    if (roomId) setPendingNotifRoom({ spaceId, roomId })
    if (currentSpace?.id !== spaceId) {
      await handleSelectSpace(spaceId)
    } else if (roomId) {
      const found = (currentSpace.rooms || []).find((r) => r.id === roomId)
      if (found) {
        openRoomFocus(found)
        setPendingNotifRoom(null)
      }
    }
  }, [currentSpace, handleSelectSpace, openRoomFocus])

  const handleOpenContinueRoom = useCallback(async (spaceId, room) => {
    if (!spaceId || !room?.id) {
      if (spaceId) await handleSelectSpace(spaceId)
      return
    }
    setPendingNotifRoom({ spaceId, roomId: room.id })
    if (currentSpace?.id !== spaceId) {
      await handleSelectSpace(spaceId)
    } else {
      openRoomFocus(room)
      setPendingNotifRoom(null)
    }
  }, [currentSpace?.id, handleSelectSpace, openRoomFocus])

  useEffect(() => {
    if (!pendingNotifRoom || currentSpace?.id !== pendingNotifRoom.spaceId) return
    const found = (currentSpace.rooms || []).find((r) => r.id === pendingNotifRoom.roomId)
    if (!found) return
    openRoomFocus(found)
    setPendingNotifRoom(null)
  }, [pendingNotifRoom, currentSpace, openRoomFocus])

  return (
    <NotificationsProvider
      userId={currentUserId}
      spaces={visibleSpaces}
      currentSpaceId={currentSpace?.id || null}
      currentRoomId={selectedRoom?.id || currentRoom?.id || null}
    >
    <div className="flex h-full min-h-0 bg-canvas overflow-hidden text-strong" style={rootTokens}>
      {/* Panel 1: Spaces rail */}
      <SpacesRail
        compact={compactRail}
        spaces={visibleSpaces}
        currentSpaceId={currentSpace?.id || null}
        switchingSpaceId={switchingSpaceId}
        onSelectSpace={handleSelectSpace}
        onAddSpace={() => setShowSpaceCreator(true)}
        onOpenSpaceHub={() => setShowSpaceHub(true)}
        onOpenAccount={() => { setAccountPage('profile'); setShowAccount(true) }}
        accountOpen={showAccount}
        accountPhoto={accountProfile.profile.photoURL}
        accountName={accountProfile.profile.displayName}
        notificationBell={
          <NotificationBell placement="rail" onOpenTarget={handleOpenNotifTarget} />
        }
      />

      <div className="relative flex-1 min-w-0 min-h-0 flex">
      <div className={`flex flex-1 min-w-0 min-h-0 ${showAccount ? 'invisible pointer-events-none absolute inset-0' : ''}`}>

      {/* Panel 2: Space contextual panel — docked on wide screens,
          overlay drawer when the window (or phone) is too narrow. */}
      {panelVisible && overlayNav && (
        <button
          type="button"
          aria-label="Fechar painel do Space"
          className="absolute inset-0 z-40 bg-black/50"
          onClick={togglePanel}
        />
      )}
      {panelVisible && (
        <div
          className={
            overlayNav
              ? 'absolute left-0 top-0 z-50 h-full w-[min(280px,88vw)] shadow-2xl animate-fade-in-left vc-side-shell'
              : 'vc-side-shell w-[min(280px,32vw)] min-w-[220px] max-w-[280px] shrink-0 h-full animate-fade-in-left'
          }
        >
          <SpaceContextPanel
            space={currentSpace}
            activeView={activeView}
            onChangeView={(view) => {
              openSpaceView(view)
              if (overlayNav) setPanelCollapsed(true)
            }}
            onSelectRoom={(room) => {
              openRoomFocus(room)
              if (overlayNav) setPanelCollapsed(true)
            }}
            onCreateRoom={(groupId) => setRoomEditor({ mode: 'create', groupId: groupId || null })}
            onEditRoom={(room) => setRoomEditor({ mode: 'edit', room })}
            onDeleteRoom={deleteRoom}
            members={membersWithTags}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentRoomId={currentRoom?.id || null}
            selectedRoomId={selectedRoom?.id || null}
            isCreator={isCreator}
            canEditSpace={canPerm('edit_space')}
            canManageRooms={canPerm('manage_rooms')}
            onEditSpace={editSpace}
            onLeaveSpace={handleLeaveSpace}
            onDeleteSpace={deleteSpace}
            onCollapse={togglePanel}
            onInvite={handleOpenInvite}
            onOpenSettings={() => setShowSettingsModal(true)}
            optimisticFirstRoom={optimisticFirstRoom}
          />
        </div>
      )}

      {showHomeChrome && !showAccount && (
        <div className="w-[min(260px,36vw)] min-w-[200px] max-w-[280px] shrink-0 h-full animate-fade-in-left">
          <HomeNavPanel
            activeTab={homeTab}
            onChangeTab={setHomeTab}
            spaces={visibleSpaces}
            accountName={accountProfile.profile.displayName}
            accountPhoto={accountProfile.profile.photoURL}
            currentUserId={currentUserId}
            connected={connStatus === 'connected'}
            onSelectSpace={handleSelectSpace}
            onOpenAccount={() => {
              setShowAccount(true)
              setAccountPage('profile')
            }}
            onOpenHub={() => setShowSpaceHub(true)}
            onOpenSettings={() => setShowSettingsModal(true)}
          />
        </div>
      )}

      {/* aria-live announcer */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {voiceStatus}
      </div>

      {/* Panel 3: Main area */}
      <main
        className={[
          'relative flex-1 min-w-0 min-h-0 flex flex-col bg-canvas overflow-hidden',
          !showAccount && !panelVisible && currentSpace ? 'vc-main-pad-nav-toggle' : '',
          !showAccount && peoplePanelCollapsed && currentSpace ? 'vc-main-pad-people-toggle' : '',
        ].filter(Boolean).join(' ')}
      >
        {/* Reopen toggles live inside main so they don't cover the room header. */}
        {!showAccount && !panelVisible && currentSpace && (
          <button
            type="button"
            onClick={togglePanel}
            aria-label="Abrir painel do Space"
            title="Abrir painel do Space"
            className="vc-panel-reopen vc-panel-reopen--nav"
          >
            <PanelLeftOpen size={15} strokeWidth={1.85} />
          </button>
        )}
        {!showAccount && peoplePanelCollapsed && currentSpace && (
          <button
            type="button"
            onClick={() => setPeoplePanelCollapsed(false)}
            aria-label="Abrir painel de pessoas"
            title="Abrir painel de pessoas"
            className="vc-panel-reopen vc-panel-reopen--people"
          >
            <PanelRightOpen size={15} strokeWidth={1.85} />
          </button>
        )}
        {connStatus === 'connecting' && (
          <div className="flex items-center justify-center gap-2 py-2 border-b border-line bg-canvas text-[11px] text-muted">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-line border-t-accent vc-anim-spin" />
            Conectando ao servidor…
          </div>
        )}
        {connStatus === 'reconnecting' && (
          <div className="flex items-center justify-center gap-2 py-2 border-b border-warning/30 bg-warning/10 text-[11px] text-warning" role="status">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-warning/30 border-t-warning vc-anim-spin" />
            Conexão instável — tentando reconectar…
          </div>
        )}
        {connStatus === 'failed' && (
          <div className="flex items-center justify-center gap-3 py-2 border-b border-danger/30 bg-danger/10 text-[11px] text-danger" role="alert">
            <span>Servidor indisponível. Verifique se o signaling está rodando.</span>
          </div>
        )}
        {switchingSpaceId && (
          <div className="flex items-center justify-center gap-2 py-2 border-b border-line bg-canvas text-[11px] text-muted">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-line border-t-accent vc-anim-spin" />
            Entrando no Space…
          </div>
        )}

        <AnimatePresence mode="sync">
          {currentRoom && (
            <motion.div
              key={`voice-${currentRoom.id}`}
              initial={{ opacity: 1, scale: 0.995 }}
              animate={{ opacity: showVoiceFullscreen ? 1 : 0, scale: 1 }}
              exit={{ opacity: 1, scale: 0.995 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={showVoiceFullscreen ? 'absolute inset-0' : 'absolute inset-0 invisible pointer-events-none'}
              aria-hidden={!showVoiceFullscreen}
            >
              <ErrorBoundary key={currentRoom.id}>
                <Suspense fallback={<ViewLoader />}>
                  <VoiceRoomView
                    room={currentRoom}
                    space={callSpace || currentSpace}
                    peer={peer}
                    signaling={signalingClient}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    members={membersWithTags}
                    onLeave={leaveCall}
                    onInvite={handleOpenInvite}
                    onStatusChange={setVoiceStatus}
                    onOpenSettings={() => setShowSettingsModal(true)}
                  />
                </Suspense>
              </ErrorBoundary>
            </motion.div>
          )}

          {textRoomAlive && keptTextRooms.map((kept) => {
            if (!kept?.id || kept.type === 'voice') return null
            const visible = activeTextId === kept.id
            return (
              <motion.div
                key={`conversation-${kept.id}`}
                initial={false}
                animate={{ opacity: visible ? 1 : 0 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className={
                  visible
                    ? 'absolute inset-0 flex flex-col min-h-0 z-[1] overflow-hidden'
                    : 'absolute inset-0 flex flex-col min-h-0 z-[1] overflow-hidden invisible pointer-events-none'
                }
                aria-hidden={!visible}
              >
                <ErrorBoundary key={kept.id} className="h-full min-h-0 flex flex-col">
                  <Suspense fallback={<ViewLoader />}>
                    <ConversationRoom
                      room={kept}
                      space={currentSpace}
                      signaling={signalingClient}
                      currentUserId={currentUserId}
                      currentUserName={currentUserName}
                      members={membersWithTags}
                      onClose={leaveTextToOverview}
                      onInvite={handleOpenInvite}
                      voiceActive={!!currentRoom}
                      canModerateChat={canPerm('mod_chat')}
                      canKick={canPerm('kick')}
                    />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            )
          })}

          {(currentSpace || !currentRoom) && (
            <motion.div
              key={`space-page-${currentSpace?.id || 'home'}`}
              initial={false}
              animate={{
                opacity: showSpacePage ? 1 : 0,
                y: showSpacePage ? 0 : 4,
              }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={
                showSpacePage
                  ? 'absolute inset-0 min-h-0 flex flex-col overflow-hidden z-[1]'
                  : 'absolute inset-0 min-h-0 flex flex-col overflow-hidden z-[1] invisible pointer-events-none'
              }
              aria-hidden={!showSpacePage}
            >
              {showHomeVoiceBar && (
                <div className="shrink-0 border-b border-line">
                  <VoiceActiveBar
                    room={currentRoom}
                    onReturn={returnToVoice}
                    onLeave={leaveCall}
                  />
                </div>
              )}
              {activeView === 'events' && currentSpace ? (
                <Suspense fallback={<ViewLoader />}>
                  <SpaceEventsView
                    space={currentSpace}
                    onEditSpace={editSpace}
                    isCreator={isCreator}
                    canManageEvents={canPerm('manage_events')}
                    currentUserProfile={{
                      displayName: currentUserName,
                      photoURL: accountProfile.profile.photoURL,
                    }}
                  />
                </Suspense>
              ) : (
                <SpaceHome
                  space={currentSpace}
                  members={membersWithTags}
                  spaces={visibleSpaces}
                  accountName={accountProfile.profile.displayName}
                  accountPhoto={accountProfile.profile.photoURL}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  homeTab={homeTab}
                  onSelectRoom={openRoomFocus}
                  onSelectSpace={handleSelectSpace}
                  onCreateRoom={(groupId) => setRoomEditor({ mode: 'create', groupId: groupId || null })}
                  onCreateSpace={() => setShowSpaceCreator(true)}
                  onOpenHub={() => setShowSpaceHub(true)}
                  onJoinPublic={handleHubJoined}
                  onOpenContinueRoom={handleOpenContinueRoom}
                  onOpenSpaceEvents={handleOpenSpaceEvents}
                  onOpenAccount={() => {
                    setShowAccount(true)
                    setAccountPage('profile')
                  }}
                  onOpenNotifTarget={handleOpenNotifTarget}
                  onInvite={handleOpenInvite}
                  onOpenEvents={() => openSpaceView('events')}
                  onEditSpace={editSpace}
                  isCreator={isCreator}
                  canEditSpace={canPerm('edit_space')}
                  canManageRooms={canPerm('manage_rooms')}
                  connected={connStatus === 'connected'}
                  hostname={hostname}
                  optimisticFirstRoom={optimisticFirstRoom}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Panel 3.5: People (right) — same panel for voice and text. */}
      {!peoplePanelCollapsed && currentSpace && overlayPeople && (
        <button
          type="button"
          aria-label="Fechar painel de pessoas"
          className="absolute inset-0 z-40 bg-black/50"
          onClick={() => setPeoplePanelCollapsed(true)}
        />
      )}
      {currentSpace && !peoplePanelCollapsed && (
        <div
          key={`people-panel-${currentSpace.id}`}
          className={
            overlayPeople
              ? 'absolute right-0 top-0 z-50 h-full w-[min(280px,88vw)] shadow-2xl animate-fade-in-right vc-people-shell'
              : 'vc-people-shell w-[min(260px,28vw)] min-w-[220px] max-w-[280px] shrink-0 h-full animate-fade-in-right'
          }
        >
          <Suspense fallback={null}>
            <PeoplePanel
              space={currentSpace}
              members={membersWithTags}
              currentUserId={currentUserId}
              onInvite={handleOpenInvite}
              onOpenProfile={(member) => profile.openProfile(member.userId)}
              onClose={() => setPeoplePanelCollapsed(true)}
              voiceRoom={currentRoom}
              onFocusVoice={returnToVoice}
              onLeaveCall={leaveCall}
              voicePeers={
                currentRoom
                  ? membersWithTags.filter((m) => m?.location?.roomId === currentRoom.id)
                  : []
              }
              voicePeerCount={
                currentRoom
                  ? membersWithTags.filter((m) => m?.location?.roomId === currentRoom.id).length
                  : 0
              }
            />
          </Suspense>
        </div>
      )}

      {showHomeChrome && !showAccount && !overlayPeople && (
        <div
          key="home-aside"
          className="w-[min(280px,28vw)] min-w-[220px] max-w-[300px] shrink-0 h-full animate-fade-in-right"
        >
          <HomeAside
            mode={homeTab === 'amigos' ? 'friends' : 'home'}
            friends={realOnlineFriends}
            friendCount={realOnlineFriends.length}
            pendingCount={realIncoming.length}
            nextEvent={homeNextEvent}
            events={aggregateUpcomingEvents(visibleSpaces)}
            rsvpCounts={homeRsvpCounts}
            rsvpAttendees={homeRsvpAttendees}
            onOpenEvent={(ev) => handleOpenSpaceEvents(ev?.spaceId)}
          />
        </div>
      )}

      </div>

      {showAccount && (
        <Suspense fallback={<ViewLoader />}>
          <AccountShell
            profile={accountProfile.profile}
            loading={accountProfile.loading}
            saving={accountProfile.saving}
            error={accountProfile.error}
            spaces={spaces}
            settings={settings}
            onSave={accountProfile.save}
            onAvatar={accountProfile.setAvatar}
            onCover={accountProfile.setCover}
            onChangeSettings={updateSettings}
            onOpenSettings={() => setShowSettingsModal(true)}
            onSignOut={handleSignOut}
            page={accountPage}
            onChangePage={setAccountPage}
            onDisplayName={(name) => signalingClient?.setDisplayName?.(name)}
            onPublishProfile={(patch) => signalingClient?.setProfile?.(patch)}
          />
        </Suspense>
      )}
      </div>

      {/* Modals */}
      {showSpaceCreator && (
        <Suspense fallback={null}>
          <SpaceCreator onCreate={handleCreateSpace} onClose={() => setShowSpaceCreator(false)} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <SpaceHubModal
          open={showSpaceHub}
          onClose={() => setShowSpaceHub(false)}
          memberSpaceIds={spaces.map((s) => s.id)}
          onJoined={handleHubJoined}
        />
      </Suspense>
      <Suspense fallback={null}>
        <RoomEditorModal
          open={!!roomEditor}
          mode={roomEditor?.mode || 'create'}
          room={roomEditor?.room || null}
          space={currentSpace}
          defaultGroupId={roomEditor?.groupId || null}
          submitting={creatingRoom}
          onClose={() => setRoomEditor(null)}
          onCreate={createRoom}
          onUpdate={(room, patch) => updateRoom(room.id, patch)}
          onDelete={(room) => deleteRoom(room.id)}
        />
      </Suspense>
      {showSettingsModal && (
        <Suspense fallback={null}>
          <SettingsModal
            settings={settings}
            onChange={updateSettings}
            onClose={() => setShowSettingsModal(false)}
            account={account}
            accountProfile={accountProfile.profile}
            isPrincipal={isPrincipal}
            canClaimPrincipal={canClaim}
            onClaimPrincipal={claim}
            onSignOut={handleSignOut}
          />
        </Suspense>
      )}

      {/* Toast for connection errors */}
      <AnimatePresence>
        {connError && (
          <motion.div
            key="conn-error"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-4 right-4 px-4 py-2.5 rounded-lg bg-danger/15 border border-danger/30 text-danger text-[12px] shadow-lg z-50"
          >
            Erro ao conectar: {connError}
          </motion.div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        <ProfilePopover
          open={profile.open && !!profile.data?.member}
          member={profile.data?.member}
          space={profile.data?.space}
          isCreator={profile.data?.isCreator}
          canAssignRoles={!!profile.data?.canAssignRoles}
          canKick={!!profile.data?.canKick}
          selfPerms={profile.data?.selfPerms}
          selfMember={profile.data?.selfMember}
          currentUserId={currentUserId}
          currentUserProfile={accountProfile.profile}
          onClose={profile.closeProfile}
          onInvite={() => handleOpenInvite(currentRoom || selectedRoom)}
          onOpenAccount={() => { setAccountPage('profile'); setShowAccount(true) }}
          onKick={handleKickMember}
        />
      </Suspense>

      <Suspense fallback={null}>
        <InviteModal
          open={!!inviteRoom}
          onClose={() => setInviteRoom(null)}
          space={currentSpace}
          room={inviteRoom}
        />
      </Suspense>
    </div>
    </NotificationsProvider>
  )
}