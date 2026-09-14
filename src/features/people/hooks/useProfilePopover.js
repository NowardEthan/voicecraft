/**
 * useProfilePopover — global state for which profile card is open.
 * openProfile(userId) from anywhere; App mounts ProfilePopover once.
 */
import { useEffect, useState, useCallback } from 'react'

let _state = {
  open: false,
  userId: null,
  data: null,
}

const listeners = new Set()

function emit() {
  const snap = _state
  listeners.forEach((fn) => {
    try { fn(snap) } catch { /* ignore */ }
  })
}

function setState(patch) {
  _state = { ..._state, ...patch }
  emit()
}

function normalizeUserId(input) {
  if (!input) return null
  if (typeof input === 'string') return input
  if (typeof input === 'object' && input.userId) return String(input.userId)
  return null
}

/** Open the profile popover for a given userId (string or { userId }). */
export function openProfile(input) {
  const userId = normalizeUserId(input)
  if (!userId) return
  setState({ open: true, userId })
}

/** Close the profile popover (no-op if already closed). */
export function closeProfile() {
  if (!_state.open) return
  setState({ open: false, userId: null })
}

/**
 * Hook used by App to feed the popover with fresh data and to know when
 * it should render.
 */
export function useProfilePopover() {
  const [snap, setSnap] = useState(_state)
  useEffect(() => {
    const fn = (next) => {
      setSnap((prev) => {
        if (
          prev.open === next.open
          && prev.userId === next.userId
          && prev.data === next.data
        ) {
          return prev
        }
        return next
      })
    }
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  const setData = useCallback((data) => {
    const prev = _state.data
    if (prev == null && data == null) return
    if (
      prev
      && data
      && prev.member === data.member
      && prev.space === data.space
      && prev.isCreator === data.isCreator
      && prev.canAssignRoles === data.canAssignRoles
      && prev.canKick === data.canKick
      && prev.selfPerms === data.selfPerms
      && prev.selfMember === data.selfMember
    ) {
      return
    }
    _state = { ..._state, data }
    emit()
  }, [])

  return {
    open: snap.open,
    userId: snap.userId,
    data: snap.data,
    openProfile,
    closeProfile,
    setData,
  }
}

if (typeof window !== 'undefined') {
  window.__vcOpenProfile = openProfile
  window.__vcCloseProfile = closeProfile
}
