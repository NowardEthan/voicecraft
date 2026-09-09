/**
 * Serializa SessionDescription/ICECandidate para string base64 curta
 * Torna possível copiar/colar via WhatsApp
 */
export function encodeSignal(signal) {
  const json = JSON.stringify(signal)
  // btoa funciona no navegador moderno
  return btoa(unescape(encodeURIComponent(json)))
}

export function decodeSignal(encoded) {
  try {
    const json = decodeURIComponent(escape(atob(encoded.trim())))
    return JSON.parse(json)
  } catch (err) {
    return null
  }
}

/**
 * Valida se string parece um código de convite válido
 */
export function isValidInvite(code) {
  if (!code || typeof code !== 'string') return false
  const trimmed = code.trim()
  // aceita base64 OU base64url OU nosso prefixo VC-XXXX (room code)
  if (trimmed.startsWith('VC-')) return true
  if (trimmed.length < 20) return false
  try {
    const decoded = decodeSignal(trimmed)
    return decoded && (decoded.type === 'offer' || decoded.type === 'answer' || decoded.candidate)
  } catch {
    return false
  }
}
