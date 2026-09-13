/**
 * useAppLoopbackAudio — captures per-process audio (WASAPI loopback by PID)
 * via the audio-service, delivering an audio MediaStreamTrack for LiveKit
 * ScreenShareAudio without capturing call playback or global system sounds.
 *
 * Adheres to CONTRATO_AUDIO_DISCORD.md (Criteria C1–C5).
 */
import { useState, useEffect, useRef, useCallback } from 'react'

const FRAME_SIZE = 1024
const RING_FRAMES = 8
const SAMPLE_RATE = 48000
const CHANNELS = 1

export function useAppLoopbackAudio({ processId = null, enabled = false } = {}) {
  const [mediaStream, setMediaStream] = useState(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'starting' | 'running' | 'error'
  const [error, setError] = useState(null)

  const sessionIdRef = useRef(null)
  const audioCtxRef = useRef(null)
  const isRunningRef = useRef(false)

  const stopCapture = useCallback(async () => {
    isRunningRef.current = false
    if (sessionIdRef.current && window.electronAPI?.audioService?.stopLoopback) {
      try {
        await window.electronAPI.audioService.stopLoopback({ sessionId: sessionIdRef.current })
      } catch {}
      sessionIdRef.current = null
    }
    if (audioCtxRef.current) {
      try { await audioCtxRef.current.close() } catch {}
      audioCtxRef.current = null
    }
    setMediaStream(null)
    setStatus('idle')
  }, [])

  useEffect(() => {
    if (!enabled || !processId || typeof window === 'undefined' || !window.electronAPI?.audioService) {
      stopCapture()
      return undefined
    }

    let unmounted = false
    isRunningRef.current = true
    setStatus('starting')
    setError(null)

    let unsubFrame = null
    const ring = new Float32Array(FRAME_SIZE * RING_FRAMES)
    let writeIdx = 0
    let readIdx = 0

    async function start() {
      try {
        const startRes = await window.electronAPI.audioService.startLoopback({ processId })
        if (unmounted || !isRunningRef.current) return
        if (!startRes?.ok) {
          throw new Error(startRes?.error || 'failed to start loopback session')
        }
        sessionIdRef.current = startRes.sessionId

        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) throw new Error('AudioContext unavailable')
        const ctx = new AudioContextClass({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
        audioCtxRef.current = ctx

        const proc = ctx.createScriptProcessor(FRAME_SIZE, CHANNELS, CHANNELS)
        const dest = ctx.createMediaStreamDestination()

        proc.onaudioprocess = (e) => {
          if (unmounted || !isRunningRef.current) return
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
            try { out.fill(0) } catch {}
          }
        }

        proc.connect(dest)

        unsubFrame = window.electronAPI.audioService.onFrame((floats, _samples, meta) => {
          if (unmounted || !isRunningRef.current) return
          // Filter: only ingest loopback frames (or tagged frames)
          const type = meta?.type || floats?.type || 'mic'
          if (type !== 'loopback') return
          if (!floats || !floats.length) return

          const cap = ring.length
          for (let i = 0; i < floats.length; i++) {
            ring[writeIdx % cap] = floats[i]
            writeIdx++
          }
          if (writeIdx - readIdx > cap) {
            readIdx = writeIdx - cap
          }
        })

        setMediaStream(dest.stream)
        setStatus('running')
      } catch (err) {
        if (unmounted) return
        console.error('[useAppLoopbackAudio] start error:', err)
        setError(err?.message || 'loopback audio error')
        setStatus('error')
      }
    }

    start()

    return () => {
      unmounted = true
      isRunningRef.current = false
      if (unsubFrame) unsubFrame()
      stopCapture()
    }
  }, [enabled, processId, stopCapture])

  return {
    mediaStream,
    audioTrack: mediaStream?.getAudioTracks?.()[0] || null,
    status,
    error,
    stop: stopCapture,
  }
}
