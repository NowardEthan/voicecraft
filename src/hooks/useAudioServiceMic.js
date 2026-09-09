import { useEffect, useRef, useState } from 'react'

/**
 * useAudioServiceMic — bridges the C++ audio service (PCM frames over IPC)
 * into a live MediaStream that the WebRTC stack can consume as a mic track.
 *
 * Architecture:
 *   C++ service → stdin/stdout → Electron main → IPC → preload
 *     → (preload aliases the bytes as a Float32Array view) → this hook
 *     → AudioContext + ScriptProcessorNode → MediaStreamAudioDestination
 *     → MediaStream (caller adds this as the local audio track on PC)
 *
 * Note: the preload does the bytes→Float32Array conversion for us, so the
 * callback receives Float32Array directly. Don't re-alias.
 *
 * ScriptProcessorNode is deprecated in favor of AudioWorkletNode, but it
 * still works in all Chromium versions and is much simpler to integrate.
 *
 * Returns:
 *   - stream:    live MediaStream (null until ready, null on error)
 *   - status:    'idle' | 'starting' | 'running' | 'error' | 'unavailable'
 *   - error:     string if status === 'error'
 *   - sampleRate / channels: numeric
 */
export function useAudioServiceMic({ enabled, sampleRate = 48000, channels = 1, deviceId = '' } = {}) {
  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const stateRef = useRef({ enabled, sampleRate, channels, deviceId })

  useEffect(() => {
    stateRef.current = { enabled, sampleRate, channels, deviceId }
  }, [enabled, sampleRate, channels, deviceId])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    if (!window.electronAPI?.audioService) {
      setStatus('unavailable')
      setError('electronAPI.audioService indisponível — só funciona em Electron')
      return
    }

    let mounted = true
    let unsubFrame = () => {}
    let unsubStatus = () => {}
    let audioCtx = null
    let processor = null
    let destination = null
    let closed = false
    let lastErrorAt = 0
    let frameCount = 0

    // Two slots of audio: readIdx / writeIdx point into buffer; we keep a
    // ring of at most ~1s of audio. Simple, bounded, no allocations in the
    // hot path. Each slot holds up to MAX_FRAMES_PER_SLOT samples.
    const FRAME_SIZE = 4096  // ScriptProcessorNode buffer size
    const RING_FRAMES = 48    // ~1s of 20ms frames
    let ring = null           // Float32Array of length RING_FRAMES * 1024
    let writeIdx = 0          // samples written into ring (monotonic, modulo)
    let readIdx = 0

    function ensureRing() {
      if (!ring) ring = new Float32Array(RING_FRAMES * 1024)
    }

    function setupAudioContext() {
      if (closed) return null
      let ctx
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate,
          latencyHint: 'interactive',
        })
      } catch (err) {
        console.warn('[audio-service] AudioContext ctor failed:', err)
        throw err
      }
      const proc = ctx.createScriptProcessor(FRAME_SIZE, channels, channels)
      const dest = ctx.createMediaStreamDestination()

      // onaudioprocess runs on the MAIN THREAD. Keep this trivial and
      // bulletproof — any throw here freezes the renderer.
      proc.onaudioprocess = (e) => {
        if (closed) return
        const out = e.outputBuffer.getChannelData(0)
        const need = out.length
        // Read up to `need` samples from the ring into `out`. Silence-fill
        // the rest if we don't have enough.
        try {
          if (ring && writeIdx > readIdx) {
            const have = writeIdx - readIdx
            const take = Math.min(need, have)
            // ring may have wrapped: handle wrap-around with two copies.
            const ringCap = ring.length
            const start = readIdx % ringCap
            if (start + take <= ringCap) {
              out.set(ring.subarray(start, start + take), 0)
            } else {
              const first = ringCap - start
              out.set(ring.subarray(start, ringCap), 0)
              out.set(ring.subarray(0, take - first), first)
            }
            readIdx += take
            if (take < need) out.fill(0, take)
          } else {
            out.fill(0)
          }
        } catch (err) {
          // NEVER throw out of onaudioprocess — that hangs the main thread.
          console.warn('[audio-service] onaudioprocess err:', err)
          try { out.fill(0) } catch {}
        }
      }

      try {
        proc.connect(dest)
      } catch (err) {
        console.warn('[audio-service] connect failed:', err)
        throw err
      }
      audioCtx = ctx
      processor = proc
      destination = dest
      console.log('[audio-service] AudioContext ready, sampleRate=', ctx.sampleRate)
      return dest.stream
    }

    async function start() {
      if (closed) return
      setStatus('starting')
      setError(null)

      let probe
      try {
        probe = await window.electronAPI.audioService.available()
      } catch (err) {
        setStatus('error')
        setError(`probe failed: ${err?.message || err}`)
        return
      }
      if (!probe?.available) {
        setStatus('unavailable')
        setError('binário do audio-service não encontrado. Compile com `cmake --build build` em audio-service/.')
        return
      }

      let result
      try {
        result = await window.electronAPI.audioService.start()
      } catch (err) {
        setStatus('error')
        setError(`start failed: ${err?.message || err}`)
        return
      }
      if (!result?.ok) {
        setStatus('error')
        setError(result?.error || 'falha ao iniciar audio-service')
        return
      }

      ensureRing()

      // The payload is already a Float32Array view (preload converts).
      unsubFrame = window.electronAPI.audioService.onFrame((floats) => {
        if (!floats || !floats.length) return
        frameCount++
        // Copy samples into the ring buffer. If we'd overwrite unread
        // samples, drop the oldest (advance readIdx) to bound latency.
        const cap = ring.length
        for (let i = 0; i < floats.length; i++) {
          const idx = writeIdx % cap
          ring[idx] = floats[i]
          writeIdx++
        }
        // Bound latency: if the ring has more than RING_FRAMES * 1024 / 2
        // unread samples, skip ahead.
        if (writeIdx - readIdx > cap / 2) {
          readIdx = writeIdx - cap / 2
        }
      })

      unsubStatus = window.electronAPI.audioService.onStatus((msg) => {
        if (!mounted || closed) return
        if (msg?.type === 'ready') {
          try {
            if (!audioCtx) {
              const s = setupAudioContext()
              if (mounted && s) setStream(s)
            }
            if (mounted) setStatus('running')
          } catch (err) {
            console.error('[audio-service] setup failed:', err)
            if (mounted) {
              setStatus('error')
              setError(`AudioContext falhou: ${err?.message || err}`)
            }
          }
        } else if (msg?.type === 'error') {
          const now = Date.now()
          if (now - lastErrorAt > 1500) {
            lastErrorAt = now
            if (mounted) setError(msg.message || 'erro no audio-service')
          }
        } else if (msg?.type === 'exited') {
          if (mounted) {
            setStatus('error')
            setError(`audio-service saiu (code=${msg.code})`)
          }
        }
      })

      try {
        await window.electronAPI.audioService.send({
          type: 'start',
          sampleRate,
          channels,
          deviceId: stateRef.current.deviceId || '',
          hpf: true,
          agc: true,
          gate: true,
          threshold: -45,
          frameSizeMs: 20,
        })
      } catch (err) {
        if (mounted) {
          setStatus('error')
          setError(`send failed: ${err?.message || err}`)
        }
      }
    }

    start()

    return () => {
      closed = true
      mounted = false
      console.log('[audio-service] teardown, frames received:', frameCount)
      try { unsubFrame() } catch {}
      try { unsubStatus() } catch {}
      try {
        if (processor) processor.disconnect()
      } catch {}
      try {
        if (destination) destination.disconnect?.()
      } catch {}
      try {
        if (audioCtx && audioCtx.state !== 'closed') {
          audioCtx.close().catch(() => {})
        }
      } catch {}
      try {
        window.electronAPI.audioService.send({ type: 'stop' })
      } catch {}
    }
  }, [enabled])

  return { stream, status, error, sampleRate, channels }
}
