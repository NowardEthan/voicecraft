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

  const startRes = await api.startLoopback({ processId: pid })
  if (!startRes?.ok) {
    throw new Error(startRes?.error || 'Falha ao iniciar captura do app')
  }
  const sessionId = startRes.sessionId

  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) throw new Error('AudioContext indisponível')

  const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  const ring = new Float32Array(FRAME_SIZE * RING_FRAMES)
  let writeIdx = 0
  let readIdx = 0
  let alive = true

  const proc = ctx.createScriptProcessor(FRAME_SIZE, CHANNELS, CHANNELS)
  const dest = ctx.createMediaStreamDestination()

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

  const unsubFrame = api.onFrame((floats, _samples, meta) => {
    if (!alive) return
    const type = meta?.type || floats?.type || 'mic'
    if (type !== 'loopback') return
    if (!floats || !floats.length) return
    const cap = ring.length
    for (let i = 0; i < floats.length; i += 1) {
      ring[writeIdx % cap] = floats[i]
      writeIdx += 1
    }
    if (writeIdx - readIdx > cap) readIdx = writeIdx - cap
  })

  const stop = async () => {
    if (!alive) return
    alive = false
    try { unsubFrame?.() } catch { /* ignore */ }
    try { proc.disconnect() } catch { /* ignore */ }
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
