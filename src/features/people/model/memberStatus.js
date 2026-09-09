const STORAGE_KEY = 'voicecraft:memberStatus'

export function getLocalMemberStatus() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setLocalMemberStatus(status) {
  if (typeof window === 'undefined') return
  try {
    const next = String(status || '').trim().slice(0, 40)
    if (next) window.localStorage.setItem(STORAGE_KEY, next)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore quota / private mode
  }
}
