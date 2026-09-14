/**
 * Imperative per-process WASAPI loopback capture for ScreenShareAudio.
 */
const FRAME_SIZE = 1024
const RING_FRAMES = 8
const SAMPLE_RATE = 48000
const CHANNELS = 1

/**
 * @param {number} processId
 * @returns {Promise<{ mediaStream: MediaStream, audioTrack: MediaStreamTrack, stop: () => Promise<void>, mode?: string }>}
 */
export async function startAppLoopbackCapture(processId) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.audioService : null
  if (!api?.startLoopback || !api?.onFrame) {
    throw new Error('Serviço de áudio indisponível — reconstrua o app Electron')
  }
  const pid = Number(processId)
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error('Selecione um aplicativo com áudio')
  }

  if (api.start) {
    const started = await api.start()
    if (started && started.ok === false) {
      throw new Error(started.error || 'Não foi possível iniciar o serviço de áudio')
    }
  }

  // Prefer the selected PID, then other PIDs with the same process name
  // (Opera/Chrome often put YouTube audio on a sibling/utility process).
  const candidates = [pid]
  try {
    const list = await api.listProcesses?.()
    if (Array.isArray(list)) {
      const selected = list.find((p) => Number(p.pid) === pid)
      const base = String(selected?.name || '').toLowerCase().replace(/\.exe$/i, '')
      if (base) {
        for (const p of list) {
          const n = String(p.name || '').toLowerCase().replace(/\.exe$/i, '')
          const cpid = Number(p.pid)
          if (!cpid || cpid === pid) continue
          if (n === base || n.startsWith(base) || base.startsWith(n)) {
            candidates.push(cpid)
          }
        }
      }
    }
  } catch { /* ignore */ }

  let lastErr = null
  for (const candidate of candidates.slice(0, 6)) {
    try {
      return await startCaptureWithPid(api, candidate)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Sem áudio do app — tente de novo com o YouTube tocando')
}

async function startCaptureWithPid(api, pid) {
  const startRes = await api.startLoopback({ processId: pid })
  if (!startRes?.ok) {
    throw new Error(startRes?.error || 'Falha ao iniciar captura do app')
  }
  const sessionId = startRes.sessionId
  const mode = startRes.mode || 'process'

  // Wait until the service confirms loopback (or errors).
  if (api.onStatus && !startRes.alreadyRunning) {
    await waitForLoopbackStatus(api, sessionId, 6000)
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) throw new Error('AudioContext indisponível')

  const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  try { await ctx.resume() } catch { /* ignore */ }

  const ring = new Float32Array(FRAME_SIZE * RING_FRAMES)
  let writeIdx = 0
  let readIdx = 0
  let alive = true
  let framesReceived = 0

  const proc = ctx.createScriptProcessor(FRAME_SIZE, CHANNELS, CHANNELS)
  const dest = ctx.createMediaStreamDestination()
  const silent = ctx.createGain()
  silent.gain.value = 0

  proc.onaudioprocess = (e) => {
    if (!alive) return
    const out = e.outputBuffer.getChannelData(0)
    const need = out.length
    try {
      if (writeIdx > readIdx) {
        const have = writeIdx - readIdx
        const take = Math.min(need, have)
        const ringCap = ring.length
        const startOffset = readIdx % ringCap
        if (startOffset + take <= ringCap) {
          out.set(ring.subarray(startOffset, startOffset + take), 0)
        } else {
          const first = ringCap - startOffset
          out.set(ring.subarray(startOffset, ringCap), 0)
          out.set(ring.subarray(0, take - first), first)
        }
        readIdx += take
        if (take < need) out.fill(0, take)
      } else {
        out.fill(0)
      }
    } catch {
      try { out.fill(0) } catch { /* ignore */ }
    }
  }

  proc.connect(dest)
  proc.connect(silent)
  silent.connect(ctx.destination)

  const unsubFrame = api.onFrame((floats, _samples, meta) => {
    if (!alive) return
    const type = meta?.type || floats?.type || 'mic'
    if (type !== 'loopback') return
    if (!floats || !floats.length) return
    framesReceived += 1
    const cap = ring.length
    for (let i = 0; i < floats.length; i += 1) {
      ring[writeIdx % cap] = floats[i]
      writeIdx += 1
    }
    if (writeIdx - readIdx > cap) readIdx = writeIdx - cap
  })

  const deadline = Date.now() + 2500
  while (alive && framesReceived === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100))
  }

  // If the service started but is still silent, keep going — YouTube may
  // unmute a moment later. Only fail when we got nothing after a long wait
  // AND the service never tagged loopback frames (protocol / binary broken).
  if (framesReceived === 0) {
    await new Promise((r) => setTimeout(r, 500))
  }
  if (framesReceived === 0) {
    alive = false
    try { unsubFrame?.() } catch { /* ignore */ }
    try { proc.disconnect() } catch { /* ignore */ }
    try { silent.disconnect() } catch { /* ignore */ }
    try { await ctx.close() } catch { /* ignore */ }
    if (sessionId && api.stopLoopback) {
      try { await api.stopLoopback({ sessionId }) } catch { /* ignore */ }
    }
    throw new Error('Sem frames de áudio — deixe o YouTube tocando e tente de novo')
  }

  const stop = async () => {
    if (!alive) return
    alive = false
    try { unsubFrame?.() } catch { /* ignore */ }
    try { proc.disconnect() } catch { /* ignore */ }
    try { silent.disconnect() } catch { /* ignore */ }
    try { await ctx.close() } catch { /* ignore */ }
    if (sessionId && api.stopLoopback) {
      try { await api.stopLoopback({ sessionId }) } catch { /* ignore */ }
    }
  }

  const audioTrack = dest.stream.getAudioTracks()[0] || null
  if (!audioTrack) {
    await stop()
    throw new Error('Sem faixa de áudio do aplicativo')
  }

  return {
    mediaStream: dest.stream,
    audioTrack,
    stop,
    mode,
  }
}

function waitForLoopbackStatus(api, sessionId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { unsub?.() } catch { /* ignore */ }
      // Don't hard-fail — capture may still work.
      resolve({ timedOut: true })
    }, timeoutMs)

    const unsub = api.onStatus((msg) => {
      if (done || !msg) return
      if (msg.type === 'loopback-started') {
        done = true
        clearTimeout(timer)
        try { unsub?.() } catch { /* ignore */ }
        resolve(msg)
      } else if (msg.type === 'error') {
        done = true
        clearTimeout(timer)
        try { unsub?.() } catch { /* ignore */ }
        reject(new Error(msg.message || 'Falha no serviço de áudio'))
      }
    })
  })
}
