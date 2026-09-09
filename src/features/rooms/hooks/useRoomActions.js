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
          return info.room.type === 'voice' ? info.room : null
        })
        if (info.room.type !== 'voice' && sig.roomId === info.room.id) {
          // Type flipped away from voice while we were in the call.
          sig.leaveRoom?.()
        }
      }
    })
    return off
  }, [sig])

  const selectRoom = useCallback((room) => {
    if (!room) {
      setSelectedRoom(null)
      return
    }
    if (selectedRoom?.id === room.id) return
    // The optimistic first-room placeholder uses a synthetic id
    // ('__optimistic__') that the server doesn't know about. The real
    // room id arrives within ~100ms via roomChangedCallback('created');
    // until then we ignore the click instead of sending enterRoom with
    // a fake id (which the server rejects with "room não encontrada").
    if (!room.id || room.id === '__optimistic__') return
    setSelectedRoom(room)
    if (room.type === 'voice') {
      setTransitioning(true)
      sig.enterRoom?.(room.id)
    } else {
      sig.enterRoom?.(room.id)
    }
  }, [selectedRoom, sig])

  const closeTextRoom = useCallback(() => {
    setSelectedRoom(null)
  }, [])

  const leaveCall = useCallback(() => {
    setTransitioning(true)
    sig.leaveRoom?.()
    setTimeout(() => {
      setCurrentRoom(null)
      setTransitioning(false)
    }, 200)
  }, [sig])

  const createRoom = useCallback(async (purposeKey, nameArg) => {
    const purpose = typeof purposeKey === 'string' ? purposeKey : 'conversation'
    const fallbackName = DEFAULT_ROOM_NAMES[purpose] || DEFAULT_ROOM_NAMES.conversation
    const name = (typeof nameArg === 'string' && nameArg.trim()) ? nameArg.trim() : fallbackName
    const myToken = ++pendingRoomTokenRef.current
    setCreatingRoom(true)
    if (isSpaceNotifyOn(sig.spaceId)) flashToast('criando sala…')
    try {
      await sig.createRoom?.(name, purpose === 'voice' ? 'voice' : 'text', purpose)
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
    createRoom,
    updateRoom,
    deleteRoom,
  }
}
