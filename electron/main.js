const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, shell, session } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const { pathToFileURL } = require('url')

let mainWindow
let tray = null
let audioServiceProc = null

const isDev = !app.isPackaged

// ---------- LiveKit token minting (inlined — Vite won't ship sibling requires in asar) ----------
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
        && !parsed.apiSecret.includes('•')) {
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
      'LiveKit não configurado. Salve URL, API Key e Secret em %APPDATA%\\voicecraft\\livekit-keys.txt',
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

// ---------- Auto-update (electron-updater + GitHub Releases) ----------
// Inlined so Vite's single-file main bundle does not `require('./updater')`
// at runtime (that path does not exist under dist-electron/).
let updaterWired = false
let autoUpdaterRef = null
/** Last status pushed to the renderer — replayed when the UI mounts late (login). */
let lastUpdaterStatus = null

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

function setupUpdater(getMainWindow) {
  if (updaterWired) return
  updaterWired = true

  ipcMain.handle('updater:get-version', () => app.getVersion())
  ipcMain.handle('updater:get-status', () => lastUpdaterStatus)
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, error: 'Atualizações só funcionam no app instalado.' }
    }
    try {
      const result = await getAutoUpdater().checkForUpdates()
      return { ok: true, updateInfo: result?.updateInfo || null }
    } catch (err) {
      return { ok: false, error: err?.message || String(err) }
    }
  })
  ipcMain.handle('updater:install', () => {
    if (!app.isPackaged) return { ok: false, error: 'dev' }
    setImmediate(() => getAutoUpdater().quitAndInstall(false, true))
    return { ok: true }
  })

  if (!app.isPackaged) return

  const updater = getAutoUpdater()
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  updater.logger = null

  updater.on('checking-for-update', () => {
    sendUpdater(getMainWindow, 'updater:status', { status: 'checking' })
  })
  updater.on('update-available', (info) => {
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'available',
      version: info?.version || null,
    })
  })
  updater.on('update-not-available', (info) => {
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'not-available',
      version: info?.version || app.getVersion(),
    })
  })
  updater.on('download-progress', (p) => {
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'downloading',
      percent: typeof p?.percent === 'number' ? p.percent : 0,
    })
  })
  updater.on('update-downloaded', (info) => {
    sendUpdater(getMainWindow, 'updater:status', {
      status: 'downloaded',
      version: info?.version || null,
    })
  })
  updater.on('error', (err) => {
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
    if (s === 'available' || s === 'downloading' || s === 'downloaded') {
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

// Dev and the installed app must not share Cache/GPUCache — a leftover
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
// minimized — Chromium otherwise throttles timers and can stall presence.
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
// Prefer system DNS on Windows — Chromium AsyncDns often fails to resolve
// LiveKit media hosts (ip-*.host.livekit.cloud → ERR_NAME_NOT_RESOLVED / -105).
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
  // Prefer the Chromium switch only — setPath('cache') nested userData on Win.
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir)
  // Shader disk cache is what throws gpu_disk_cache.cc — GPU still works,
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
  const roots = [
    path.join(__dirname, '..', 'audio-service', 'build'),
    path.join(__dirname, '..', '..', 'audio-service', 'build'),
    path.join(app.getAppPath(), 'audio-service', 'build'),
  ]
  for (const root of roots) {
    candidates.push(path.join(root, 'Release', process.platform === 'win32' ? 'voicecraft-audio.exe' : 'voicecraft-audio'))
    candidates.push(path.join(root, 'Debug', process.platform === 'win32' ? 'voicecraft-audio.exe' : 'voicecraft-audio'))
    candidates.push(path.join(root, process.platform === 'win32' ? 'voicecraft-audio.exe' : 'voicecraft-audio'))
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

// ---------- Settings persistence ----------
// Plain JSON in userData — synchronous reads/writes are fine for tiny files
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
  // Screen share — 720p/30 is enough for voice rooms and much cheaper
  screenQuality: '720p',
  screenFramerate: 30,
  screenWithAudio: false,
  callSounds: true,
  // GPU acceleration (must be applied BEFORE app.whenReady — see below)
  gpuAcceleration: true,
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
// MUST be called before app.whenReady() — that's why this runs at module load.
if (!earlySettings.gpuAcceleration) {
  app.disableHardwareAcceleration()
  console.log('[app] hardware acceleration disabled by user setting')
}
// GPU rasterization helps the room UI. Do NOT uncap the compositor
// (disable-frame-rate-limit / disable-gpu-vsync): the UI then paints
// at hundreds of FPS, fights screen-capture for the GPU, and the app
// stutters. Capture FPS is set by getUserMedia constraints, not vsync.
app.commandLine.appendSwitch('enable-gpu-rasterization')
// Avoid enable-zero-copy by default — it can raise GPU/RAM pressure on weak PCs.

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
  if (!/^https:\/\//i.test(url)) throw new Error('URL inválida')
  let host
  try { host = new URL(url).hostname } catch { throw new Error('URL inválida') }
  const allowed = host === 'firebasestorage.googleapis.com'
    || host === 'storage.googleapis.com'
    || host.endsWith('.firebasestorage.app')
  if (!allowed) throw new Error('Host não permitido')

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
  try {
    const info = await app.getGPUInfo('complete')
    return { ok: true, info }
  } catch (err) {
    try {
      const info = await app.getGPUInfo('basic')
      return { ok: true, info }
    } catch (err2) {
      return { ok: false, error: err2?.message || err?.message || 'gpu info failed' }
    }
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
// Spawns the C++ audio service, pipes float32 PCM frames from stdout to the
// renderer via IPC, and listens for commands/status on stdin/stderr.
function startAudioService() {
  if (audioServiceProc) return { ok: true, alreadyRunning: true }
  const bin = resolveAudioServiceBinary()
  if (!bin) return { ok: false, error: 'binário não encontrado — compile audio-service primeiro (ver audio-service/README.md)' }

  try {
    audioServiceProc = require('child_process').spawn(bin, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
  } catch (err) {
    audioServiceProc = null
    return { ok: false, error: String(err?.message || err) }
  }

  // Stop the service if the renderer's webContents is gone or being torn down,
  // so we don't accumulate frames in a queue that will be flushed to a
  // disposed frame (which is what triggers "Render frame was disposed").
  const wc = mainWindow && mainWindow.webContents
  if (!wc || wc.isDestroyed()) {
    stopAudioService()
    return { ok: false, error: 'webContents indisponível ou destruído' }
  }
  wc.once('destroyed', () => {
    log('info', '[audio] renderer destroyed, stopping service')
    stopAudioService()
  })

  let leftover = Buffer.alloc(0)

  audioServiceProc.stdout.on('data', (chunk) => {
    leftover = Buffer.concat([leftover, chunk])
    // Frames: [uint32 LE size_in_samples][size * float32 samples]
    while (leftover.length >= 4) {
      const frames = leftover.readUInt32LE(0)
      const bytes = frames * 4
      if (leftover.length < 4 + bytes) break
      const payload = leftover.subarray(4, 4 + bytes)
      leftover = leftover.subarray(4 + bytes)
      // Render frames can be disposed mid-reload — guard the IPC send so
      // the main process doesn't spam the console with "Render frame was
      // disposed" errors during HMR.
      if (mainWindow && !mainWindow.isDestroyed()) {
        const wc = mainWindow.webContents
        if (wc && !wc.isDestroyed()) {
          try {
            wc.send('audio:frame', { type: 'mic', payload })
          } catch (err) {
            // Swallow — renderer just disposed, nothing to do.
          }
        }
      }
    }
  })

  audioServiceProc.stderr.on('data', (data) => {
    for (const line of data.toString().split(/\r?\n/)) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        if (mainWindow && !mainWindow.isDestroyed()) {
          const wc = mainWindow.webContents
          if (wc && !wc.isDestroyed()) {
            try { wc.send('audio:status', msg) } catch {}
          }
        }
      } catch {
        // Ignore non-JSON lines
      }
    }
  })

  audioServiceProc.on('exit', (code, signal) => {
    audioServiceProc = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      const wc = mainWindow.webContents
      if (wc && !wc.isDestroyed()) {
        try { wc.send('audio:status', { type: 'exited', code, signal }) } catch {}
      }
    }
  })

  // Initial command: list devices (renderer will react and start capture).
  sendAudioCommand({ type: 'list-devices' })

  return { ok: true }
}

function stopAudioService() {
  if (!audioServiceProc) return
  try { sendAudioCommand({ type: 'shutdown' }) } catch {}
  try { audioServiceProc.kill() } catch {}
  audioServiceProc = null
}

function sendAudioCommand(obj) {
  if (!audioServiceProc || !audioServiceProc.stdin || audioServiceProc.stdin.writable === false) return
  try {
    audioServiceProc.stdin.write(JSON.stringify(obj) + '\n')
  } catch (err) {
    console.error('[audio] sendCommand failed:', err)
  }
}

ipcMain.handle('audio-service:start', () => startAudioService())
ipcMain.handle('audio-service:stop', () => { stopAudioService(); return { ok: true } })
ipcMain.handle('audio-service:available', () => ({ available: !!resolveAudioServiceBinary() }))
ipcMain.handle('audio-service:send', (_e, obj) => { sendAudioCommand(obj); return { ok: true } })

// Active loopback sessions: Map<sessionId, { processId, startedAt }>
const activeLoopbackSessions = new Map()

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
  'explorer', // shell — raramente útil pra capturar áudio
])

/**
 * List processes useful for WASAPI-by-PID capture.
 * Prefer apps with a visible main window (what users actually have open).
 */
function listAudioCapableProcesses() {
  return new Promise((resolve) => {
    const cp = require('child_process')
    const selfPid = process.pid
    const fallback = [{ pid: selfPid, name: 'VoiceCraft', title: 'VoiceCraft', hasWindow: true, icon: '' }]

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
          return resolve([{ pid: selfPid, name: 'VoiceCraft', title: 'VoiceCraft', hasWindow: true, icon: '' }])
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

ipcMain.handle('audio-service:list-processes', async () => {
  const processes = await listAudioCapableProcesses()
  return processes
})

ipcMain.handle('audio-service:start-loopback', (_e, payload) => {
  const processId = payload?.processId
  if (typeof processId !== 'number' || processId <= 0) {
    return { ok: false, error: 'pid-not-found' }
  }
  for (const [id, sess] of activeLoopbackSessions.entries()) {
    if (sess.processId === processId) {
      return { ok: true, sessionId: id }
    }
  }
  const crypto = require('crypto')
  const sessionId = crypto.randomUUID ? crypto.randomUUID() : ('sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9))
  activeLoopbackSessions.set(sessionId, { processId, startedAt: Date.now() })
  sendAudioCommand({ type: 'start-loopback', processId, sessionId })
  return { ok: true, sessionId }
})

ipcMain.handle('audio-service:stop-loopback', (_e, payload) => {
  const sessionId = payload?.sessionId
  if (!sessionId) {
    return { ok: false, error: 'unknown-session' }
  }
  activeLoopbackSessions.delete(sessionId)
  sendAudioCommand({ type: 'stop-loopback', sessionId })
  return { ok: true }
})

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
            oauthSend(res, 200, '<!doctype html><meta charset="utf-8"><title>VoiceCraft</title><body style="margin:0;background:#07080c;color:#f6f7f9;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;height:100vh"><p>Pode voltar ao VoiceCraft.</p></body>', { 'Content-Type': 'text/html; charset=utf-8' })
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
    // Packaged: copied next to the exe via extraResources (outside asar — Windows needs this for taskbar).
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
    path.join(__dirname, '..', 'public', 'brand', 'app-icon', 'voicecraft-app-icon-256.png'),
    path.join(app.getAppPath(), 'dist', 'brand', 'app-icon', 'voicecraft-app-icon-256.png'),
  ].filter(Boolean)
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return null
}

/** Windows taskbar uses AppUserModelId + app details — setIcon alone is not enough. */
function applyWindowsTaskbarIcon(win, icoPath, pngPath) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return
  try {
    win.setAppDetails({
      appId: 'com.voicecraft.app',
      relaunchDisplayName: 'VoiceCraft',
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
    path.join(__dirname, '..', 'public', 'brand', 'app-icon', 'voicecraft-app-icon-32.png'),
    path.join(__dirname, '..', 'dist', 'brand', 'app-icon', 'voicecraft-app-icon-32.png'),
    path.join(app.getAppPath(), 'dist', 'brand', 'app-icon', 'voicecraft-app-icon-32.png'),
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
    backgroundColor: '#0d0f14',
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
    title: 'VoiceCraft',
    autoHideMenuBar: true,
    ...(appIcon ? { icon: appIcon } : {}),
  })

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
        label: 'Adicionar ao dicionário',
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

  // No File / Edit / View menu — custom title bar owns chrome.
  Menu.setApplicationMenu(null)

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    applyWindowsTaskbarIcon(mainWindow, appIcon, appIconPng)
    if (isDev || !settings.startMinimized) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    // Open after load so DevTools doesn't race the protocol (Autofill.enable
    // / setAddresses -32601 is Chromium noise, not our code).
    mainWindow.webContents.once('did-finish-load', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
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
  tray.setToolTip('VoiceCraft')
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
    { label: 'Sair do VoiceCraft', click: () => {
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

  // Realtime now lives on Firebase. The old WS signaling server is leftover
  // and must not bind :5185 here — a second instance would crash the app
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

log('info', `[app] VoiceCraft started (userData=${app.getPath('userData')})`)
