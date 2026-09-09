#!/usr/bin/env node
/**
 * dev:multi — sobe 1 signaling + 1 vite + 2 Electron simultâneos.
 *
 * Uso: npm run dev:multi
 *
 * - signaling roda numa porta fixa (5185), compartilhado entre as instâncias
 * - vite roda numa porta fixa (5183), compartilhado
 * - 2 Electron abrem, ambos conectam ao mesmo signaling e vite
 * - o vite-plugin-electron auto-spawna 1 Electron; este script spawna o 2º
 *
 * Ctrl+C derruba tudo de uma vez.
 */
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const VITE_PORT = 5183
const SIGNALING_PORT = 5185

const VITE_URL = `http://localhost:${VITE_PORT}`
const SIGNALING_URL = `ws://localhost:${SIGNALING_PORT}`

// Windows precisa de `.cmd` pra resolver npx/node/npm via spawn sem shell;
// POSIX usa os binários diretamente.
const IS_WIN = process.platform === 'win32'
const NODE_BIN = IS_WIN ? 'node.exe' : 'node'
const NPM_BIN = IS_WIN ? 'npm.cmd' : 'npm'
const NPX_BIN = IS_WIN ? 'npx.cmd' : 'npx'
const ELECTRON_BIN = IS_WIN ? 'electron.cmd' : 'electron'

// Seta as env vars no nível do processo AGORA pra que sejam herdadas por
// todos os filhos (vite, vite-plugin-electron → Electron #1, Electron #2).
// Sem isso, o Electron auto-spawnado pelo vite-plugin-electron não saberia
// que existe um signaling externo e tentaria subir o próprio → EADDRINUSE.
process.env.EXTERNAL_SIGNALING = '1'
process.env.VITE_DEV_SERVER_URL = VITE_URL

// Separate userData dir for the second instance. Without this, both
// Electrons race on the same Chromium cache + GPU cache + Electron settings
// file, producing "Unable to move the cache: Acesso negado" and unstable
// startup. The CLI flag --user-data-dir is the only supported way to scope
// Electron's data to a single process.
const SECOND_USER_DATA = path.join(
  require('os').tmpdir(),
  `voicecraft-dev-${process.pid}`,
)

const SECOND_ELECTRON_ARGS = [
  ELECTRON_BIN,
  '.',
  `--user-data-dir=${SECOND_USER_DATA}`,
]

const SHARED_ENV = {
  ...process.env,
  EXTERNAL_SIGNALING: '1',          // ambos os Electrons pulam auto-signaling
  VITE_DEV_SERVER_URL: VITE_URL,     // ambos conectam no mesmo vite
}

const procs = []
let exiting = false

function startProc(name, cmd, args, opts = {}) {
  const p = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.resolve(__dirname, '..'),
    // No Windows, shell:true faz o .cmd resolver via cmd.exe. Em POSIX
    // mantém o fork direto (mais limpo, sem shell intermediário).
    shell: IS_WIN,
    ...opts,
  })
  const tag = `[${name}]`
  const pipe = (stream, out) => stream.on('data', d => {
    const lines = d.toString().split(/\r?\n/).filter(Boolean)
    for (const line of lines) out.write(`${tag} ${line}\n`)
  })
  pipe(p.stdout, process.stdout)
  pipe(p.stderr, process.stderr)
  p.on('exit', (code) => {
    if (!exiting) console.log(`${tag} exited with code ${code}`)
  })
  procs.push(p)
  return p
}

function killAll() {
  if (exiting) return
  exiting = true
  console.log('\n→ shutting down…')
  for (const p of procs) {
    try { p.kill() } catch {}
  }
  setTimeout(() => process.exit(0), 300)
}

process.on('SIGINT', killAll)
process.on('SIGTERM', killAll)

function waitForHttp(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error(`timeout waiting for ${url}`))
        setTimeout(tick, 250)
      })
      req.setTimeout(1000, () => req.destroy(new Error('socket timeout')))
    }
    tick()
  })
}

;(async () => {
  console.log('→ starting signaling server on', SIGNALING_URL)
  startProc('signaling', NODE_BIN, ['server/signaling-server.mjs'])

  // Pequeno delay pra signaling estar pronto antes dos Electrons conectarem
  await new Promise(r => setTimeout(r, 400))

  console.log('→ starting vite on', VITE_URL)
  startProc('vite', NPX_BIN, ['vite'])

  console.log('→ waiting for vite to be ready…')
  await waitForHttp(VITE_URL)
  console.log('✓ vite ready')

  // O vite-plugin-electron já vai auto-spawnar o primeiro Electron quando
  // terminar de processar o main entry. Aqui esperamos um pouco e spawnamos
  // o segundo manualmente.
  await new Promise(r => setTimeout(r, 800))
  console.log('→ spawning second Electron instance (userData=' + SECOND_USER_DATA + ')')
  startProc('electron-2', NPX_BIN, SECOND_ELECTRON_ARGS, { env: SHARED_ENV })

  console.log('\n✓ all up. Press Ctrl+C to stop.\n')
})().catch((err) => {
  console.error('✗ failed:', err.message)
  killAll()
  process.exit(1)
})
