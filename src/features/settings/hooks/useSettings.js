import { useEffect, useState, useCallback } from 'react'

export const SETTINGS_DEFAULTS = {
  microphoneId: null,
  speakerId: null,
  outputVolume: 80,
  dspLevel: 'off',
  // Light defaults — screen encode fights the game for CPU even with GPU UI accel.
  screenQuality: '720p',
  screenFramerate: 15,
  screenWithAudio: false,
  // Soft UI chimes for join/leave/mute in voice rooms
  callSounds: true,
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

  const [settings, setSettings] = useState(SETTINGS_DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let initial = SETTINGS_DEFAULTS
      if (isElectron) {
        try { initial = await window.electronAPI.getSettings() } catch {}
      } else if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem('voicecraft:settings')
          if (raw) initial = { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) }
        } catch {}
      }
      if (!cancelled) {
        setSettings({ ...SETTINGS_DEFAULTS, ...initial })
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
        localStorage.setItem('voicecraft:settings', JSON.stringify({ ...SETTINGS_DEFAULTS, ...current, ...patch }))
      } catch {}
    }
  }, [isElectron])

  return [settings, update, { loaded, isElectron }]
}
