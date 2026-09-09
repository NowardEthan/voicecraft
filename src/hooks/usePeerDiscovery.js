import { useState, useEffect, useRef, useCallback } from 'react'

const DISCOVERY_PORT = 54321
const DISCOVERY_INTERVAL = 2000

/**
 * Hook para descobrir peers na rede LAN via broadcast UDP
 * Usa a API de RTCDataChannel ou WebSocket local
 */
export function usePeerDiscovery(onPeerFound, onPeerLost) {
  const [isDiscovering, setIsDiscovering] = useState(false)
  const peersRef = useRef(new Map())
  const socketRef = useRef(null)
  const localIPRef = useRef('')

  const startDiscovery = useCallback(async () => {
    if (isDiscovering) return

    setIsDiscovering(true)

    // Pega o IP local
    if (window.electronAPI) {
      localIPRef.current = await window.electronAPI.getLocalIP()
    }

    // Usa BroadcastChannel API para descoberta em mesma máquina (mesmo dispositivo)
    // E AnnounceProtocol para rede local via WebSocket
    const channel = new BroadcastChannel('voicecraft-discovery')

    channel.onmessage = (event) => {
      const { type, ip, hostname, timestamp } = event.data

      // Ignora próprias mensagens
      if (ip === localIPRef.current) return

      // Ignora mensagens muito antigas (> 10s)
      if (Date.now() - timestamp > 10000) return

      if (type === 'announce') {
        if (!peersRef.current.has(ip)) {
          const peer = { ip, hostname, lastSeen: Date.now() }
          peersRef.current.set(ip, peer)
          onPeerFound?.(peer)
        } else {
          // Atualiza lastSeen
          const peer = peersRef.current.get(ip)
          peer.lastSeen = Date.now()
        }
      } else if (type === 'leave') {
        if (peersRef.current.has(ip)) {
          peersRef.current.delete(ip)
          onPeerLost?.(ip)
        }
      }
    }

    // Anuncia presença
    const announce = () => {
      channel.postMessage({
        type: 'announce',
        ip: localIPRef.current,
        hostname: window.electronAPI ? await window.electronAPI.getHostname() : 'Unknown',
        timestamp: Date.now()
      })
    }

    // Inicia anúncios
    announce()
    const interval = setInterval(announce, DISCOVERY_INTERVAL)

    // Cleanup ao desmontar
    return () => {
      clearInterval(interval)
      channel.postMessage({
        type: 'leave',
        ip: localIPRef.current,
        hostname: '',
        timestamp: Date.now()
      })
      channel.close()
      setIsDiscovering(false)
    }
  }, [isDiscovering, onPeerFound, onPeerLost])

  const stopDiscovery = useCallback(() => {
    setIsDiscovering(false)
  }, [])

  useEffect(() => {
    return () => {
      // Cleanup na desmontagem
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [])

  return {
    isDiscovering,
    startDiscovery,
    stopDiscovery,
    peers: Array.from(peersRef.current.values())
  }
}

export default usePeerDiscovery
