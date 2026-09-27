import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const binary = path.resolve(ROOT, process.argv[2] || 'resources/bin/voicecraft-audio.exe')
const EXPECTED_PROTOCOL = 2
const REQUIRED_CAPABILITIES = [
  'process-loopback-strict',
  'system-loopback-exclude-process-tree',
  'session-tagged-ipc',
  'source-tagged-frames-v2',
  'serialized-loopback',
]

if (!fs.existsSync(binary)) {
  console.error(`Audio helper not found: ${binary}`)
  process.exit(1)
}

let settled = false
let stderr = ''
const child = spawn(binary, [], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
const timer = setTimeout(() => finish(new Error('Audio helper handshake timed out')), 5000)

function finish(error, info) {
  if (settled) return
  settled = true
  clearTimeout(timer)
  try { child.stdin.write('{"type":"shutdown"}\n') } catch {}
  setTimeout(() => { try { child.kill() } catch {} }, 250).unref()
  if (error) {
    console.error(`Audio helper validation failed: ${error.message}`)
    process.exitCode = 1
  } else {
    console.log(`Audio helper OK: protocol ${info.protocolVersion}, service ${info.version || 'unknown'}`)
    console.log(`Capabilities: ${info.capabilities.join(', ')}`)
  }
}

child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
  const lines = stderr.split(/\r?\n/)
  stderr = lines.pop() || ''
  for (const line of lines) {
    let message
    try { message = JSON.parse(line) } catch { continue }
    if (message.type !== 'service-started') continue
    const capabilities = Array.isArray(message.capabilities) ? message.capabilities : []
    const missing = REQUIRED_CAPABILITIES.filter((capability) => !capabilities.includes(capability))
    if (message.protocolVersion !== EXPECTED_PROTOCOL) {
      finish(new Error(`expected protocol ${EXPECTED_PROTOCOL}, got ${message.protocolVersion ?? 'missing'}`))
    } else if (missing.length) {
      finish(new Error(`missing capabilities: ${missing.join(', ')}`))
    } else {
      finish(null, message)
    }
    return
  }
})
child.once('error', (error) => finish(error))
child.once('exit', (code, signal) => {
  if (!settled) finish(new Error(`exited before handshake (${code ?? signal ?? 'unknown'})`))
})
