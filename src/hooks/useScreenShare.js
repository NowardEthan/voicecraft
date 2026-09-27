import { useState, useCallback, useEffect, useRef } from 'react'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI?.getDesktopSources
const BROWSER_WINDOW_RE = /google chrome|microsoft.?edge|firefox|brave|opera|vivaldi|arc\b|chromium|youtube/i

export function looksLikeBrowserWindow(name = '') {
  return BROWSER_WINDOW_RE.test(name)
}

/** Video-only desktop capture. Shared audio is always supplied by the validated native helper. */
export function useScreenShare() {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [quality, setQuality] = useState('720p')
  const [framerate, setFramerate] = useState(15)
  const [availableSources, setAvailableSources] = useState([])
  const [needsPicker, setNeedsPicker] = useState(false)
  const streamRef = useRef(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setNeedsPicker(false)
    setAvailableSources([])
  }, [])

  const listSources = useCallback(async () => {
    if (!IS_ELECTRON) return []
    try {
      const sources = await window.electronAPI.getDesktopSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 160, height: 90 },
      })
      setAvailableSources(sources)
      return sources
    } catch (captureError) {
      console.error('[screenShare] listSources failed:', captureError)
      setError(captureError?.message || 'Falha ao listar telas')
      return []
    }
  }, [])

  const acceptStream = useCallback((captured, q, fr) => {
    if (captured.getAudioTracks().length) {
      captured.getAudioTracks().forEach((track) => {
        captured.removeTrack(track)
        track.stop()
      })
    }
    decorateShareTrack(captured, q)
    const track = captured.getVideoTracks()[0]
    if (!track) {
      captured.getTracks().forEach((item) => item.stop())
      throw new Error('Nenhuma faixa de vídeo na captura')
    }
    track.addEventListener('ended', () => {
      if (streamRef.current === captured) stop()
    }, { once: true })
    streamRef.current = captured
    setStream(captured)
    setQuality(q)
    setFramerate(fr)
    setNeedsPicker(false)
    return captured
  }, [stop])

  const start = useCallback(async (q = '720p', fr = framerate) => {
    setError(null)
    if (IS_ELECTRON) {
      await listSources()
      setNeedsPicker(true)
      setQuality(q)
      setFramerate(fr)
      return null
    }
    try {
      const captured = await navigator.mediaDevices.getDisplayMedia({
        video: constraintsForQuality(q, fr).video,
        audio: false,
      })
      return acceptStream(captured, q, fr)
    } catch (captureError) {
      setError(captureError?.message || 'Falha ao iniciar compartilhamento')
      throw captureError
    }
  }, [acceptStream, framerate, listSources])

  const startWithSource = useCallback(async (sourceId, q = quality, fr = framerate) => {
    setError(null)
    try {
      const constraints = constraintsForQuality(q, fr)
      const captured = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: constraints.video.width.ideal,
            maxHeight: constraints.video.height.ideal,
            maxFrameRate: fr,
          },
        },
        audio: false,
      })
      return acceptStream(captured, q, fr)
    } catch (captureError) {
      setError(captureError?.message || `Falha (${captureError?.name || 'erro'})`)
      throw captureError
    }
  }, [acceptStream, framerate, quality])

  useEffect(() => () => stop(), [stop])

  return {
    stream,
    quality,
    framerate,
    setFramerate,
    withAudio: false,
    setWithAudio: () => {},
    isSharing: stream !== null,
    error,
    availableSources,
    needsPicker,
    isElectron: IS_ELECTRON,
    start,
    startWithSource,
    stop,
    listSources,
  }
}

function decorateShareTrack(stream, quality) {
  const track = stream.getVideoTracks()[0]
  if (!track) return
  try { track.contentHint = 'motion' } catch {}
  void quality
}

function constraintsForQuality(q, fr = 15) {
  const presets = {
    '540p': { width: { ideal: 960 }, height: { ideal: 540 } },
    '720p': { width: { ideal: 1280 }, height: { ideal: 720 } },
    '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
    '1440p': { width: { ideal: 2560 }, height: { ideal: 1440 } },
    '4k': { width: { ideal: 3840 }, height: { ideal: 2160 } },
  }
  return {
    video: {
      ...(presets[q] || presets['720p']),
      frameRate: { ideal: fr, max: fr },
    },
    audio: false,
  }
}
