import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8')
const preload = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8')
const liveKitRoom = fs.readFileSync(
  path.join(root, 'src/features/rooms/views/voice/useLiveKitRoom.js'),
  'utf8',
)

function functionBody(name) {
  const start = main.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} must exist`)
  const next = main.indexOf('\nfunction ', start + 1)
  return main.slice(start, next === -1 ? main.length : next)
}

test('updater never invokes quitAndInstall directly', () => {
  assert.doesNotMatch(main, /\.quitAndInstall\s*\(/)
})

test('install is deferred to the final quit event', () => {
  const flow = functionBody('installDownloadedUpdate')
  assert.match(flow, /app\.once\('quit', installOnQuit\)/)
  assert.match(flow, /updater\.install\(true, true\)/)
  assert.ok(
    flow.indexOf("app.once('quit', installOnQuit)") < flow.indexOf('teardownApp({ destroyWindows: true })'),
    'quit listener must be armed before teardown destroys windows',
  )
})

test('installation teardown releases helpers, tray, and every window', () => {
  const teardown = functionBody('teardownApp')
  assert.match(teardown, /stopAudioService\(\)/)
  assert.match(teardown, /stopOAuthServer\(\)/)
  assert.match(teardown, /tray\.destroy\(\)/)
  assert.match(teardown, /BrowserWindow\.getAllWindows\(\)/)
  assert.match(teardown, /window\.destroy\(\)/)

  const flow = functionBody('installDownloadedUpdate')
  assert.match(flow, /teardownApp\(\{ destroyWindows: true \}\)/)
  assert.match(flow, /app\.quit\(\)/)
})

test('window lifecycle cannot recreate UI during installation', () => {
  assert.match(main, /app\.on\('window-all-closed',[\s\S]*?if \(isInstallingSilent\) return/)
  assert.match(main, /app\.on\('activate',[\s\S]*?if \(isInstallingSilent \|\| app\.isQuiting\) return/)
})

test('synchronous pre-exit failures restore install state and status', () => {
  const flow = functionBody('installDownloadedUpdate')
  assert.match(flow, /app\.removeListener\('quit', installOnQuit\)/)
  assert.match(flow, /isInstallingSilent = false/)
  assert.match(flow, /app\.isQuiting = false/)
  assert.match(flow, /sendUpdater\(getMainWindow, 'updater:status', \{ status: 'error', message \}\)/)
  assert.match(flow, /install after quit failed:[\s\S]*?log\('error'/)
})

test('continuous scheduler uses short startup and 30 minute interval', () => {
  assert.match(main, /const UPDATE_INITIAL_DELAY_MS = 6_000/)
  assert.match(main, /const UPDATE_INTERVAL_MS = 30 \* 60_000/)
  const setup = functionBody('setupUpdater')
  assert.match(setup, /setTimeout\([\s\S]*?requestUpdaterCheck\('initial startup'\)[\s\S]*?UPDATE_INITIAL_DELAY_MS/)
  assert.match(setup, /setInterval\([\s\S]*?requestUpdaterCheck\('periodic interval'\)[\s\S]*?UPDATE_INTERVAL_MS/)
})

test('all checks share in-flight deduplication and automatic throttle', () => {
  const check = functionBody('requestUpdaterCheck')
  assert.match(check, /if \(updaterCheckPromise\)/)
  assert.match(check, /if \(!force && updaterLastCheckStartedAt && elapsed < UPDATE_THROTTLE_MS\)/)
  assert.match(check, /updaterCheckPromise = getAutoUpdater\(\)\.checkForUpdates\(\)/)
  assert.match(check, /if \(result\?\.downloadPromise\) await result\.downloadPromise/)
  assert.match(check, /\.finally\(\(\) => \{\s*updaterCheckPromise = null/)
  assert.equal((main.match(/\.checkForUpdates\(\)/g) || []).length, 1)
})

test('manual IPC forces throttle bypass but preserves hard skips', () => {
  const check = functionBody('requestUpdaterCheck')
  const inFlight = check.indexOf('if (updaterCheckPromise)')
  const throttle = check.indexOf('if (!force && updaterLastCheckStartedAt')
  assert.ok(inFlight >= 0 && inFlight < throttle, 'in-flight guard must precede forced throttle bypass')
  assert.ok(check.indexOf('if (isInstallingSilent)') < throttle)
  assert.ok(check.indexOf('if (updateDownloaded)') < throttle)
  assert.match(functionBody('setupUpdater'), /requestUpdaterCheck\('manual IPC', \{ force: true \}\)/)
})

test('resume, unlock, show, and reload request throttled checks', () => {
  const setup = functionBody('setupUpdater')
  const windowWire = functionBody('wireUpdaterWindow')
  assert.match(setup, /powerMonitor\.on\('resume', onResume\)/)
  assert.match(setup, /powerMonitor\.on\('unlock-screen', onUnlock\)/)
  assert.match(setup, /requestUpdaterCheck\('system resume'\)/)
  assert.match(setup, /requestUpdaterCheck\('unlock-screen'\)/)
  assert.match(windowWire, /win\.on\('show', onShow\)/)
  assert.match(windowWire, /win\.webContents\.on\('did-finish-load', onLoad\)/)
  assert.match(windowWire, /requestUpdaterCheck\('window shown'\)/)
  assert.match(windowWire, /requestUpdaterCheck\('window loaded'\)/)
})

test('retry timer is singleton and cleared by a real check', () => {
  const retry = functionBody('scheduleUpdaterRetry')
  const check = functionBody('requestUpdaterCheck')
  assert.match(retry, /if \(updaterRetryTimer \|\| updateDownloaded \|\| isInstallingSilent \|\| app\.isQuiting\)/)
  assert.match(retry, /updaterRetryTimer = setTimeout/)
  assert.match(retry, /updaterRetryTimer = null\s*void requestUpdaterCheck\('retry'\)/)
  assert.match(check, /clearTimeout\(updaterRetryTimer\)\s*updaterRetryTimer = null/)
})

test('before-quit clears timers and registered listeners', () => {
  const cleanup = functionBody('cleanupUpdaterLifecycle')
  assert.match(cleanup, /clearTimeout\(updaterInitialTimer\)/)
  assert.match(cleanup, /clearInterval\(updaterIntervalTimer\)/)
  assert.match(cleanup, /clearTimeout\(updaterRetryTimer\)/)
  assert.match(cleanup, /clearTimeout\(updaterAutoInstallTimer\)/)
  assert.match(cleanup, /for \(const cleanup of updaterLifecycleCleanups\)/)
  assert.match(main, /app\.on\('before-quit',[\s\S]*?cleanupUpdaterLifecycle\(\)[\s\S]*?teardownApp\(\)/)
  assert.match(functionBody('setupUpdater'), /powerMonitor\.removeListener\('resume', onResume\)/)
  assert.match(functionBody('setupUpdater'), /powerMonitor\.removeListener\('unlock-screen', onUnlock\)/)
})

test('download auto-installs only after idle stabilization', () => {
  assert.match(main, /const UPDATE_AUTO_INSTALL_DELAY_MS = 8_000/)
  const schedule = functionBody('scheduleDownloadedUpdateInstall')
  assert.match(schedule, /if \(updaterSessionActive\)/)
  assert.match(schedule, /if \(updaterAutoInstallTimer\)/)
  assert.match(schedule, /updaterAutoInstallTimer = setTimeout/)
  assert.match(schedule, /if \(updaterSessionActive\)[\s\S]*?return[\s\S]*?installDownloadedUpdate\(updaterGetMainWindow\)/)
  assert.match(functionBody('setupUpdater'), /scheduleDownloadedUpdateInstall\('download completed'\)/)
})

test('active media defers install and idle transition retries it', () => {
  const state = functionBody('setUpdaterSessionActive')
  assert.match(state, /payload\.active \|\| payload\.voiceActive \|\| payload\.screenShareActive/)
  assert.match(state, /if \(active && updaterAutoInstallTimer\)/)
  assert.match(state, /else if \(!active && updateDownloaded\)/)
  assert.match(state, /scheduleDownloadedUpdateInstall\('media session ended'\)/)
  assert.match(functionBody('setupUpdater'), /if \(updaterSessionActive\)[\s\S]*?deferred: true/)
})

test('renderer reports voice and screen-share activity through preload', () => {
  assert.match(preload, /setSessionActive: \(payload\) => ipcRenderer\.invoke\('updater:set-session-active'/)
  assert.match(liveKitRoom, /const voiceActive = !!\(room\?\.id && currentUserId\)/)
  assert.match(liveKitRoom, /const screenShareActive = screenSharing \|\| !!screenShare\.stream/)
  assert.match(liveKitRoom, /updater\.setSessionActive\(\{[\s\S]*?voiceActive,[\s\S]*?screenShareActive/)
  assert.match(liveKitRoom, /updater\.setSessionActive\(\{ active: false \}\)/)
})

test('download and installation suppress replacement checks', () => {
  const check = functionBody('requestUpdaterCheck')
  assert.match(check, /if \(isInstallingSilent\)/)
  assert.match(check, /if \(updateDownloaded\)/)
  assert.match(functionBody('setupUpdater'), /updater\.autoDownload = true/)
  assert.match(functionBody('setupUpdater'), /updater\.autoInstallOnAppQuit = false/)
})