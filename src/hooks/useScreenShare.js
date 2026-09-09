import { useState, useCallback, useEffect, useRef } from 'react'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI?.getDesktopSources

const BROWSER_WINDOW_RE = /google chrome|microsoft.?edge|firefox|brave|opera|vivaldi|arc\b|chromium|youtube/i

export function looksLikeBrowserWindow(name = '') {
  return BROWSER_WINDOW_RE.test(name)
}

/**
 * useScreenShare — screen capture with quality presets.
 *
 * Electron cannot share a Chrome *tab* (only a window or a monitor).
 * Window-capturing Chrome/YouTube goes gray when VoiceCraft is focused:
 * Windows stops compositing the occluded window, and hardware video
 * overlays never land in the captured bitmap. Sharing the monitor and
 * keeping YouTube visible is the reliable path.
 */
export function useScreenShare() {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [quality, setQuality] = useState('720p')
  const [framerate, setFramerate] = useState(30)
  const [withAudio, setWithAudio] = useState(false)
  const [availableSources, setAvailableSources] = useState([])
  const [needsPicker, setNeedsPicker] = useState(false)
  const streamRef = useRef(null)

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
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
    } catch (err) {
      console.error('[screenShare] listSources failed:', err)
      return []
    }
  }, [])

  const start = useCallback(async (q = '720p', fr = framerate, opts = {}) => {
    const captureAudio = !!opts.withAudio
    if (IS_ELECTRON) {
      await listSources()
      setNeedsPicker(true)
      setQuality(q)
      setFramerate(fr)
      setWithAudio(captureAudio)
      return null
    }
    try {
      setError(null)
      const constraints = {
        video: {
          ...((constraintsForQuality(q, fr)).video),
          frameRate: { ideal: fr, max: fr },
        },
        audio: captureAudio,
        preferCurrentTab: false,
      }
      const s = await navigator.mediaDevices.getDisplayMedia(constraints)
      decorateShareTrack(s, q)
      const track = s.getVideoTracks()[0]
      if (track) {
        track.addEventListener('ended', () => {
          if (streamRef.current === s) stop()
        })
      }
      streamRef.current = s
      setStream(s)
      setQuality(q)
      setFramerate(fr)
      setWithAudio(captureAudio)
      return s
    } catch (err) {
      console.error('[screenShare] failed:', err)
      const msg = err?.name === 'NotAllowedError'
        ? 'Compartilhamento cancelado pelo usuário'
        : err?.name === 'NotFoundError'
        ? 'Nenhuma fonte de tela disponível'
        : err?.message || `Falha ao iniciar compartilhamento (${err?.name || 'erro'})`
      setError(msg)
      throw err
    }
  }, [stop, listSources, framerate])

  const startWithSource = useCallback(async (sourceId, q = quality, fr = framerate, opts = {}) => {
    const captureAudio = IS_ELECTRON ? false : !!opts.withAudio
    try {
      setError(null)
      const c = constraintsForQuality(q, fr)
      const captured = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: c.video.width.ideal,
            maxHeight: c.video.height.ideal,
            maxFrameRate: fr,
          },
        },
        audio: captureAudio,
      })
      decorateShareTrack(captured, q)
      const track = captured.getVideoTracks()[0]
      if (track) {
        track.addEventListener('ended', () => {
          if (streamRef.current === captured) stop()
        })
      }
      streamRef.current = captured
      setStream(captured)
      setQuality(q)
      setFramerate(fr)
      setWithAudio(captureAudio)
      setNeedsPicker(false)
      return captured
    } catch (err) {
      console.error('[screenShare] startWithSource failed:', err)
      setError(err?.message || `Falha (${err?.name || 'erro'})`)
      throw err
    }
  }, [stop, framerate, quality])

  useEffect(() => () => stop(), [stop])

  return {
    stream,
    quality,
    framerate,
    setFramerate,
    withAudio,
    setWithAudio,
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
  // motion = YouTube/games; detail = text/docs. 720p rooms lean motion.
  try { track.contentHint = 'detail' } catch {}
  void quality
}

function constraintsForQuality(q, fr = 30) {
  const presets = {
    '720p':  { width: { ideal: 1280 }, height: { ideal: 720  } },
    '1080p': { width: { ideal: 1920 }, height: { ideal: 1080 } },
    '1440p': { width: { ideal: 2560 }, height: { ideal: 1440 } },
    '4k':    { width: { ideal: 3840 }, height: { ideal: 2160 } },
  }
  return {
    video: {
      ...(presets[q] || presets['720p']),
      frameRate: { ideal: fr, max: fr },
    },
    audio: false,
  }
}
