/**
 * Resolve LiveKit credentials for build-time embed into the Electron main bundle.
 * Priority: process env → LiveKit/Keys LiveKit.txt (local, gitignored).
 * Never commit real values; CI should pass LIVEKIT_* secrets.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function parseKeysFile(raw) {
  const out = { url: '', apiKey: '', apiSecret: '' }
  for (const line of String(raw || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
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

export function resolveLiveKitEmbed() {
  const fromEnv = {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
  }
  if (fromEnv.url && fromEnv.apiKey && fromEnv.apiSecret) {
    return { ...fromEnv, source: 'env' }
  }

  const candidates = [
    path.join(root, 'LiveKit', 'Keys LiveKit.txt'),
    path.join(root, 'keys', 'livekit-keys.txt'),
  ]
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const parsed = parseKeysFile(fs.readFileSync(file, 'utf8'))
      if (parsed.url && parsed.apiKey && parsed.apiSecret && !parsed.apiSecret.includes('•')) {
        return { ...parsed, source: 'file' }
      }
    } catch {}
  }
  return { url: '', apiKey: '', apiSecret: '', source: 'none' }
}
