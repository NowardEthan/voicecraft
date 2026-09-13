/**
 * test_audio_discord_ipc.mjs — Automated verification for Etapa A of CONTRATO_AUDIO_DISCORD.md
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../')

let passed = 0
let failed = 0

function assert(cond, name) {
  if (cond) {
    console.log(`PASS  ${name}`)
    passed++
  } else {
    console.error(`FAIL  ${name}`)
    failed++
  }
}

// Read electron/main.js
const mainSrc = fs.readFileSync(path.join(ROOT, 'electron/main.js'), 'utf8')

// A1 — IPC audio-service:list-processes registered
assert(
  mainSrc.includes("ipcMain.handle('audio-service:list-processes'"),
  "A1 — electron/main.js registers 'audio-service:list-processes' IPC"
)

// A2 — IPC audio-service:start-loopback registered and validates processId
assert(
  mainSrc.includes("ipcMain.handle('audio-service:start-loopback'") &&
  mainSrc.includes("error: 'pid-not-found'"),
  "A2 — electron/main.js registers 'audio-service:start-loopback' IPC with pid validation"
)

// A3 — IPC audio-service:stop-loopback registered
assert(
  mainSrc.includes("ipcMain.handle('audio-service:stop-loopback'"),
  "A3 — electron/main.js registers 'audio-service:stop-loopback' IPC"
)

// A4 — Header audio:frame with type
assert(
  mainSrc.includes("wc.send('audio:frame', { type: 'mic', payload })"),
  "A4 — electron/main.js sends audio:frame with { type, payload } header"
)

// Read electron/preload.js
const preloadSrc = fs.readFileSync(path.join(ROOT, 'electron/preload.js'), 'utf8')

// A5 — Preload exposes listProcesses, startLoopback, stopLoopback
assert(
  preloadSrc.includes("listProcesses: () => ipcRenderer.invoke('audio-service:list-processes')"),
  "A5.1 — electron/preload.js exposes audioService.listProcesses()"
)

assert(
  preloadSrc.includes("startLoopback: (payload) => ipcRenderer.invoke('audio-service:start-loopback', payload)"),
  "A5.2 — electron/preload.js exposes audioService.startLoopback()"
)

assert(
  preloadSrc.includes("stopLoopback: (payload) => ipcRenderer.invoke('audio-service:stop-loopback', payload)"),
  "A5.3 — electron/preload.js exposes audioService.stopLoopback()"
)

assert(
  preloadSrc.includes("meta = { type, floats, sampleRate: 48000, channels: 1 }"),
  "A5.4 — electron/preload.js delivers meta with type to onFrame"
)

// C1 — useAppLoopbackAudio hook exists and is valid
const hookPath = path.join(ROOT, 'src/hooks/useAppLoopbackAudio.js')
assert(fs.existsSync(hookPath), "C1 — src/hooks/useAppLoopbackAudio.js exists")
const hookSrc = fs.readFileSync(hookPath, 'utf8')
assert(hookSrc.includes("export function useAppLoopbackAudio"), "C1.1 — exports useAppLoopbackAudio")
assert(hookSrc.includes("startLoopback"), "C1.2 — hook invokes startLoopback")
assert(hookSrc.includes("stopLoopback"), "C1.3 — hook invokes stopLoopback")

console.log(`\n${passed} passed · ${failed} failed`)
if (failed > 0) process.exit(1)
