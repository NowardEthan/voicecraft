/**
 * useRoomActions — encapsulates the room selection, creation, and
 * voice-takeover transitions.
 *
 * Owns:
 *   - selectedRoom (text-room in focus, opens TextRoomView)
 *   - currentRoom (voice room entered, opens VoiceRoomView)
 *   - transitioning (visual "joining…" flag)
 *   - creatingRoom (in-flight createRoom guard)
 *
 * Race protection: each pending async call bumps `pendingRoomTokenRef`.
 * Duplicate clicks in the same tick get deduped; stale responses are
 * discarded.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSharedSignaling } from '../../../shared/connection/useSignaling'
import { flashToast } from '../../../shared/utils/toast'
import { playCallSound } from '../../../shared/audio/callSounds'
import { isSpaceNotifyOn } from '../../spaces/model/spacePreferences'
import { DEFAULT_ROOM_NAMES } from '../model/roomPurposes'

export function useRoomActions() {
  const sig = getSharedSignaling()
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const [creatingRoom, setCreatingRoom] = useState(false)
  const pendingRoomTokenRef = useRef(0)

  // Wire up server-pushed "entered"/"left" callbacks so we mirror the
  // server's view of where the user is. Uses the multi-subscriber API
  // so we don't stomp on useCurrentSpace's own room listener.
  useEffect(() => {
    const off = sig.onRoomChanged((info) => {
      if (info.kind === 'entered') {
        if (info.room?.type === 'voice') setCurrentRoom(info.room)
        setTransitioning(false)
      } else if (info.kind === 'left') {
        setCurrentRoom(null)
        setTransitioning(false)
      } else if (info.kind === 'updated' && info.room) {
        setSelectedRoom((prev) => (prev?.id === info.room.id ? info.room : prev))
        setCurrentRoom((prev) => {
          if (prev?.id !== info.room.id) return prev
          // Keep the LiveKit call mounted unless the room was intentionally
          // converted away from voice (not a transient Firestore flicker).
          if (info.room.type === 'voice') return info.room
          return prev
        })
        if (
          info.room.type !== 'voice'
          && sig.roomId === info.room.id
          && info.room.purpose
          && info.room.purpose !== 'voice'
        ) {
          sig.leaveRoom?.()
          setCurrentRoom((prev) => (prev?.id === info.room.id ? null : prev))
        }
      }
    })
    return off
  }, [sig])

  const currentRoomRef = useRef(currentRoom)
  currentRoomRef.current = currentRoom
  const selectedRoomRef = useRef(selectedRoom)
  selectedRoomRef.current = selectedRoom

  const selectRoom = useCallback((room) => {
    if (!room) {
      setSelectedRoom(null)
      return
    }
    // The optimistic first-room placeholder uses a synthetic id
    // ('__optimistic__') that the server doesn't know about.
    if (!room.id || room.id === '__optimistic__') return

    const voice = currentRoomRef.current

    // Voice room: mount LiveKit immediately; Firestore catches up in background.
    if (room.type === 'voice') {
      setSelectedRoom(null)
      if (voice?.id === room.id) return
      const prevVoice = voice
      setCurrentRoom(room)
      setTransitioning(false)
      Promise.resolve(sig.enterRoom?.(room.id)).catch((err) => {
        console.warn('[selectRoom] enter voice failed', err)
        setCurrentRoom((cur) => (cur?.id === room.id ? (prevVoice || null) : cur))
        flashToast(err?.message || 'não deu pra entrar na call')
      })
      return
    }

    // Text room: focus UI only. Never leave an active voice call.
    if (selectedRoom?.id === room.id) return
    setSelectedRoom(room)
    if (!voice) {
      sig.enterRoom?.(room.id)
    }
  }, [selectedRoom, sig])

  const closeTextRoom = useCallback(() => {
    setSelectedRoom(null)
    // If we were only in a text room (not a voice call), leave that room membership.
    const voice = currentRoomRef.current
    if (!voice && sig.roomId) {
      sig.leaveRoom?.()
    }
  }, [sig])

  const leaveCall = useCallback(() => {
    playCallSound('leave')
    setTransitioning(true)
    sig.leaveRoom?.()
    setTimeout(() => {
      setCurrentRoom(null)
      setTransitioning(false)
      // Still browsing a text room? Join it now that the call ended.
      const text = selectedRoomRef.current
      if (text?.id && text.type !== 'voice') {
        sig.enterRoom?.(text.id)
      }
    }, 200)
  }, [sig])

  /** Return to the voice room UI without re-joining. */
  const focusVoiceRoom = useCallback(() => {
    setSelectedRoom(null)
  }, [])

  const createRoom = useCallback(async (purposeKey, nameArg, cosmetics = {}) => {
    const purpose = typeof purposeKey === 'string' ? purposeKey : 'conversation'
    const fallbackName = DEFAULT_ROOM_NAMES[purpose] || DEFAULT_ROOM_NAMES.conversation
    const name = (typeof nameArg === 'string' && nameArg.trim()) ? nameArg.trim() : fallbackName
    const myToken = ++pendingRoomTokenRef.current
    setCreatingRoom(true)
    if (isSpaceNotifyOn(sig.spaceId)) flashToast('criando sala…')
    try {
      await sig.createRoom?.(
        name,
        purpose === 'voice' ? 'voice' : 'text',
        purpose,
        cosmetics && typeof cosmetics === 'object' ? cosmetics : {},
      )
      if (pendingRoomTokenRef.current === myToken) setCreatingRoom(false)
    } catch (err) {
      if (pendingRoomTokenRef.current === myToken) setCreatingRoom(false)
      console.error('Failed to create room:', err)
      flashToast('não deu pra criar a sala')
      throw err
    }
  }, [sig])

  const updateRoom = useCallback(async (roomId, updates = {}) => {
    if (!roomId) return
    try {
      const result = await sig.updateRoom?.(roomId, updates)
      if (result?.room) {
        setSelectedRoom((prev) => (prev?.id === roomId ? result.room : prev))
        setCurrentRoom((prev) => {
          if (prev?.id !== roomId) return prev
          return result.room.type === 'voice' ? result.room : null
        })
        if (isSpaceNotifyOn(sig.spaceId)) flashToast('sala atualizada')
      }
      return result
    } catch (err) {
      console.error('Failed to update room:', err)
      flashToast('não deu pra atualizar a sala')
      throw err
    }
  }, [sig])

  const deleteRoom = useCallback((roomId) => {
    sig.deleteRoom?.(roomId)
    if (currentRoom?.id === roomId) setCurrentRoom(null)
    if (selectedRoom?.id === roomId) setSelectedRoom(null)
    if (isSpaceNotifyOn(sig.spaceId)) flashToast('sala excluída')
  }, [currentRoom, selectedRoom, sig])

  return {
    selectedRoom,
    setSelectedRoom,
    currentRoom,
    transitioning,
    creatingRoom,
    selectRoom,
    closeTextRoom,
    leaveCall,
    focusVoiceRoom,
    createRoom,
    updateRoom,
    deleteRoom,
  }
}
