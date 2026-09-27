import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8')

function functionBody(name) {
  const start = main.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} must exist`)
  const next = main.indexOf('\nfunction ', start + 1)
  return main.slice(start, next === -1 ? main.length : next)
}

test('updater never invokes quitAndInstall directly', () => {
  assert.doesNotMatch(main, /\.quitAndInstall\s*\(/)
})

test('user-confirmed install is deferred to the final quit event', () => {
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
