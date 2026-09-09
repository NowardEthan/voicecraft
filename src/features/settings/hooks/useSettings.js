import { useEffect, useState, useCallback } from 'react'

const DEFAULTS = {
  microphoneId: null,
  dspLevel: 'off',
  screenQuality: '720p',
  screenFramerate: 30,
  screenWithAudio: false,
  // GPU acceleration — applied by Electron on next launch. Takes effect
  // when the user restarts the app (must be set before app.whenReady).
  gpuAcceleration: true,
  // Use the C++ audio-service child process for mic capture instead of the
  // browser's getUserMedia. Requires the binary to be built
  // (`cmake --build build` in audio-service/).
  useAudioService: false,
  startMinimized: false,
}

/**
 * Tiny settings hook. Reads from electronAPI (when available, e.g. Electron)
 * on mount and exposes a setter that persists through IPC. When running in a
 * plain browser (no electronAPI), it falls back to localStorage so dev
 * iteration on http://localhost:5183 still works.
 */
export function useSettings() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  const [settings, setSettings] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let initial = DEFAULTS
      if (isElectron) {
        try { initial = await window.electronAPI.getSettings() } catch {}
      } else if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('voicecraft:settings')
          if (raw) initial = { ...DEFAULTS, ...JSON.parse(raw) }
        } catch {}
      }
      if (!cancelled) {
        setSettings({ ...DEFAULTS, ...initial })
        setLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [isElectron])

  const update = useCallback(async (patch) => {
    setSettings(prev => ({ ...prev, ...patch }))
    if (isElectron) {
      try { await window.electronAPI.setSettings(patch) } catch {}
    } else if (typeof localStorage !== 'undefined') {
      try {
        const current = JSON.parse(localStorage.getItem('voicecraft:settings') || '{}')
        localStorage.setItem('voicecraft:settings', JSON.stringify({ ...DEFAULTS, ...current, ...patch }))
      } catch {}
    }
  }, [isElectron])

  return [settings, update, { loaded, isElectron }]
}
