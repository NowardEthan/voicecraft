/**
 * Imperative per-process WASAPI loopback capture for ScreenShareAudio.
 * Used by screen-share publish path (and optionally by useAppLoopbackAudio).
 */
const FRAME_SIZE = 1024
const RING_FRAMES = 8
const SAMPLE_RATE = 48000
const CHANNELS = 1

/**
 * @param {number} processId
 * @returns {Promise<{ mediaStream: MediaStream, audioTrack: MediaStreamTrack, stop: () => Promise<void> }>}
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

  // Ensure the C++ audio service is running before starting loopback.
  if (api.start) {
    const started = await api.start()
    if (started && started.ok === false) {
      throw new Error(started.error || 'Não foi possível iniciar o serviço de áudio')
    }
  }

  const startRes = await api.startLoopback({ processId: pid })
  if (!startRes?.ok) {
    throw new Error(startRes?.error || 'Falha ao iniciar captura do app')
  }
  const sessionId = startRes.sessionId

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
  // Chromium only runs ScriptProcessor when connected to the context destination.
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

  // Wait briefly for real PCM — fail fast if loopback never starts.
  await new Promise((r) => setTimeout(r, 400))
  if (!alive) {
    throw new Error('Captura cancelada')
  }
  if (framesReceived === 0) {
    // Give a bit more time on cold start of the audio service.
    await new Promise((r) => setTimeout(r, 800))
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
    throw new Error('Sem áudio do app — o processo pode estar mudo ou sem sessão WASAPI')
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
  }
}
