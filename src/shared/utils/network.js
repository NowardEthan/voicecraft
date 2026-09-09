/**
 * Pega IP local de forma compatível com Electron E navegador
 * - Electron: usa IPC via preload
 * - Navegador: tenta via RTCPeerConnection + STUN
 * - Fallback: mostra hostname aleatório
 */

const ADJECTIVES = ['Ágil', 'Brilhante', 'Calmo', 'Destra', 'Esperto', 'Forte', 'Gentil', 'Hábil', 'Íntegro', 'Jovial']
const NOUNS = ['Lobo', 'Águia', 'Tigre', 'Falcão', 'Leão', 'Coruja', 'Raposa', 'Urso', 'Lince', 'Cervo']

export function generateRandomName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adj} ${noun}`
}

export async function getLocalIP() {
  // 1. Tenta Electron
  if (window.electronAPI?.getLocalIP) {
    try {
      return await window.electronAPI.getLocalIP()
    } catch {}
  }

  // 2. Tenta via WebRTC STUN (funciona no navegador)
  try {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pc.createDataChannel('')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    return new Promise((resolve) => {
      let resolved = false
      const finish = (ip) => {
        if (resolved) return
        resolved = true
        pc.close()
        resolve(ip)
      }

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const match = e.candidate.candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
          if (match) finish(match[1])
        }
      }

      setTimeout(() => finish('navegador'), 3000)
    })
  } catch {
    return 'navegador'
  }
}

export async function getHostname() {
  // 1. Tenta Electron
  if (window.electronAPI?.getHostname) {
    try {
      return await window.electronAPI.getHostname()
    } catch {}
  }

  // 2. Fallback navegador: nome aleatório + cache localStorage
  try {
    const cached = localStorage.getItem('voicecraft_name')
    if (cached) return cached
  } catch {}

  const name = generateRandomName()
  try {
    localStorage.setItem('voicecraft_name', name)
  } catch {}
  return name
}
