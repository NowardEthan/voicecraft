/** Static contract checks for protocol-v2 native screen audio. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8')
let passed = 0
let failed = 0
function assert(condition, name) {
  if (condition) { console.log(`PASS  ${name}`); passed += 1 }
  else { console.error(`FAIL  ${name}`); failed += 1 }
}

const main = read('electron/main.js')
const preload = read('electron/preload.js')
const helper = read('audio-service/src/main.cpp')
const loopback = read('audio-service/src/loopback_wasapi.cpp')
const capture = read('src/hooks/appLoopbackCapture.js')
const screen = read('src/hooks/useScreenShare.js')
const livekit = read('src/features/rooms/views/voice/useLiveKitRoom.js')
const picker = read('src/features/rooms/views/voice/components/ScreenSharePicker.jsx')
const pkg = JSON.parse(read('package.json'))

for (const capability of [
  'process-loopback-strict',
  'system-loopback-exclude-process-tree',
  'session-tagged-ipc',
  'source-tagged-frames-v2',
  'serialized-loopback',
]) {
  assert(helper.includes(capability) && main.includes(capability), `protocol capability: ${capability}`)
}
assert(helper.includes('kProtocolVersion = 2') && main.includes('AUDIO_PROTOCOL_VERSION = 2'), 'protocol v2 enforced on both sides')
assert(main.includes("startNativeLoopback('system', process.pid)"), 'system loopback excludes Electron root PID')
assert(main.includes("ipcMain.handle('audio-service:start-loopback-system'"), 'system loopback IPC registered')
assert(main.includes('activeLoopbackSession') && main.includes('serializeLoopback'), 'loopback sessions are serialized and tagged')
assert(main.includes('callback({ video: {} })') && !main.includes("audio: 'loopback'"), 'Chromium desktop capture is video-only')
assert(preload.includes('startLoopbackSystem:') && preload.includes('sessionId: payload?.sessionId'), 'preload exposes system start and frame session metadata')
assert(capture.indexOf('api.onFrame(') < capture.indexOf('await startMethod'), 'renderer subscribes before native start')
assert(capture.includes('MIN_RMS = 0.0001') && capture.includes('MIN_PEAK = 0.001'), 'renderer validates RMS and peak thresholds')
assert(capture.includes('startSystemLoopbackCapture') && capture.includes('await api.stopLoopback({ sessionId })'), 'renderer supports system exclusion and clean stop')
assert(screen.includes('audio: false') && screen.includes('captured.removeTrack(track)'), 'display capture remains video-only')
assert(loopback.includes('PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE') && loopback.includes('PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE'), 'strict include/exclude WASAPI modes used')
assert(loopback.includes('public IAgileObject') && loopback.includes('IID_IAgileObject') && loopback.includes('static_cast<IAgileObject*>(this)'), 'WASAPI activation callback exposes IAgileObject')
assert(loopback.includes('WAVEFORMATEX format{}') && loopback.includes('format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT') && loopback.includes('format.nChannels = 1') && loopback.includes('format.nSamplesPerSec = 48000') && loopback.includes('format.wBitsPerSample = 32') && loopback.includes('format.nBlockAlign =') && loopback.includes('format.nAvgBytesPerSec =') && loopback.includes('format.cbSize = 0') && loopback.includes('1000000, 0, &format, nullptr'), 'process loopback uses explicit 48 kHz mono float32 format')
assert(!loopback.includes('GetMixFormat(') && !loopback.includes('CoTaskMemFree('), 'process loopback does not query or free a COM mix format')
assert(!loopback.includes('AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK'), 'no endpoint-loopback fallback path')
assert(loopback.indexOf('client->Start()') < loopback.indexOf('signal_started(true)'), 'native start is acknowledged after IAudioClient start')
assert(picker.includes('system-excluding-voice') && !picker.includes('value="system"'), 'picker exposes only safe system audio mode')
assert(livekit.includes('startSystemLoopbackCapture') && livekit.includes('Screen audio is best-effort') && livekit.includes('Tela compartilhada sem áudio:'), 'LiveKit degrades failed screen audio to video-only sharing')
assert(livekit.includes('stopScreenAudio({ notify: true })') && livekit.includes('Fatal room/video failures still roll back'), 'ended screen audio is isolated from fatal video rollback')
assert(livekit.includes('wasapi-process-activate-0x8000000e') && livekit.includes('wasapi-exclude-activate-0x8000000e'), 'illegal WASAPI activation calls have friendly mapped errors')
assert(livekit.includes('RoomEvent.AudioPlaybackStatusChanged') && livekit.includes('publication?.trackSid'), 'remote playback recovery and SID keys enabled')
assert(livekit.includes("window.addEventListener('pointerdown', retryPlayback)"), 'remote playback retries after user gesture')
assert(livekit.includes('setInterval(verifyMic, 5000)'), 'microphone health is monitored after sharing')
assert(livekit.includes("key.startsWith(p.identity + ':')"), 'participant audio elements are cleaned on disconnect')
assert(pkg.scripts.build.startsWith('npm run audio:validate') && pkg.scripts.release.startsWith('npm run audio:validate'), 'build and release reject stale helper binaries')

console.log(`\n${passed} passed ? ${failed} failed`)
if (failed) process.exit(1)
