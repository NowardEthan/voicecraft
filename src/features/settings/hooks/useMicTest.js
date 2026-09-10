import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Temporary mic capture + analyser + sidetone (hear yourself) for settings.
 * Always cleans up stream / AudioContext on stop or unmount.
 */
export function useMicTest({ deviceId = null, speakerId = null, volume = 80 } = {}) {
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState(null)
  const [heardVoice, setHeardVoice] = useState(false)
  const streamRef = useRef(null)
  const ctxRef = useRef(null)
  const monitorAudioRef = useRef(null)
  const monitorGainRef = useRef(null)
  const rafRef = useRef(0)
  const barsRef = useRef(new Float32Array(24).fill(0.08))
  const optsRef = useRef({ deviceId, speakerId, volume })
  optsRef.current = { deviceId, speakerId, volume }

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (monitorAudioRef.current) {
      try { monitorAudioRef.current.pause() } catch {}
      monitorAudioRef.current.srcObject = null
      monitorAudioRef.current = null
    }
    monitorGainRef.current = null
    try { ctxRef.current?.close() } catch {}
    ctxRef.current = null
    setTesting(false)
    setLevel(0)
    barsRef.current.fill(0.08)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setHeardVoice(false)
    stop()
    const { deviceId: micId, speakerId: outId, volume: vol } = optsRef.current
    try {
      const constraints = {
        audio: micId
          ? {
            deviceId: { exact: micId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
          : {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        video: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') await ctx.resume().catch(() => {})

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72

      // Sidetone — hear yourself while testing (Discord-style mic check).
      const monitorGain = ctx.createGain()
      const monitorVol = Math.max(0, Math.min(1, Number(vol ?? 80) / 100)) * 0.9
      monitorGain.gain.value = monitorVol
      monitorGainRef.current = monitorGain

      source.connect(analyser)
      source.connect(monitorGain)

      if (
        outId
        && typeof HTMLAudioElement !== 'undefined'
        && typeof HTMLAudioElement.prototype.setSinkId === 'function'
      ) {
        const dest = ctx.createMediaStreamDestination()
        monitorGain.connect(dest)
        const audio = new Audio()
        audio.srcObject = dest.stream
        try { await audio.setSinkId(outId) } catch {}
        await audio.play().catch(() => {})
        monitorAudioRef.current = audio
      } else {
        monitorGain.connect(ctx.destination)
      }

      streamRef.current = stream
      ctxRef.current = ctx
      setTesting(true)

      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        const bars = barsRef.current
        const step = Math.max(1, Math.floor(data.length / bars.length))
        for (let i = 0; i < bars.length; i++) {
          let bucket = 0
          for (let j = 0; j < step; j++) bucket += data[i * step + j] || 0
          const next = Math.min(1, (bucket / step) / 180)
          bars[i] = bars[i] * 0.55 + next * 0.45
          sum += bars[i]
        }
        const avg = sum / bars.length
        setLevel(avg)
        if (avg > 0.12) setHeardVoice(true)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (err) {
      setError(err?.name === 'NotAllowedError'
        ? 'Permissão do microfone negada'
        : (err?.message || 'Não foi possível abrir o microfone'))
      setTesting(false)
    }
  }, [stop])

  // Live-update monitor volume while testing.
  useEffect(() => {
    if (!testing || !monitorGainRef.current) return
    const monitorVol = Math.max(0, Math.min(1, Number(volume ?? 80) / 100)) * 0.9
    monitorGainRef.current.gain.value = monitorVol
  }, [testing, volume])

  useEffect(() => () => stop(), [stop])

  return {
    testing,
    level,
    error,
    heardVoice,
    barsRef,
    start,
    stop,
    toggle: () => (testing ? stop() : start()),
  }
}

/** Short sine beep routed to optional sink + volume. */
export async function playOutputTestTone({ speakerId, volume = 80, durationMs = 700 } = {}) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  const vol = Math.max(0, Math.min(1, volume / 100)) * 0.22
  gain.gain.value = vol
  osc.connect(gain)

  let audio = null
  if (speakerId && typeof HTMLAudioElement !== 'undefined' && typeof HTMLAudioElement.prototype.setSinkId === 'function') {
    const dest = ctx.createMediaStreamDestination()
    gain.connect(dest)
    audio = new Audio()
    audio.srcObject = dest.stream
    try { await audio.setSinkId(speakerId) } catch {}
    await audio.play().catch(() => {})
  } else {
    gain.connect(ctx.destination)
  }

  osc.start()
  await new Promise((r) => setTimeout(r, durationMs))
  try { osc.stop() } catch {}
  try { await ctx.close() } catch {}
  if (audio) {
    try { audio.pause() } catch {}
    audio.srcObject = null
  }
}
