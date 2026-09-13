/**
 * Invite / deep-link helpers for joining Spaces.
 *
 * Share format (pretty):
 *   https://voicecraft.app/invite/{spaceId}
 *   https://voicecraft.app/invite/{spaceId}/{roomId}
 *
 * Also accepts legacy query links (?space=&room=) and raw ids.
 */

const DEFAULT_INVITE_ORIGIN = 'https://voicecraft.app'

/** Public origin used in shareable invite links (never localhost). */
export function getInviteOrigin() {
  const fromEnv = String(
    import.meta.env?.VITE_PUBLIC_APP_URL
    || import.meta.env?.VITE_INVITE_ORIGIN
    || '',
  ).trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined') {
    const origin = String(window.location?.origin || '')
    if (origin && !isLocalDevOrigin(origin)) return origin.replace(/\/$/, '')
  }
  return DEFAULT_INVITE_ORIGIN
}

function isLocalDevOrigin(origin) {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(origin)
    || origin.startsWith('file:')
    || origin.startsWith('app://')
}

/**
 * Pretty invite URL for sharing.
 * Example: https://voicecraft.app/invite/abc123/room456
 */
export function buildSpaceInviteUrl({ spaceId, roomId = null, origin = null } = {}) {
  const id = sanitizeId(spaceId)
  if (!id) return ''
  const base = (origin || getInviteOrigin()).replace(/\/$/, '')
  let url = `${base}/invite/${id}`
  const rid = roomId ? sanitizeId(roomId) : ''
  if (rid) url += `/${rid}`
  return url
}

/** Compact display form of the invite code (space id). */
export function formatInviteCode(spaceId) {
  const id = sanitizeId(spaceId)
  if (!id) return ''
  if (id.length <= 8) return id.toUpperCase()
  // Chunk for readability: ABCD-EFGH-…
  const parts = id.match(/.{1,4}/g) || [id]
  return parts.join('-').toUpperCase()
}

export function buildInviteShareText({ spaceName, roomName = null, url, code } = {}) {
  const space = String(spaceName || 'um Space').trim() || 'um Space'
  const link = url || ''
  const codeLine = code ? `\nCódigo: ${code}` : ''
  if (roomName) {
    return `Te convido pro VoiceCraft — entre em "${space}" e abra a sala "${roomName}":\n${link}${codeLine}`
  }
  return `Te convido pro VoiceCraft — entre no Space "${space}":\n${link}${codeLine}`
}

/**
 * Extract spaceId (and optional roomId) from a pasted invite URL or raw id.
 * Accepts:
 *   - https://host/invite/abc
 *   - https://host/invite/abc/room
 *   - https://host/i/abc
 *   - https://host/?space=abc&room=xyz
 *   - space=abc
 *   - raw space id / formatted code (ABCD-EFGH)
 */
export function parseSpaceInvite(input) {
  const raw = String(input || '').trim()
  if (!raw) return null

  try {
    if (raw.includes('://') || raw.startsWith('/') || raw.startsWith('?') || raw.includes('space=')) {
      const url = raw.includes('://')
        ? new URL(raw)
        : new URL(raw.startsWith('?') || raw.startsWith('/') ? raw : `?${raw}`, 'https://voicecraft.local')

      const pathMatch = url.pathname.match(/^\/(?:invite|i)\/([^/]+)(?:\/([^/]+))?\/?$/i)
      if (pathMatch) {
        return {
          spaceId: sanitizeId(pathMatch[1]),
          roomId: pathMatch[2] ? sanitizeId(pathMatch[2]) : null,
        }
      }

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
