/**
 * Gera um código de sala curto e legível (formato: VC-XXXX)
 * Usa apenas caracteres ambíguos foram removidos (sem 0/O, 1/I)
 */
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sem I, O, 0, 1
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `VC-${code}`
}

/**
 * Valida formato de código de sala
 */
export function isValidRoomCode(code) {
  if (!code) return false
  const cleaned = code.trim().toUpperCase()
  // Aceita VC-XXXX ou apenas XXXX
  const pattern = /^(VC-)?[A-Z0-9]{4}$/
  if (!pattern.test(cleaned)) return false
  // Garante que não tem caracteres ambíguos
  const validChars = /^[A-HJ-NP-Z2-9]+$/
  const letters = cleaned.replace('VC-', '')
  return validChars.test(letters)
}

/**
 * Normaliza código (adiciona prefixo se faltar)
 */
export function normalizeRoomCode(code) {
  const cleaned = code.trim().toUpperCase().replace(/\s/g, '')
  if (cleaned.startsWith('VC-')) return cleaned
  return `VC-${cleaned}`
}
