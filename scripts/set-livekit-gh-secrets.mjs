/**
 * Upload LiveKit credentials from local Keys file to GitHub Actions secrets.
 * Does not print secret values.
 */
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { resolveLiveKitEmbed } from './resolve-livekit-embed.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const embed = resolveLiveKitEmbed()
if (embed.source === 'none' || !embed.url || !embed.apiKey || !embed.apiSecret) {
  console.error('No LiveKit credentials found (env or LiveKit/Keys LiveKit.txt)')
  process.exit(1)
}

function setSecret(name, value) {
  const r = spawnSync('gh', ['secret', 'set', name], {
    input: value,
    encoding: 'utf8',
    cwd: root,
    shell: true,
  })
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `failed to set ${name}`)
    process.exit(r.status || 1)
  }
  console.log(`ok  ${name} (${value.length} chars, source=${embed.source})`)
}

setSecret('LIVEKIT_URL', embed.url)
setSecret('LIVEKIT_API_KEY', embed.apiKey)
setSecret('LIVEKIT_API_SECRET', embed.apiSecret)
console.log('GitHub secrets updated')
