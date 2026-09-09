/**
 * Invite / deep-link helpers for joining Spaces.
 */

/**
 * Extract spaceId (and optional roomId) from a pasted invite URL or raw id.
 * Accepts:
 *   - https://host/?space=abc&room=xyz
 *   - space=abc
 *   - raw space id token
 */
export function parseSpaceInvite(input) {
  const raw = String(input || '').trim()
  if (!raw) return null

  try {
    if (raw.includes('://') || raw.startsWith('?') || raw.includes('space=')) {
      const url = raw.includes('://')
        ? new URL(raw)
        : new URL(raw.startsWith('?') ? raw : `?${raw}`, 'https://voicecraft.local')
      const spaceId = url.searchParams.get('space') || url.searchParams.get('s')
      const roomId = url.searchParams.get('room') || url.searchParams.get('r')
      if (spaceId) {
        return {
          spaceId: sanitizeId(spaceId),
          roomId: roomId ? sanitizeId(roomId) : null,
        }
      }
    }
  } catch {
    /* fall through to raw id */
  }

  const id = sanitizeId(raw)
  if (!id || id.length < 4) return null
  return { spaceId: id, roomId: null }
}

function sanitizeId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
}

export function normalizeVisibility(value) {
  return value === 'private' ? 'private' : 'public'
}
