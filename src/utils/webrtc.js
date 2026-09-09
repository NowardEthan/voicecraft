/**
 * Utilitários para conexão P2P via WebRTC
 */

// STUN servers públicos para NAT traversal
export const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ]
}

/**
 * Cria uma conexão WebRTC com um peer
 */
export function createPeerConnection(config = {}) {
  const peerConnection = new RTCPeerConnection({
    ...ICE_SERVERS,
    ...config
  })

  return peerConnection
}

/**
 * Adiciona stream local à conexão
 */
export function addLocalStream(peerConnection, localStream) {
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream)
  })
}

/**
 * Gera offer SDP
 */
export async function createOffer(peerConnection) {
  const offer = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(offer)
  return offer
}

/**
 * Gera answer SDP
 */
export async function createAnswer(peerConnection) {
  const answer = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(answer)
  return answer
}

/**
 * Processa signal de outro peer
 */
export async function handleSignal(peerConnection, signal) {
  if (signal.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
    const answer = await createAnswer(peerConnection)
    return answer
  } else if (signal.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
    return null
  } else if (signal.candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(signal))
    return null
  }
}

/**
 * Serializa signal para envio
 */
export function serializeSignal(sdp) {
  return JSON.stringify(sdp)
}

/**
 * Deserializa signal recebido
 */
export function deserializeSignal(str) {
  return JSON.parse(str)
}

/**
 * Verifica qualidade da conexão
 */
export function getConnectionStats(peerConnection) {
  return peerConnection.getStats().then(stats => {
    let latency = null
    let bandwidth = null

    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        latency = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : null
      }
      if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
        bandwidth = report.bytesReceived || report.bytesSent
      }
    })

    return { latency, bandwidth }
  })
}

/**
 * Obtém o estado da conexão
 */
export function getConnectionState(peerConnection) {
  return peerConnection.connectionState
}
