import { useCallback, useEffect, useRef, useState } from 'react'

const CONSTRAINTS = {
  audio: false,
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: 'user',
  },
}

/**
 * Local webcam. Separate from the mic cache so turning the camera off
 * never kills the voice track.
 */
export function useCamera() {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const streamRef = useRef(null)

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
    }
    streamRef.current = null
    setStream(null)
  }, [])

  const start = useCallback(async () => {
    try {
      setError(null)
      const s = await navigator.mediaDevices.getUserMedia(CONSTRAINTS)
      const track = s.getVideoTracks()[0]
      if (track) {
        try { track.contentHint = 'motion' } catch {}
        track.addEventListener('ended', () => {
          if (streamRef.current === s) stop()
        })
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      streamRef.current = s
      setStream(s)
      return s
    } catch (err) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Permissão da câmera negada'
        : err?.name === 'NotFoundError'
          ? 'Nenhuma câmera encontrada'
          : err?.message || 'Falha ao ligar a câmera'
      setError(msg)
      throw Object.assign(err || new Error(msg), { message: msg })
    }
  }, [stop])

  const toggle = useCallback(async () => {
    if (streamRef.current) {
      stop()
      return null
    }
    return start()
  }, [start, stop])

  useEffect(() => () => stop(), [stop])

  return { stream, isOn: stream !== null, error, start, stop, toggle }
}

export function classifyVideoTrack(track) {
  if (!track) return 'camera'
  if (track.contentHint === 'detail') return 'screen'
  const label = String(track.label || '').toLowerCase()
  if (/screen|window|desktop|webcontents|display|monitor/.test(label)) return 'screen'
  return 'camera'
}
