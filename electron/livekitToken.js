/**
 * LiveKit token minting for the Electron main process.
 * API secret stays here — never expose to the renderer.
 */
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

function parseKeysFile(raw) {
  const out = { url: '', apiKey: '', apiSecret: '' }
  const text = String(raw || '')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // Accept KEY=value anywhere on the line (incl. "Environment variables: LIVEKIT_URL=...")
    for (const m of trimmed.matchAll(/LIVEKIT_(URL|API_KEY|API_SECRET)\s*=\s*([^\s]+)/gi)) {
      const k = m[1].toUpperCase()
      const v = m[2].trim()
      if (k === 'URL') out.url = v
      if (k === 'API_KEY') out.apiKey = v
      if (k === 'API_SECRET') out.apiSecret = v
    }

    const labeled = trimmed.match(/^(Websocket URL|API key|API secret)\s*:\s*(.+)$/i)
    if (labeled) {
      const label = labeled[1].toLowerCase()
      const value = labeled[2].trim()
      if (label.includes('websocket') || label.includes('url')) out.url = value
      else if (label.includes('secret')) out.apiSecret = value
      else if (label.includes('key')) out.apiKey = value
    }
  }
  return out
}

function loadLiveKitCredentials() {
  const fromEnv = {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  }
  if (fromEnv.url && fromEnv.apiKey && fromEnv.apiSecret) return fromEnv

  const candidates = [
    path.join(app.getPath('userData'), 'livekit-keys.txt'),
    path.join(app.getPath('userData'), 'Keys LiveKit.txt'),
    path.join(app.getPath('appData'), 'voicecraft', 'livekit-keys.txt'),
    path.join(app.getPath('appData'), 'voicecraft', 'Keys LiveKit.txt'),
    path.join(app.getPath('appData'), 'voicecraft', 'Cache', 'voicecraft', 'livekit-keys.txt'),
    path.join(app.getPath('appData'), 'voicecraft', 'Cache', 'voicecraft', 'Keys LiveKit.txt'),
    path.join(app.getAppPath(), 'LiveKit', 'Keys LiveKit.txt'),
    path.join(process.cwd(), 'LiveKit', 'Keys LiveKit.txt'),
    path.join(__dirname, '..', 'LiveKit', 'Keys LiveKit.txt'),
  ]
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const parsed = parseKeysFile(fs.readFileSync(file, 'utf8'))
      if (parsed.url && parsed.apiKey && parsed.apiSecret
        && !parsed.apiSecret.includes('•')) {
        return parsed
      }
    } catch {}
  }
  return fromEnv
}

function livekitRoomName(spaceId, roomId) {
  const raw = `vc-${spaceId || 'space'}-${roomId || 'room'}`
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128)
}

async function mintLiveKitToken({ spaceId, roomId, identity, displayName }) {
  const creds = loadLiveKitCredentials()
  if (!creds.url || !creds.apiKey || !creds.apiSecret) {
    throw new Error(
      'LiveKit não configurado. Salve URL, API Key e Secret em LiveKit/Keys LiveKit.txt',
    )
  }
  if (!identity) throw new Error('identity obrigatória')
  if (!roomId) throw new Error('roomId obrigatório')

  const { AccessToken } = require('livekit-server-sdk')
  const roomName = livekitRoomName(spaceId, roomId)
  const at = new AccessToken(creds.apiKey, creds.apiSecret, {
    identity: String(identity),
    name: String(displayName || identity).slice(0, 64),
    ttl: '6h',
  })
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })
  const token = await at.toJwt()
  return { token, url: creds.url, roomName }
}

module.exports = {
  loadLiveKitCredentials,
  livekitRoomName,
  mintLiveKitToken,
}
