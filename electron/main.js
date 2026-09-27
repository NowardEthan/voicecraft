const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, shell, session } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const { pathToFileURL } = require('url')

// Telemetria: marca o instante em que o main process comeÃ§a a executar.
try {
  const { performance } = require('node:perf_hooks')
  performance.mark('voice:process-start')
} catch {}

let mainWindow
let tray = null
let audioServiceProc = null

const isDev = !app.isPackaged

// ---------- LiveKit token minting (inlined â€” Vite won't ship sibling requires in asar) ----------
function parseLiveKitKeysFile(raw) {
  const out = { url: '', apiKey: '', apiSecret: '' }
  const text = String(raw || '')
  for (const line of text.split(/\r?\n/)) {
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
    // Legacy nested profile (bug from setPath('cache') on Windows)
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
      const parsed = parseLiveKitKeysFile(fs.readFileSync(file, 'utf8'))
      if (parsed.url && parsed.apiKey && parsed.apiSecret
        && !parsed.apiSecret.includes('â€¢')) {
        return parsed
      }
    } catch {}
  }

  // Build-time embed (CI secrets / local Keys file via Vite define). Empty in plain dev
  // unless vite.config resolved credentials at bundle time.
  const embedded = {
    url: typeof __VC_LIVEKIT_URL__ !== 'undefined' ? __VC_LIVEKIT_URL__ : '',
    apiKey: typeof __VC_LIVEKIT_API_KEY__ !== 'undefined' ? __VC_LIVEKIT_API_KEY__ : '',
    apiSecret: typeof __VC_LIVEKIT_API_SECRET__ !== 'undefined' ? __VC_LIVEKIT_API_SECRET__ : '',
  }
  if (embedded.url && embedded.apiKey && embedded.apiSecret) return embedded

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
      'LiveKit nÃ£o configurado. Salve URL, API Key e Secret em %APPDATA%\\voicecraft\\livekit-keys.txt',
    )
  }
  if (!identity) throw new Error('identity obrigatÃ³ria')
  if (!roomId) throw new Error('roomId obrigatÃ³rio')

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

// ---------- Auto-update (electron-updater + GitHub Releases) ----------
// Inlined so Vite's single-file main bundle does not `require('./updater')`
// at runtime (that path does not exist under dist-electron/).
let updaterWired = false
let autoUpdaterRef = null
/** Last status pushed to the renderer â€” replayed when the UI mounts late (login). */
let lastUpdaterStatus = null
let lastDownloadedVersion = null
let updateDownloaded = false
let isInstallingSilent = false

function getAutoUpdater() {
  if (!autoUpdaterRef) {
    ;({ autoUpdater: autoUpdaterRef } = require('electron-updater'))
  }
  return autoUpdaterRef
}

function sendUpdater(getMainWindow, channel, payload) {
  if (channel === 'updater:status' && payload) {
    lastUpdaterStatus = payload
  }
  const win = typeof getMainWindow === 'function' ? getMainWindow() : null
  if (!win || win.isDestroyed()) return
  try {
    win.webContents.send(channel, payload)
  } catch {}
}

function sanitizeUpdaterLogText(value) {
  return String(value)
    .replace(/([?&](?:token|access_token|key|secret|signature)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/((?:token|secret|password|authorization|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
}

function formatUpdaterLogArgs(args) {
  return args.map((value) => {
    if (value instanceof Error) return sanitizeUpdaterLogText(value.stack || value.message)
    if (typeof value === 'string') return sanitizeUpdaterLogText(value)
    try {
      return sanitizeUpdaterLogText(JSON.stringify(value, (key, nested) => (
        /token|secret|password|authorization|api[_-]?key/i.test(key) ? '[REDACTED]' : nested
      )))
    } catch {
      return sanitizeUpdaterLogText(value)
    }
  }).join(' ')
}

function createUpdaterLogger() {
  const write = (level) => (...args) => {
    log(level, `[electron-updater] ` + formatUpdaterLogArgs(args))
  }
  return {
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    debug: write('debug'),
  }
}

function installDownloadedUpdate(getMainWindow) {
  if (!app.isPackaged) return { ok: false, error: 'dev' }
  if (isInstallingSilent) return { ok: true, alreadyInstalling: true }
  if (!updateDownloaded) {
    log('warn', '[updater] install requested before an update was downloaded')
    return { ok: false, error: 'Nenhuma atualiza\u00e7\u00e3o baixada.' }
  }

  isInstallingSilent = true
  // Allow quitAndInstall to close the BrowserWindow instead of hiding it to tray.
  app.isQuiting = true
  sendUpdater(getMainWindow, 'updater:status', {
    status: 'installing',
    version: lastDownloadedVersion,
  })
  log('info', `[updater] user requested silent install for v` + (lastDownloadedVersion || 'unknown'))

  setImmediate(() => {
    try {
      // isSilent=true, isForceRunAfter=true: unattended NSIS install + forced reopen.
      getAutoUpdater().quitAndInstall(true, true)
    } catch (err) {
      isInstallingSilent = false
      app.isQuiting = false
      const message = err?.message || String(err)
      log('error', `[updater] quitAndInstall failed: ` + message)
      sendUpdater(getMainWindow, 'updater:status', { status: 'error', message })
    }
  })
  return { ok: true }
}

function setupUpdater(getMainWindow) {
  if (updaterWired) return
  updaterWired = true

  ipcMain.handle('updater:get-version', () => app.getVersion())
  ipcMain.handle('updater:get-status', () => lastUpdaterStatus)
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, error: 'AtualizaÃ§Ãµes sÃ³ funcionam no app instalado.' }
    }
    try {
      const result = await getAutoUpdater().checkForUpdates()
      return { ok: true, updateInfo: result?.updateInfo || null }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) }
    }
  })
  const installUpdate = () => installDownloadedUpdate(getMainWindow)
  ipcMain.handle('updater:install', installUpdate)
  ipcMain.handle('updater:installSilent', installUpdate)

  if (!app.isPackaged) return

  const updater = getAutoUpdater()
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = false
  updater.logger = createUpdaterLogger()
  log('info', '[updater] configured for background download and user-confirmed install')

  updater.on('checking-for-update', () => {
    log('info', '[updater] checking for update')
    sendUpdater(getMainWindow, 'updater:status', { status: 'checking' })
  })
  updater.on('update-available', (info) => {
    log('info', `[updater] update available: v` + (info?.version || 'unknown') + '; background download starting')
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'available',
      version: info?.version || null,
    })
  })
  updater.on('update-not-available', (info) => {
    log('info', `[updater] no update available (latest: v` + (info?.version || app.getVersion()) + ')')
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'not-available',
      version: info?.version || app.getVersion(),
    })
  })
  updater.on('download-progress', (p) => {
    log('debug', `[updater] download progress: ` + Number(p?.percent || 0).toFixed(1) + '% (' + (p?.transferred || 0) + '/' + (p?.total || 0) + ' bytes, ' + (p?.bytesPerSecond || 0) + ' B/s)')
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'downloading',
      percent: typeof p?.percent === 'number' ? p.percent : 0,
    })
  })
  updater.on('update-downloaded', (info) => {
    lastDownloadedVersion = info?.version || null
    updateDownloaded = true
    log('info', `[updater] update downloaded: v` + (lastDownloadedVersion || 'unknown') + '; waiting for user confirmation')
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'downloaded',
      version: lastDownloadedVersion,
    })
  })
  updater.on('error', (err) => {
    log('error', `[updater] error: ` + sanitizeUpdaterLogText(err?.stack || err?.message || String(err)))
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'error',
      message: err?.message || String(err),
    })
  })

  const runCheck = () => {
    updater.checkForUpdates().catch(() => {})
  }
  // Early + late: UI may still be on login when the first check finishes.
  setTimeout(runCheck, 6_000)
  setTimeout(runCheck, 45_000)

  // When the window finally loads (or user finishes login), re-push last status.
  const replay = () => {
    if (!lastUpdaterStatus) return
    const s = lastUpdaterStatus.status
    if (s === 'available' || s === 'downloading' || s === 'downloaded' || s === 'installing') {
      sendUpdater(getMainWindow, 'updater:status', lastUpdaterStatus)
    }
  }
  const win = typeof getMainWindow === 'function' ? getMainWindow() : null
  if (win && !win.isDestroyed()) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(replay, 800)
      setTimeout(runCheck, 2_500)
    })
  }
}

// Dev and the installed app must not share Cache/GPUCache â€” a leftover
// tray instance + `npm run dev` both lock AppData\Roaming\voicecraft and
// Chromium then prints "Unable to move the cache: Acesso negado (0x5)"
// and "Gpu Cache Creation failed: -2".
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'voicecraft-dev'))
}

// Without this, Windows taskbar/notifications pin under the default Electron AUMID
// and show the atom icon even when the .exe itself has the right icon.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.voicecraft.app')
}

// Keep RTDB / WebSocket presence alive when the window is occluded or
// minimized â€” Chromium otherwise throttles timers and can stall presence.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// Prefer system DNS on Windows â€” Chromium AsyncDns often fails to resolve
// LiveKit media hosts (ip-*.host.livekit.cloud â†’ ERR_NAME_NOT_RESOLVED / -105).
app.commandLine.appendSwitch('disable-features', 'AsyncDns,DnsOverHttps')
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2')
}

function ensureCacheDirs() {
  // Packaged builds on Windows were ending up with a nested profile at
  // %APPDATA%/voicecraft/Cache/voicecraft when setPath('cache') ran early.
  // Pin userData to the stable folder before touching cache paths.
  if (app.isPackaged) {
    const stable = path.join(app.getPath('appData'), 'voicecraft')
    try {
      if (path.resolve(app.getPath('userData')) !== path.resolve(stable)) {
        app.setPath('userData', stable)
      }
    } catch {}
  }
  const root = app.getPath('userData')
  const cacheDir = path.join(root, 'Cache')
  try { fs.mkdirSync(cacheDir, { recursive: true }) } catch {}
  // Prefer the Chromium switch only â€” setPath('cache') nested userData on Win.
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir)
  // Shader disk cache is what throws gpu_disk_cache.cc â€” GPU still works,
  // it just compiles in memory instead of fighting a locked GPUCache folder.
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
}
ensureCacheDirs()

if (app.isPackaged) {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    process.exit(0)
  }
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
}

// Resolve the path to the audio-service binary. Tries a few common build
// outputs (Release/Debug, app.asar sibling) so we don't hard-code one.
function resolveAudioServiceBinary() {
  const candidates = []
  const exeName = process.platform === 'win32' ? 'voicecraft-audio.exe' : 'voicecraft-audio'
  // Packaged installer: electron-builder extraResources next to the app.
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, exeName))
    candidates.push(path.join(process.resourcesPath, 'bin', exeName))
  }
  const roots = [
    path.join(__dirname, '..', 'audio-service', 'build'),
    path.join(__dirname, '..', '..', 'audio-service', 'build'),
    path.join(app.getAppPath(), 'audio-service', 'build'),
    path.join(__dirname, '..', 'resources', 'bin'),
  ]
  for (const root of roots) {
    candidates.push(path.join(root, 'Release', exeName))
    candidates.push(path.join(root, 'Debug', exeName))
    candidates.push(path.join(root, exeName))
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ---------- Settings persistence ----------
// Plain JSON in userData â€” synchronous reads/writes are fine for tiny files
// like this, and avoids an async dance with the renderer on every change.
const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const DEFAULT_SETTINGS = {
  // Input devices (resolved to deviceId via enumerateDevices)
  microphoneId: null,
  // Output device + master volume for remote call audio
  speakerId: null,
  outputVolume: 80,
  // DSP
  dspLevel: 'off',
  // Screen share â€” 720p/30 is enough for voice rooms and much cheaper
  screenQuality: '720p',
  screenFramerate: 30,
  screenWithAudio: false,
  callSounds: true,
  // GPU acceleration (must be applied BEFORE app.whenReady â€” see below)
  gpuAcceleration: true,
  // Performance profile â€” Auto scales; Chromium zero-copy needs restart
  perfMode: 'auto', // auto | performance | balanced | economy
  perfHud: false,
  // Last Auto tier from renderer probe â€” enables zero-copy on next launch when high
  lastPerfTier: null, // high | mid | low | null
  // UI
  startMinimized: false,
}

// Read settings synchronously at module load so we can apply switches
// (like disableHardwareAcceleration) BEFORE app.whenReady.
const earlySettings = (() => {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
})()

// GPU: if user disabled, switch Chromium off. Otherwise append extra
// switches that tune Chromium's GPU pipeline for desktop apps.
// MUST be called before app.whenReady() â€” that's why this runs at module load.
if (!earlySettings.gpuAcceleration) {
  app.disableHardwareAcceleration()
  console.log('[app] hardware acceleration disabled by user setting')
}
// GPU rasterization helps the room UI. Do NOT uncap the compositor
// (disable-frame-rate-limit / disable-gpu-vsync): the UI then paints
// at hundreds of FPS, fights screen-capture for the GPU, and the app
// stutters. Capture FPS is set by getUserMedia constraints, not vsync.
app.commandLine.appendSwitch('enable-gpu-rasterization')
// Zero-copy only on high tier (explicit Desempenho, or Auto that last probed high).
const earlyPerf = String(earlySettings.perfMode || 'auto')
const earlyTier = String(earlySettings.lastPerfTier || '')
const wantZeroCopy =
  earlyPerf === 'performance'
  || (earlyPerf === 'auto' && earlyTier === 'high')
if (wantZeroCopy && earlySettings.gpuAcceleration !== false) {
  app.commandLine.appendSwitch('enable-zero-copy')
  console.log('[app] enable-zero-copy', { perfMode: earlyPerf, lastPerfTier: earlyTier || null })
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function saveSettings(next) {
  try {
    const merged = { ...loadSettings(), ...next }
    fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2))
    return merged
  } catch (err) {
    console.error('[settings] save failed:', err)
    return null
  }
}

// ---------- File logging ----------
// Writes to both the DevTools console and a rolling file in userData.
// Useful for debugging audio issues after the fact.
const logPath = path.join(app.getPath('userData'), 'voicecraft.log')
function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
  try { fs.appendFileSync(logPath, line) } catch {}
  if (level === 'error') console.error(msg)
  else console.log(msg)
}

// Expose for the renderer so it can request a flush before crash reports.
ipcMain.handle('app:log', (_e, level, msg) => log(level, msg))

/**
 * Fetch a Firebase Storage image in the main process (no browser CORS).
 * Renderer passes the download URL + optional Firebase ID token.
 */
ipcMain.handle('net:fetch-storage-image', async (_e, payload = {}) => {
  const url = typeof payload.url === 'string' ? payload.url.trim() : ''
  const idToken = typeof payload.idToken === 'string' ? payload.idToken : ''
  if (!/^https:\/\//i.test(url)) throw new Error('URL invÃ¡lida')
  let host
  try { host = new URL(url).hostname } catch { throw new Error('URL invÃ¡lida') }
  const allowed = host === 'firebasestorage.googleapis.com'
    || host === 'storage.googleapis.com'
    || host.endsWith('.firebasestorage.app')
  if (!allowed) throw new Error('Host nÃ£o permitido')

  const headers = { Accept: 'image/*,*/*' }
  if (idToken) headers.Authorization = `Firebase ${idToken}`

  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`Falha ao baixar imagem (${res.status})`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  return {
    contentType: res.headers.get('content-type') || 'image/jpeg',
    base64: buf.toString('base64'),
  }
})

ipcMain.handle('settings:get', () => loadSettings())
ipcMain.handle('settings:set', (_e, patch) => saveSettings(patch || {}))

ipcMain.handle('system:get-gpu-info', async () => {
  // 'complete' can block the main process for seconds (window drag/minimize die).
  // Prefer basic; optionally enrich with a short complete timeout.
  try {
    const basic = await app.getGPUInfo('basic')
    const complete = await Promise.race([
      app.getGPUInfo('complete').catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 900)),
    ])
    return { ok: true, info: complete || basic }
  } catch (err) {
    try {
      const info = await app.getGPUInfo('basic')
      return { ok: true, info }
    } catch (err2) {
      return { ok: false, error: err2?.message || err?.message || 'gpu info failed' }
    }
  }
})

/** Light snapshot for perf HUD / hardware probe â€” never blocks on complete GPU info. */
ipcMain.handle('system:perf-snapshot', async () => {
  try {
    const memory = await process.getProcessMemoryInfo()
    let gpuFeatureStatus = null
    try {
      gpuFeatureStatus = app.getGPUFeatureStatus?.() || null
    } catch { /* ignore */ }
    let heap = null
    try {
      heap = process.getHeapStatistics?.() || null
    } catch { /* ignore */ }
    return {
      ok: true,
      memory,
      heap,
      gpuFeatureStatus,
      pid: process.pid,
      at: Date.now(),
    }
  } catch (err) {
    return { ok: false, error: err?.message || 'perf snapshot failed' }
  }
})

ipcMain.handle('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
  return { ok: true }
})
ipcMain.handle('window:maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return { maximized: false }
  if (mainWindow.isMaximized()) mainWindow.unmaximize()
  else mainWindow.maximize()
  return { maximized: mainWindow.isMaximized() }
})
ipcMain.handle('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
  return { ok: true }
})
ipcMain.handle('window:is-maximized', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  return mainWindow.isMaximized()
})

// ---------- System info IPC ----------
ipcMain.handle('get-local-ip', () => {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
})

ipcMain.handle('get-hostname', () => os.hostname())

ipcMain.handle('app:get-paths', () => ({
  userData: app.getPath('userData'),
  log: logPath,
}))

// ---------- Audio service (C++ child process) ----------
const AUDIO_PROTOCOL_VERSION = 2
const AUDIO_FRAME_MAGIC = 0x32414356
const REQUIRED_AUDIO_CAPABILITIES = new Set([
  'process-loopback-strict',
  'system-loopback-exclude-process-tree',
  'session-tagged-ipc',
  'source-tagged-frames-v2',
  'serialized-loopback',
])
let audioServiceReadyPromise = null
let audioServiceHandshake = null
let activeLoopbackSession = null
let loopbackOperation = Promise.resolve()
const pendingLoopbackWaiters = new Map()

function sendAudioStatus(msg) {
  const wc = mainWindow?.webContents
  if (wc && !wc.isDestroyed()) {
    try { wc.send('audio:status', msg) } catch {}
  }
}

function rejectAudioHandshake(message) {
  if (!audioServiceHandshake) return
  const { reject, timer } = audioServiceHandshake
  audioServiceHandshake = null
  clearTimeout(timer)
  reject(new Error(message))
}

function acceptAudioHandshake(msg) {
  if (!audioServiceHandshake || msg?.type !== 'service-started') return
  const capabilities = new Set(Array.isArray(msg.capabilities) ? msg.capabilities : [])
  const missing = [...REQUIRED_AUDIO_CAPABILITIES].filter((cap) => !capabilities.has(cap))
  if (msg.protocolVersion !== AUDIO_PROTOCOL_VERSION || missing.length) {
    rejectAudioHandshake(
      msg.protocolVersion !== AUDIO_PROTOCOL_VERSION
        ? 'audio-service-protocol-incompatible'
        : ('audio-service-missing-capabilities:' + missing.join(',')),
    )
    try { audioServiceProc?.kill() } catch {}
    return
  }
  const { resolve, timer } = audioServiceHandshake
  audioServiceHandshake = null
  clearTimeout(timer)
  resolve({ ok: true, protocolVersion: msg.protocolVersion, version: msg.version, capabilities: [...capabilities] })
}

function settleLoopbackWaiter(msg) {
  const sessionId = msg?.sessionId
  if (!sessionId) return
  const waiter = pendingLoopbackWaiters.get(sessionId)
  if (!waiter) return
  if (msg.type !== 'loopback-started' && msg.type !== 'loopback-stopped' && msg.type !== 'error') return
  pendingLoopbackWaiters.delete(sessionId)
  clearTimeout(waiter.timer)
  waiter.resolve(msg)
}

function startAudioService() {
  if (audioServiceReadyPromise) return audioServiceReadyPromise
  const bin = resolveAudioServiceBinary()
  if (!bin) return Promise.resolve({ ok: false, error: 'audio-service-binary-not-found' })
  const wc = mainWindow?.webContents
  if (!wc || wc.isDestroyed()) return Promise.resolve({ ok: false, error: 'renderer-unavailable' })

  audioServiceReadyPromise = new Promise((outerResolve) => {
    try {
      audioServiceProc = require('child_process').spawn(bin, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    } catch (err) {
      audioServiceProc = null
      outerResolve({ ok: false, error: err?.message || String(err) })
      return
    }

    let stdout = Buffer.alloc(0)
    let stderr = ''
    audioServiceProc.stdout.on('data', (chunk) => {
      stdout = Buffer.concat([stdout, chunk])
      while (stdout.length >= 12) {
        const magic = stdout.readUInt32LE(0)
        if (magic !== AUDIO_FRAME_MAGIC) {
          rejectAudioHandshake('audio-service-frame-protocol-incompatible')
          try { audioServiceProc?.kill() } catch {}
          return
        }
        const source = stdout.readUInt32LE(4)
        const frames = stdout.readUInt32LE(8)
        if (frames > 480000) {
          rejectAudioHandshake('audio-service-frame-too-large')
          try { audioServiceProc?.kill() } catch {}
          return
        }
        const bytes = frames * 4
        if (stdout.length < 12 + bytes) break
        const payload = stdout.subarray(12, 12 + bytes)
        stdout = stdout.subarray(12 + bytes)
        const type = source === 2 ? 'loopback' : source === 1 ? 'mic' : 'unknown'
        if (type === 'unknown') continue
        const target = mainWindow?.webContents
        if (target && !target.isDestroyed()) {
          try {
            target.send('audio:frame', {
              type,
              sessionId: type === 'loopback' ? activeLoopbackSession?.sessionId || null : null,
              sampleRate: 48000,
              channels: 1,
              frames,
              payload,
            })
          } catch {}
        }
      }
    })

    audioServiceProc.stderr.on('data', (data) => {
      stderr += data.toString()
      const lines = stderr.split(/\r?\n/)
      stderr = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          acceptAudioHandshake(msg)
          settleLoopbackWaiter(msg)
          if (msg.type === 'loopback-stopped' && activeLoopbackSession?.sessionId === msg.sessionId) {
            activeLoopbackSession = null
          }
          sendAudioStatus(msg)
        } catch {}
      }
    })

    audioServiceProc.once('exit', (code, signal) => {
      rejectAudioHandshake('audio-service-exited-before-handshake')
      for (const [id, waiter] of pendingLoopbackWaiters) {
        clearTimeout(waiter.timer)
        waiter.resolve({ type: 'error', sessionId: id, message: 'audio-service-exited' })
      }
      pendingLoopbackWaiters.clear()
      activeLoopbackSession = null
      audioServiceProc = null
      audioServiceReadyPromise = null
      sendAudioStatus({ type: 'exited', code, signal })
    })

    wc.once('destroyed', stopAudioService)
    const timer = setTimeout(() => rejectAudioHandshake('audio-service-handshake-timeout'), 5000)
    audioServiceHandshake = {
      timer,
      resolve: (info) => {
        sendAudioCommand({ type: 'list-devices' })
        outerResolve(info)
      },
      reject: (err) => outerResolve({ ok: false, error: err.message }),
    }
    sendAudioCommand({ type: 'capabilities' })
  })
  return audioServiceReadyPromise
}

function stopAudioService() {
  const proc = audioServiceProc
  audioServiceProc = null
  audioServiceReadyPromise = null
  activeLoopbackSession = null
  rejectAudioHandshake('audio-service-stopped')
  if (!proc) return
  try { proc.stdin?.write(JSON.stringify({ type: 'shutdown' }) + '\n') } catch {}
  try { proc.kill() } catch {}
}

function sendAudioCommand(obj) {
  if (!audioServiceProc?.stdin || audioServiceProc.stdin.writable === false) return false
  try {
    audioServiceProc.stdin.write(JSON.stringify(obj) + '\n')
    return true
  } catch {
    return false
  }
}

function waitForLoopbackEvent(sessionId, timeoutMs = 9000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingLoopbackWaiters.delete(sessionId)
      resolve({ type: 'error', sessionId, message: 'loopback-response-timeout' })
    }, timeoutMs)
    pendingLoopbackWaiters.set(sessionId, { resolve, timer })
  })
}

function serializeLoopback(operation) {
  const result = loopbackOperation.then(operation, operation)
  loopbackOperation = result.catch(() => {})
  return result
}

async function startNativeLoopback(kind, processId) {
  return serializeLoopback(async () => {
    if (!Number.isInteger(processId) || processId <= 0) return { ok: false, error: 'pid-not-found' }
    if (activeLoopbackSession) return { ok: false, error: 'loopback-session-busy' }
    const ready = await startAudioService()
    if (!ready?.ok) return ready
    const sessionId = require('crypto').randomUUID()
    const pending = waitForLoopbackEvent(sessionId)
    const command = kind === 'system'
      ? { type: 'start-loopback-system', excludedProcessId: processId, sessionId }
      : { type: 'start-loopback', processId, sessionId }
    activeLoopbackSession = { sessionId, kind, processId, mode: 'starting', sampleRate: 48000, channels: 1, startedAt: Date.now() }
    if (!sendAudioCommand(command)) {
      activeLoopbackSession = null
      return { ok: false, error: 'audio-service-command-failed' }
    }
    const msg = await pending
    if (msg.type !== 'loopback-started') {
      activeLoopbackSession = null
      return { ok: false, error: msg.message || 'loopback-start-failed' }
    }
    activeLoopbackSession = {
      ...activeLoopbackSession,
      mode: msg.mode,
      sampleRate: msg.sampleRate || 48000,
      channels: msg.channels || 1,
    }
    return { ok: true, ...activeLoopbackSession }
  })
}

ipcMain.handle('audio-service:start', () => startAudioService())
ipcMain.handle('audio-service:stop', () => { stopAudioService(); return { ok: true } })
ipcMain.handle('audio-service:available', () => ({ available: !!resolveAudioServiceBinary(), protocolVersion: AUDIO_PROTOCOL_VERSION }))
ipcMain.handle('audio-service:send', async (_e, obj) => {
  const ready = await startAudioService()
  if (!ready?.ok) return ready
  return { ok: sendAudioCommand(obj) }
})

/** Low-level / shell processes users never want for app audio capture. */
const PROCESS_DENY = new Set([
  'system', 'idle', 'registry', 'secure system', 'memory compression',
  'smss', 'csrss', 'wininit', 'services', 'lsass', 'svchost', 'fontdrvhost',
  'dwm', 'conhost', 'dllhost', 'sihost', 'taskhostw', 'runtimebroker',
  'searchhost', 'shellexperiencehost', 'startmenuexperiencehost',
  'textinputhost', 'applicationframehost', 'systemsettings',
  'securityhealthservice', 'securityhealthsystray', 'widgetservice',
  'widgets', 'crossdeviceresume', 'backgroundtaskhost', 'wudfhost',
  'spoolsv', 'dashost', 'audiodg', 'lsm', 'winlogon', 'userinit',
  'explorer', // shell â€” raramente Ãºtil pra capturar Ã¡udio
])

/**
 * List processes useful for WASAPI-by-PID capture.
 * Prefer apps with a visible main window (what users actually have open).
 */
function listAudioCapableProcesses() {
  return new Promise((resolve) => {
    const cp = require('child_process')
    const selfPid = process.pid
    const fallback = [{ pid: selfPid, name: 'Voice', title: 'Voice', hasWindow: true, icon: '' }]

    if (process.platform !== 'win32') {
      resolve(fallback)
      return
    }

    const ps = [
      'Get-Process |',
      'Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |',
      'Select-Object Id, ProcessName, MainWindowTitle |',
      'ConvertTo-Json -Compress',
    ].join(' ')

    const timer = setTimeout(() => resolve(fallback), 3500)

    cp.execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (err, stdout) => {
        clearTimeout(timer)
        if (err || !stdout || !String(stdout).trim()) {
          listProcessesViaTasklistFiltered().then(resolve).catch(() => resolve(fallback))
          return
        }
        try {
          let rows = JSON.parse(String(stdout).trim())
          if (!Array.isArray(rows)) rows = rows ? [rows] : []
          const seen = new Set()
          const list = []
          for (const row of rows) {
            const pid = Number(row.Id)
            const name = String(row.ProcessName || '').trim()
            const title = String(row.MainWindowTitle || '').trim()
            if (!pid || pid === selfPid || !name || !title) continue
            if (PROCESS_DENY.has(name.toLowerCase())) continue
            if (seen.has(pid)) continue
            seen.add(pid)
            list.push({
              pid,
              name,
              title,
              hasWindow: true,
              icon: '',
            })
          }
          list.sort((a, b) => String(a.title).localeCompare(String(b.title), 'pt'))
          if (list.length > 0) resolve(list)
          else listProcessesViaTasklistFiltered().then(resolve).catch(() => resolve(fallback))
        } catch {
          listProcessesViaTasklistFiltered().then(resolve).catch(() => resolve(fallback))
        }
      },
    )
  })
}

/** Fallback: tasklist minus obvious system processes (still noisy). */
function listProcessesViaTasklistFiltered() {
  return new Promise((resolve) => {
    const cp = require('child_process')
    const selfPid = process.pid
    cp.execFile(
      'tasklist',
      ['/FO', 'CSV', '/NH'],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          return resolve([{ pid: selfPid, name: 'Voice', title: 'Voice', hasWindow: true, icon: '' }])
        }
        const seen = new Set()
        const list = []
        for (const line of String(stdout).split(/\r?\n/)) {
          if (!line.trim()) continue
          const parts = line.split('","').map((s) => s.replace(/^"|"$/g, ''))
          if (parts.length < 2) continue
          const rawName = parts[0]
          const name = rawName.replace(/\.exe$/i, '')
          const pid = parseInt(parts[1], 10)
          if (!pid || pid === selfPid || seen.has(pid)) continue
          if (PROCESS_DENY.has(name.toLowerCase())) continue
          // Skip bare system-ish names and services without a friendly face
          if (/^svc/i.test(name) || name.toLowerCase() === 'system') continue
          seen.add(pid)
          list.push({ pid, name, title: name, hasWindow: false, icon: '' })
        }
        list.sort((a, b) => String(a.title).localeCompare(String(b.title), 'pt'))
        resolve(list)
      },
    )
  })
}

ipcMain.handle('audio-service:list-processes', async () => listAudioCapableProcesses())
ipcMain.handle('audio-service:start-loopback', (_e, payload = {}) => (
  startNativeLoopback('app', Number(payload.processId))
))
ipcMain.handle('audio-service:start-loopback-system', () => (
  startNativeLoopback('system', process.pid)
))
ipcMain.handle('audio-service:stop-loopback', (_e, payload = {}) => serializeLoopback(async () => {
  const sessionId = payload.sessionId
  if (!sessionId || activeLoopbackSession?.sessionId !== sessionId) {
    return { ok: false, error: 'unknown-session' }
  }
  const pending = waitForLoopbackEvent(sessionId, 4000)
  if (!sendAudioCommand({ type: 'stop-loopback', sessionId })) {
    activeLoopbackSession = null
    return { ok: false, error: 'audio-service-command-failed' }
  }
  const msg = await pending
  activeLoopbackSession = null
  return msg.type === 'loopback-stopped'
    ? { ok: true }
    : { ok: false, error: msg.message || 'loopback-stop-failed' }
}))

app.on('before-quit', () => stopAudioService())

// ---------- Google OAuth via the system browser ----------
const OAUTH_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

let oauthServer = null

function oauthSend(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  })
  res.end(body)
}

function oauthReadJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 32_000) {
        reject(new Error('payload too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) }
      catch (err) { reject(err) }
    })
    req.on('error', reject)
  })
}

function oauthServeDist(req, res, distDir) {
  const url = new URL(req.url, 'http://localhost')
  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = path.normalize(path.join(distDir, rel))
  if (!file.startsWith(path.normalize(distDir))) {
    oauthSend(res, 403, 'forbidden')
    return
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(distDir, 'index.html'), (fallbackErr, html) => {
        if (fallbackErr) oauthSend(res, 404, 'not found')
        else oauthSend(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' })
      })
      return
    }
    oauthSend(res, 200, data, { 'Content-Type': OAUTH_MIME[path.extname(file)] || 'application/octet-stream' })
  })
}

function ensureOAuthServer({ onResult, distDir }) {
  if (oauthServer) return Promise.resolve(oauthServer.address().port)
  return new Promise((resolve, reject) => {
    const next = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost')
      if (req.method === 'OPTIONS') {
        oauthSend(res, 204, '')
        return
      }
      if (url.pathname === '/oauth/done') {
        try {
          const payload = req.method === 'POST'
            ? await oauthReadJson(req)
            : {
                idToken: url.searchParams.get('idToken'),
                error: url.searchParams.get('error'),
                code: url.searchParams.get('code'),
              }
          onResult(payload)
          if (req.method === 'GET') {
            oauthSend(res, 200, '<!doctype html><meta charset="utf-8"><title>Voice</title><body style="margin:0;background:#07080c;color:#f6f7f9;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;height:100vh"><p>Pode voltar ao Voice.</p></body>', { 'Content-Type': 'text/html; charset=utf-8' })
          } else {
            oauthSend(res, 200, JSON.stringify({ ok: true }), { 'Content-Type': 'application/json' })
          }
        } catch {
          oauthSend(res, 400, JSON.stringify({ ok: false }), { 'Content-Type': 'application/json' })
        }
        return
      }
      if (distDir) oauthServeDist(req, res, distDir)
      else oauthSend(res, 404, 'not found')
    })
    next.once('error', reject)
    next.listen(0, '127.0.0.1', () => {
      oauthServer = next
      resolve(next.address().port)
    })
  })
}

function stopOAuthServer() {
  if (!oauthServer) return
  try { oauthServer.close() } catch { /* already closed */ }
  oauthServer = null
}

async function startGoogleAuth({ onResult, devServerUrl, distDir }) {
  const port = await ensureOAuthServer({ onResult, distDir: devServerUrl ? null : distDir })
  const callback = `http://127.0.0.1:${port}/oauth/done`
  const origin = (devServerUrl || `http://127.0.0.1:${port}`).replace(/\/$/, '')
  const url = `${origin}/?vcAuth=google&cb=${encodeURIComponent(callback)}`
  await shell.openExternal(url)
  return { ok: true, port }
}

function notifyGoogleAuth(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    const wc = mainWindow.webContents
    if (wc && !wc.isDestroyed()) {
      try { wc.send('auth:google-result', payload) } catch {}
    }
  }
}

ipcMain.handle('auth:google-start', async () => {
  return startGoogleAuth({
    onResult: notifyGoogleAuth,
    devServerUrl: process.env.VITE_DEV_SERVER_URL || null,
    distDir: path.join(app.getAppPath(), 'dist'),
  })
})

ipcMain.handle('auth:google-cancel', () => {
  stopOAuthServer()
  return { ok: true }
})

ipcMain.handle('livekit:token', async (_event, payload = {}) => {
  try {
    const result = await mintLiveKitToken({
      spaceId: payload.spaceId || null,
      roomId: payload.roomId || null,
      identity: payload.identity || null,
      displayName: payload.displayName || null,
    })
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

ipcMain.handle('desktop-capturer:get-sources', async (_event, opts) => {
  const sources = await desktopCapturer.getSources({
    types: opts?.types || ['screen', 'window'],
    thumbnailSize: opts?.thumbnailSize || { width: 160, height: 90 },
    fetchWindowIcons: false,
  })
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    isScreen: s.id.startsWith('screen:'),
    thumbnail: s.thumbnail?.toDataURL?.() || null,
  }))
})

// Phase 7 â€” `restrictOwnAudio` support (Electron 44+ / Chromium 132+).
// When the renderer calls `getDisplayMedia({ audio: { restrictOwnAudio: true } })`,
// this handler gives Chromium explicit consent to capture the system loopback
// AND the renderer-side constraint filters out audio produced by Voice
// itself, preventing echo loops back into the call.
//
// NOTE: Electron 44+ throws "Session can only be received when app is ready"
// if you touch `session.defaultSession` before app.whenReady(). We register
// the handler inside `app.whenReady()` below instead of here.

// ---------- Signaling server (in-process dynamic import) ----------
async function startSignalingServer() {
  try {
    const serverPath = path.join(__dirname, '..', 'server', 'signaling-server.mjs')
    const serverUrl = pathToFileURL(serverPath).href
    log('info', '[signaling] importing ' + serverUrl)
    await import(serverUrl)
    log('info', '[signaling] started')
  } catch (err) {
    log('error', '[signaling] failed: ' + (err?.message || err))
  }
}

function resolveAppIcon() {
  const candidates = [
    // Packaged: copied next to the exe via extraResources (outside asar â€” Windows needs this for taskbar).
    process.resourcesPath ? path.join(process.resourcesPath, 'icon.ico') : null,
    path.join(__dirname, '..', 'public', 'icon.ico'),
    path.join(__dirname, '..', 'dist', 'icon.ico'),
    path.join(app.getAppPath(), 'dist', 'icon.ico'),
    path.join(app.getAppPath(), 'public', 'icon.ico'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return undefined
}

function resolveWindowIconPng() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'app-icon.png') : null,
    path.join(__dirname, '..', 'public', 'app-icon.png'),
    path.join(__dirname, '..', 'dist', 'app-icon.png'),
    path.join(app.getAppPath(), 'dist', 'app-icon.png'),
    path.join(__dirname, '..', 'public', 'brand', 'app-icon', 'voice-app-icon-256.png'),
    path.join(app.getAppPath(), 'dist', 'brand', 'app-icon', 'voice-app-icon-256.png'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return null
}

/** Windows taskbar uses AppUserModelId + app details â€” setIcon alone is not enough. */
function applyWindowsTaskbarIcon(win, icoPath, pngPath) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return
  try {
    win.setAppDetails({
      appId: 'com.voicecraft.app',
      relaunchDisplayName: 'Voice',
      ...(icoPath ? { appIconPath: icoPath, appIconIndex: 0 } : {}),
    })
  } catch {}
  const trySet = (filePath) => {
    if (!filePath) return false
    try {
      const img = nativeImage.createFromPath(filePath)
      if (img.isEmpty()) return false
      win.setIcon(img)
      return true
    } catch {
      return false
    }
  }
  if (!trySet(pngPath)) trySet(icoPath)
}

function resolveTrayPng() {
  const candidates = [
    path.join(__dirname, '..', 'public', 'brand', 'app-icon', 'voice-app-icon-32.png'),
    path.join(__dirname, '..', 'dist', 'brand', 'app-icon', 'voice-app-icon-32.png'),
    path.join(app.getAppPath(), 'dist', 'brand', 'app-icon', 'voice-app-icon-32.png'),
    path.join(__dirname, '..', 'public', 'favicon.png'),
    path.join(__dirname, '..', 'dist', 'favicon.png'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return null
}

// ---------- Window ----------
function createWindow() {
  const settings = loadSettings()
  // In `npm run dev`, always show the window. startMinimized + detached
  // DevTools looks like "only DevTools opened" because the app stays hidden.
  const startHidden = !isDev && !!settings.startMinimized
  const appIcon = resolveAppIcon()
  const appIconPng = resolveWindowIconPng()
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    backgroundColor: '#071225',
    show: !startHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // Presence / signaling websockets must keep ticking while unfocused.
      backgroundThrottling: false,
    },
    frame: false,
    title: 'Voice',
    autoHideMenuBar: true,
    ...(appIcon ? { icon: appIcon } : {}),
  })

  // Telemetria: marca o instante em que a BrowserWindow foi instanciada.
  try {
    const { performance } = require('node:perf_hooks')
    performance.mark('voice:window-created')
  } catch {}

  applyWindowsTaskbarIcon(mainWindow, appIcon, appIconPng)

  // Portuguese spellcheck (+ English fallback). Suggestions via right-click.
  try {
    const sess = mainWindow.webContents.session
    const wanted = ['pt-BR', 'en-US']
    const available = typeof sess.availableSpellCheckerLanguages === 'object'
      ? sess.availableSpellCheckerLanguages
      : []
    const langs = wanted.filter((l) => !available.length || available.includes(l))
    if (langs.length) sess.setSpellCheckerLanguages(langs)
    else sess.setSpellCheckerLanguages(['en-US'])
  } catch (err) {
    console.warn('[spellcheck] languages', err?.message || err)
  }

  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const items = []
    if (params.misspelledWord) {
      for (const suggestion of (params.dictionarySuggestions || []).slice(0, 6)) {
        items.push({
          label: suggestion,
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.replaceMisspelling(suggestion)
            }
          },
        })
      }
      if (items.length) items.push({ type: 'separator' })
      items.push({
        label: 'Adicionar ao dicionÃ¡rio',
        click: () => {
          try {
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
          } catch { /* ignore */ }
        },
      })
      items.push({ type: 'separator' })
    }
    if (params.isEditable) {
      items.push(
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar', enabled: params.editFlags?.canCut !== false },
        { role: 'copy', label: 'Copiar', enabled: params.editFlags?.canCopy !== false },
        { role: 'paste', label: 'Colar', enabled: params.editFlags?.canPaste !== false },
        { role: 'selectAll', label: 'Selecionar tudo' },
      )
    } else if (params.selectionText) {
      items.push({ role: 'copy', label: 'Copiar' })
    }
    if (!items.length) return
    Menu.buildFromTemplate(items).popup({ window: mainWindow })
  })

  // No File / Edit / View menu â€” custom title bar owns chrome.
  Menu.setApplicationMenu(null)

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // Open after load so DevTools doesn't race the protocol (Autofill.enable
    // / setAddresses -32601 is Chromium noise, not our code).
    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.openDevTools({ mode: 'detach' })
        }
      }
    })
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  // Never navigate the app window to an image/file URL (e.g. a broken
  // <a download> on Firebase). Keep the SPA alive and open externals outside.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) ||
      url.startsWith('file://')
    if (!allowed) {
      event.preventDefault()
      shell.openExternal(url).catch(() => {})
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })

  // Packaged: hide to tray. Dev: actually quit so the next `npm run` is
  // not blocked by a zombie process holding Cache/GPUCache.
  mainWindow.on('close', (e) => {
    if (isDev) {
      app.isQuiting = true
      return
    }
    if (!app.isQuiting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  const emitMaximized = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('window:maximized', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', emitMaximized)
  mainWindow.on('unmaximize', emitMaximized)
}

// ---------- System tray ----------
function buildTrayIcon() {
  const pngPath = resolveTrayPng()
  if (pngPath) {
    const img = nativeImage.createFromPath(pngPath)
    if (!img.isEmpty()) {
      return process.platform === 'win32' ? img.resize({ width: 16, height: 16 }) : img
    }
  }
  const png = nativeImage.createFromBuffer(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOUlEQVR42mNk+M9QzwAEjDAGABCRAv8HfwdQYg4GjcUB0QYGBiDRA0mDiIMYBoDkH8X/BxAaaAaj+gIAAEUYBXsfvRdGAAAAAElFTkSuQmCC',
    'base64'))
  return png.isEmpty() ? nativeImage.createEmpty() : png
}

function createTray() {
  if (tray) return
  tray = new Tray(buildTrayIcon())
  tray.setToolTip('Voice')
  rebuildTrayMenu()
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })
}

function rebuildTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: mainWindow?.isVisible() ? 'Ocultar' : 'Mostrar', click: () => {
      if (!mainWindow) return
      if (mainWindow.isVisible()) mainWindow.hide()
      else mainWindow.show()
    }},
    { type: 'separator' },
    { label: 'Sair do Voice', click: () => {
      app.isQuiting = true
      app.quit()
    }},
  ])
  tray.setContextMenu(menu)
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture' || permission === 'fullscreen')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'display-capture' || permission === 'fullscreen'
  })

  // Desktop capture is intentionally video-only. Shared audio is supplied only
  // by the protocol-v2 native helper after non-silence validation.
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    callback({ video: {} })
  })

  // Realtime now lives on Firebase. The old WS signaling server is leftover
  // and must not bind :5185 here â€” a second instance would crash the app
  // with EADDRINUSE.
  createWindow()
  createTray()
  setupUpdater(() => mainWindow)

  // Re-build the tray menu whenever the window visibility flips.
  if (mainWindow) {
    mainWindow.on('show', rebuildTrayMenu)
    mainWindow.on('hide', rebuildTrayMenu)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// On quit, drop the tray icon so it doesn't linger in the system tray.
app.on('before-quit', () => {
  app.isQuiting = true
  stopOAuthServer()
  if (tray) { tray.destroy(); tray = null }
})

log('info', `[app] Voice started (userData=${app.getPath('userData')})`)
