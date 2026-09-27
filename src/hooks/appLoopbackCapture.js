/**
 * Strict native WASAPI loopback capture for LiveKit ScreenShareAudio.
 * The frame listener is installed before start IPC to avoid losing early audio.
 */
const FRAME_SIZE = 1024
const RING_FRAMES = 16
const SAMPLE_RATE = 48000
const CHANNELS = 1
const VALIDATION_TIMEOUT_MS = 5000
const MIN_RMS = 0.0001
const MIN_PEAK = 0.001

export function startAppLoopbackCapture(processId) {
  const pid = Number(processId)
  if (!Number.isInteger(pid) || pid <= 0) {
    return Promise.reject(new Error('Selecione um aplicativo válido com áudio tocando'))
  }
  return startNativeLoopbackCapture({ mode: 'app', processId: pid })
}

export function startSystemLoopbackCapture() {
  return startNativeLoopbackCapture({ mode: 'system-excluding-voice' })
}

async function startNativeLoopbackCapture({ mode, processId }) {
  const api = typeof window !== 'undefined' ? window.electronAPI?.audioService : null
  const startMethod = mode === 'app' ? api?.startLoopback : api?.startLoopbackSystem
  if (!startMethod || !api?.onFrame || !api?.stopLoopback) {
    throw new Error('Captura de áudio nativa indisponível ou desatualizada')
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) throw new Error('AudioContext indisponível')

  const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  const ring = new Float32Array(FRAME_SIZE * RING_FRAMES)
  let writeIdx = 0
  let readIdx = 0
  let alive = true
  let sessionId = null
  let framesReceived = 0
  let sampleCount = 0
  let squareSum = 0
  let peak = 0

  const proc = ctx.createScriptProcessor(FRAME_SIZE, CHANNELS, CHANNELS)
  const dest = ctx.createMediaStreamDestination()
  const silent = ctx.createGain()
  silent.gain.value = 0
  proc.onaudioprocess = (event) => {
    const out = event.outputBuffer.getChannelData(0)
    out.fill(0)
    if (!alive || writeIdx <= readIdx) return
    const take = Math.min(out.length, writeIdx - readIdx)
    const offset = readIdx % ring.length
    const first = Math.min(take, ring.length - offset)
    out.set(ring.subarray(offset, offset + first), 0)
    if (first < take) out.set(ring.subarray(0, take - first), first)
    readIdx += take
  }
  proc.connect(dest)
  proc.connect(silent)
  silent.connect(ctx.destination)

  // Register before start. Main tags early frames with the provisional session.
  const unsubscribe = api.onFrame((floats, _count, meta) => {
    if (!alive || meta?.type !== 'loopback' || !floats?.length) return
    if (sessionId && meta.sessionId !== sessionId) return
    if (!sessionId && !meta?.sessionId) return
    framesReceived += 1
    for (let i = 0; i < floats.length; i += 1) {
      const value = Number.isFinite(floats[i]) ? floats[i] : 0
      ring[writeIdx % ring.length] = value
      writeIdx += 1
      squareSum += value * value
      peak = Math.max(peak, Math.abs(value))
      sampleCount += 1
    }
    if (writeIdx - readIdx > ring.length) readIdx = writeIdx - ring.length
  })

  const stop = async () => {
    if (!alive) return
    alive = false
    try { unsubscribe?.() } catch {}
    try { proc.disconnect() } catch {}
    try { silent.disconnect() } catch {}
    try { dest.disconnect?.() } catch {}
    if (sessionId) {
      try { await api.stopLoopback({ sessionId }) } catch {}
    }
    try { await ctx.close() } catch {}
  }

  try {
    try { await ctx.resume() } catch {}
    const startResult = mode === 'app'
      ? await startMethod({ processId })
      : await startMethod()
    if (!startResult?.ok) {
      throw new Error(startResult?.error || 'Falha ao iniciar captura nativa')
    }
    sessionId = startResult.sessionId
    if (!sessionId) throw new Error('Serviço de áudio não retornou uma sessão')

    const deadline = Date.now() + VALIDATION_TIMEOUT_MS
    while (alive && Date.now() < deadline) {
      const rms = sampleCount ? Math.sqrt(squareSum / sampleCount) : 0
      if (framesReceived > 0 && rms >= MIN_RMS && peak >= MIN_PEAK) break
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
    const rms = sampleCount ? Math.sqrt(squareSum / sampleCount) : 0
    if (!framesReceived) throw new Error('O serviço não enviou frames de áudio')
    if (rms < MIN_RMS || peak < MIN_PEAK) {
      throw new Error(mode === 'app'
        ? 'O aplicativo está sem áudio detectável — deixe-o tocando e tente novamente'
        : 'O sistema está sem áudio detectável — reproduza algum som e tente novamente')
    }

    const audioTrack = dest.stream.getAudioTracks()[0]
    if (!audioTrack) throw new Error('A captura nativa não criou uma faixa de áudio')
    return {
      mediaStream: dest.stream,
      audioTrack,
      stop,
      sessionId,
      mode: startResult.mode,
      sampleRate: startResult.sampleRate || SAMPLE_RATE,
      channels: startResult.channels || CHANNELS,
      validation: { rms, peak, framesReceived, sampleCount },
    }
  } catch (error) {
    await stop()
    throw error
  }
}