/**
 * useAppWarmup — silent full-app warmup (Apple-style).
 *
 * The user should never watch content "arrive". Idle background work preloads:
 *   1. Media (covers, avatars, icons) — decoded before paint
 *   2. Route chunks (rooms, modals, account, events, people)
 *   3. Shared data (public spaces)
 *
 * UI transitions still animate; loading/flick should not.
 */
import { useEffect, useMemo } from 'react'
import { resolveSpaceCover } from '../../features/spaces/model/spaceCover'
import { collectCoverUrls, warmImages } from './imageWarm'
import { createIdleQueue, warmImport, runWhenIdle } from './idlePreload'
import { ensurePublicSpaces } from './usePublicSpacesCache'

export const APP_CHUNKS = {
  voice: () => import('../../features/rooms/views/voice/VoiceRoomView'),
  text: () => import('../../components/views/TextRoomView'),
  people: () => import('../../components/layout/PeoplePanel'),
  invite: () => import('../../components/ui/InviteModal'),
  spaceCreator: () => import('../../components/SpaceCreator'),
  spaceHub: () => import('../../features/spaces/components/SpaceHubModal'),
  roomEditor: () => import('../../features/rooms/components/RoomEditorModal'),
  settings: () => import('../../features/settings/components/SettingsModal'),
  account: () => import('../../features/account/components/AccountShell').then((m) => ({ default: m.AccountShell })),
  profile: () => import('../../features/people/components/ProfilePopover'),
  events: () => import('../../features/spaces/views/SpaceEventsView'),
  amigos: () => import('../../components/views/AmigosView'),
  homeExplore: () => import('../../components/views/home/HomeExplore'),
}

const CHUNK_PHASES_HOME = [
  ['amigos', 'homeExplore', 'people', 'profile'],
  ['voice', 'text', 'events'],
  ['spaceHub', 'invite', 'spaceCreator', 'roomEditor', 'settings', 'account'],
]

const CHUNK_PHASES_IN_SPACE = [
  ['voice', 'text', 'people', 'profile', 'events'],
  ['amigos', 'homeExplore', 'spaceHub', 'invite'],
  ['spaceCreator', 'roomEditor', 'settings', 'account'],
]

function mediaUrlsFrom({ spaces, publicSpaces, friends, members }) {
  const urls = []
  for (const s of [...(spaces || []), ...(publicSpaces || [])]) {
    const cover = resolveSpaceCover(s)
    if (cover) urls.push(cover)
    if (typeof s?.icon === 'string' && (s.icon.startsWith('http') || s.icon.startsWith('data:image/'))) {
      urls.push(s.icon)
    }
  }
  urls.push(...collectCoverUrls(friends || []))
  urls.push(...collectCoverUrls(members || []))
  return [...new Set(urls)]
}

export function useAppWarmup({
  enabled = true,
  connected = false,
  homeTab = 'para-voce',
  currentSpaceId = null,
  spaces = [],
  friends = [],
  members = [],
} = {}) {
  const mediaKey = useMemo(() => {
    const spaceIds = (spaces || []).map((s) => s.id).join(',')
    const friendIds = (friends || []).map((f) => f.otherUserId || f.id).join(',')
    const memberIds = (members || []).map((m) => m.userId || m.id).join(',')
    return `${spaceIds}|${friendIds}|${memberIds}`
  }, [spaces, friends, members])

  useEffect(() => {
    if (!enabled || !connected) return undefined
    return runWhenIdle(() => {
      ensurePublicSpaces('').catch(() => {})
    }, { timeout: 500 })
  }, [enabled, connected])

  useEffect(() => {
    if (!enabled || !connected) return undefined
    let cancelled = false
    let queue

    const cancelIdle = runWhenIdle(async () => {
      if (cancelled) return
      let publicSpaces = []
      try {
        publicSpaces = await ensurePublicSpaces('')
      } catch {
        publicSpaces = []
      }
      if (cancelled) return
      const urls = mediaUrlsFrom({ spaces, publicSpaces, friends, members })
      if (!urls.length) return
      queue = createIdleQueue({ concurrency: 3, gapMs: 12 })
      queue.push(() => warmImages(urls.slice(0, 16), { concurrency: 4 }))
      for (let i = 16; i < urls.length; i += 8) {
        const batch = urls.slice(i, i + 8)
        queue.push(() => warmImages(batch, { concurrency: 3 }))
      }
    }, { timeout: 450 })

    return () => {
      cancelled = true
      cancelIdle?.()
      queue?.dispose()
    }
  }, [enabled, connected, mediaKey, spaces, friends, members])

  useEffect(() => {
    if (!enabled || !connected) return undefined
    const queue = createIdleQueue({ concurrency: 1, gapMs: 50 })
    const phases = currentSpaceId ? CHUNK_PHASES_IN_SPACE : CHUNK_PHASES_HOME

    if (homeTab === 'amigos') queue.push(() => warmImport(APP_CHUNKS.amigos))
    if (homeTab === 'eventos') queue.push(() => warmImport(APP_CHUNKS.events))

    for (const phase of phases) {
      for (const key of phase) {
        const factory = APP_CHUNKS[key]
        if (factory) queue.push(() => warmImport(factory))
      }
    }

    return () => queue.dispose()
  }, [enabled, connected, homeTab, currentSpaceId])
}

export function warmLikelyNext(kind) {
  const factory = APP_CHUNKS[kind]
  if (!factory) return
  runWhenIdle(() => warmImport(factory), { timeout: 250 })
}
