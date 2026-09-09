import { useEffect, useRef, useState, useCallback } from 'react'
import gateWorkletUrl from '../audio/gate-worklet.js?url'

/**
 * useWebAudioDsp — optional mic processing + a cheap speaking-level tap.
 *
 * Levels:
 *   'off'    — analyser only (no worklet). This is the default and what
 *              the voice room uses for the speaking indicator.
 *   'light'  — highpass + soft gate/compressor (loaded only when chosen)
 *   'strong' — tighter gate + compressor
 *
 * The VU value lives on `inputLevelRef` — never in React state. Writing
 * level to state at 20 Hz re-rendered the entire voice room and made
 * screen share stutter.
 */
export function useWebAudioDsp(inputStream, { active = true, processLevel = 'off' } = {}) {
  const [level, _setLevel] = useState(processLevel)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [processedStream, setProcessedStream] = useState(null)

  const inputLevelRef = useRef(0)
  const ctxRef = useRef(null)
  const sourceRef = useRef(null)
  const highpassRef = useRef(null)
  const gateRef = useRef(null)
  const compressorRef = useRef(null)
  const destRef = useRef(null)
  const analyserInRef = useRef(null)
  const rafRef = useRef(0)

  const setLevel = useCallback((v) => _setLevel(v), [])

  useEffect(() => {
    if (processLevel && processLevel !== level) _setLevel(processLevel)
  }, [processLevel, level])

  useEffect(() => {
    if (!active || !inputStream) {
      setProcessedStream(null)
      inputLevelRef.current = 0
      setReady(false)
      return
    }

    const audioTracks = inputStream.getAudioTracks()
    if (audioTracks.length === 0) {
      setProcessedStream(inputStream)
      setReady(true)
      return
    }

    let cancelled = false
    let cleanup = () => {}
    const wantProcess = level === 'light' || level === 'strong'

    ;(async () => {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext
        if (!Ctor) throw new Error('Web Audio API indisponível')
        const ctx = new Ctor({ latencyHint: 'interactive' })
        if (ctx.state === 'suspended') await ctx.resume()
        if (cancelled) { ctx.close(); return }

        const source = ctx.createMediaStreamSource(inputStream)
        const analyserIn = ctx.createAnalyser()
        analyserIn.fftSize = 256
        analyserIn.smoothingTimeConstant = 0.35
        source.connect(analyserIn)

        ctxRef.current = ctx
        sourceRef.current = source
        analyserInRef.current = analyserIn

        if (wantProcess) {
          await ctx.audioWorklet.addModule(gateWorkletUrl)
          if (cancelled) { ctx.close(); return }

          const highpass = ctx.createBiquadFilter()
          highpass.type = 'highpass'
          highpass.frequency.value = level === 'strong' ? 120 : 80
          highpass.Q.value = 0.7

          const gate = new AudioWorkletNode(ctx, 'noise-gate-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            processorOptions: { threshold: 0.012, attack: 0.001, release: 0.12 },
          })

          const compressor = ctx.createDynamicsCompressor()
          compressor.threshold.value = level === 'strong' ? -18 : -24
          compressor.knee.value = 12
          compressor.ratio.value = 3
          compressor.attack.value = 0.005
          compressor.release.value = 0.1

          const dest = ctx.createMediaStreamDestination()
          source.connect(highpass)
          highpass.connect(gate)
          gate.connect(compressor)
          compressor.connect(dest)

          highpassRef.current = highpass
          gateRef.current = gate
          compressorRef.current = compressor
          destRef.current = dest

          setProcessedStream(new MediaStream([
            ...dest.stream.getAudioTracks(),
            ...inputStream.getVideoTracks(),
          ]))
        } else {
          setProcessedStream(inputStream)
        }

        setReady(true)

        const bufIn = new Uint8Array(analyserIn.fftSize)
        const tick = () => {
          if (cancelled) return
          analyserIn.getByteTimeDomainData(bufIn)
          inputLevelRef.current = rms(bufIn)
          rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)

        cleanup = () => {
          cancelAnimationFrame(rafRef.current)
          try { source.disconnect() } catch {}
          try { highpassRef.current?.disconnect() } catch {}
          try { gateRef.current?.disconnect() } catch {}
          try { compressorRef.current?.disconnect() } catch {}
          try { analyserIn.disconnect() } catch {}
          try { destRef.current?.stream.getTracks().forEach(t => t.stop()) } catch {}
          try { ctx.close() } catch {}
          highpassRef.current = null
          gateRef.current = null
          compressorRef.current = null
          destRef.current = null
        }
      } catch (err) {
        if (!cancelled) setError(String(err && err.message || err))
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [inputStream, active, level])

  useEffect(() => {
    const gate = gateRef.current
    const highpass = highpassRef.current
    const compressor = compressorRef.current
    if (!gate || !highpass || !compressor) return

    if (level === 'off') {
      gate.port.postMessage({ type: 'threshold', value: 1 })
      highpass.frequency.value = 20
      compressor.threshold.value = 0
    } else if (level === 'light') {
      gate.port.postMessage({ type: 'threshold', value: 0.004 })
      gate.port.postMessage({ type: 'release', value: 0.05 })
      highpass.frequency.value = 80
      compressor.threshold.value = -24
    } else {
      gate.port.postMessage({ type: 'threshold', value: 0.012 })
      gate.port.postMessage({ type: 'release', value: 0.15 })
      highpass.frequency.value = 120
      compressor.threshold.value = -18
    }
  }, [level])

  return {
    processedStream,
    level,
    setLevel,
    ready,
    error,
    inputLevel: 0,
    outputLevel: 0,
    inputLevelRef,
  }
}

function rms(buf) {
  let sum = 0
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / buf.length)
}
