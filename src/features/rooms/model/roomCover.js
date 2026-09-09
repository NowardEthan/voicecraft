/**
 * Room cover — per-room background image that the user can upload from
 * their computer. Persisted in localStorage keyed by room.id.
 *
 * Why a separate util (and not the Space cover):
 *   - The Space cover is server-pushed metadata and travels with the
 *     Space across devices.
 *   - The room cover is purely cosmetic / per-user — different people
 *     can pick different moods for the same room. So it lives locally.
 *
 * Storage: localStorage['voicecraft:roomCover:<roomId>'] = dataURL.
 * We cap the size to 4 MB to stay in sync with the Space cover ceiling
 * and the signaling server.
 */
const STORAGE_PREFIX = 'voicecraft:roomCover:'
const MAX_BYTES = 4 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function getRoomCover(roomId) {
  if (!roomId || typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + roomId) || null
  } catch {
    return null
  }
}

export function setRoomCover(roomId, dataUrl) {
  if (!roomId || typeof window === 'undefined') return false
  try {
    if (dataUrl == null) {
      window.localStorage.removeItem(STORAGE_PREFIX + roomId)
    } else {
      window.localStorage.setItem(STORAGE_PREFIX + roomId, dataUrl)
    }
    return true
  } catch (err) {
    // Quota exceeded or storage unavailable. Surface a friendly
    // message to the caller.
    console.warn('setRoomCover failed:', err)
    return false
  }
}

export function clearRoomCover(roomId) {
  return setRoomCover(roomId, null)
}

/**
 * Read a File from a <input type="file"> and turn it into a dataURL.
 * Validates size + type. Returns a Promise that rejects with a
 * user-friendly Error on failure.
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Nenhum arquivo selecionado'))
    if (!ALLOWED_TYPES.has(file.type)) {
      return reject(new Error('Formato não suportado. Use JPG, PNG, WebP ou GIF.'))
    }
    if (file.size > MAX_BYTES) {
      return reject(new Error('Imagem muito grande. Máximo 4 MB.'))
    }
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Falha ao ler a imagem'))
    reader.readAsDataURL(file)
  })
}
