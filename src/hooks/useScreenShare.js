import { useState, useCallback, useEffect, useRef } from 'react'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI?.getDesktopSources

const BROWSER_WINDOW_RE = /google chrome|microsoft.?edge|firefox|brave|opera|vivaldi|arc\b|chromium|youtube/i

export function looksLikeBrowserWindow(name = '') {
  return BROWSER_WINDOW_RE.test(name)
}

/**
 * useScreenShare — screen capture with quality presets.
 *
 * Phase 7 (Electron 44+):
 *   Uses `navigator.mediaDevices.getDisplayMedia` (the modern Chromium API)
 *   with `audio.restrictOwnAudio: true`. The main process' setDisplayMediaRequestHandler
 *   grants system loopback; the renderer-side constraint tells Chromium to
 *   peel off the VoiceCraft renderer's own audio before handing the stream to
 *   the caller. That breaks the echo loop where shared screen audio was
 *   re-injected into the call.
 *
 *   The legacy `chromeMediaSource: 'desktop'` path is kept as a fallback for
 *   environments where getDisplayMedia is gated by the OS or blocked.
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
  const [framerate, setFramerate] = useState(15)
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

  /**
   * Modern path: getDisplayMedia. The Chromium picker UI lets the user pick
   * a tab, window or screen. The `audio` constraint is honoured by the OS:
   *  - `restrictOwnAudio: true` tells Chromium to remove audio produced by
   *    this renderer (VoiceCraft) from the captured loopback, eliminating
   *    the call-echo loop.
   *  - We explicitly disable echoCancellation/noiseSuppression/autoGainControl
   *    on the captured stream because those are designed for microphone
   *    input (they destroy music/ambient sound in loopback audio).
   */
  const startWithDisplayMedia = useCallback(async (q, fr, wantAudio) => {
    const videoConstraints = constraintsForQuality(q, fr).video
    const constraints = {
      video: {
        ...videoConstraints,
        frameRate: { ideal: fr, max: fr },
      },
      audio: wantAudio ? {
        restrictOwnAudio: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Keep loopback at the system mixer sample-rate; do not force resample.
        channelCount: 2,
      } : false,
      // Hint Chromium: prefer the whole monitor so the user can also pick
      // specific windows/tabs inside the native picker.
      preferCurrentTab: false,
    }
    return await navigator.mediaDevices.getDisplayMedia(constraints)
  }, [])

  const start = useCallback(async (q = '720p', fr = framerate, opts = {}) => {
    // Browser: follow getDisplayMedia audio checkbox. Electron: opt-in via picker.
    const captureAudio = opts.withAudio === true
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
      const s = await startWithDisplayMedia(q, fr, captureAudio)
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
      setWithAudio(s.getAudioTracks().length > 0)
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
  }, [stop, listSources, framerate, startWithDisplayMedia])

  const startWithSource = useCallback(async (sourceId, q = quality, fr = framerate, opts = {}) => {
    const wantAudio = opts.withAudio === true
    try {
      setError(null)
      const c = constraintsForQuality(q, fr)
      // Prefer getDisplayMedia even when picking a specific sourceId — Chromium
      // honours the same picker UI but lets us pass quality hints. We pass
      // `chromeMediaSourceId` only via the legacy fallback below.
      let captured = null
      let captureAudio = false

      if (wantAudio && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
        try {
          captured = await navigator.mediaDevices.getDisplayMedia({
            video: {
              ...c.video,
              frameRate: { ideal: fr, max: fr },
            },
            audio: {
              restrictOwnAudio: true,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            preferCurrentTab: false,
          })
          captured.getAudioTracks().forEach((t) => {
            if (t && t.readyState === 'ended') {
              try { captured.removeTrack(t) } catch {}
              try { t.stop() } catch {}
            }
          })
          captureAudio = captured.getAudioTracks().some((t) => t && t.readyState !== 'ended')
        } catch (err) {
          console.warn('[screenShare] getDisplayMedia audio failed; falling back to legacy', err?.message || err)
        }
      }

      if (!captured) {
        // Legacy fallback (older Electron / sandboxed environments).
        const videoConstraints = {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: c.video.width.ideal,
            maxHeight: c.video.height.ideal,
            maxFrameRate: fr,
          },
        }
        if (wantAudio) {
          try {
            captured = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: { mandatory: { chromeMediaSource: 'desktop' } },
            })
            captured.getAudioTracks().forEach((t) => {
              if (t && t.readyState === 'ended') {
                try { captured.removeTrack(t) } catch {}
                try { t.stop() } catch {}
              }
            })
            captureAudio = captured.getAudioTracks().some((t) => t && t.readyState !== 'ended')
            if (!captureAudio) {
              console.warn('[screenShare] desktop audio track ended immediately; sharing video only')
            }
          } catch (audioErr) {
            console.warn('[screenShare] desktop audio unavailable, falling back to video-only', audioErr?.message || audioErr)
          }
        }
        if (!captured) {
          captured = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          })
          captureAudio = false
        }
      }

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
  // motion = jogo/vídeo (fluidez); detail = texto/docs (mais CPU).
  try { track.contentHint = 'motion' } catch {}
  void quality
}

function constraintsForQuality(q, fr = 15) {
  const presets = {
    '540p':  { width: { ideal: 960 },  height: { ideal: 540  } },
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
