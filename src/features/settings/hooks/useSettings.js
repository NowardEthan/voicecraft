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
  // Performance profile — auto scales budgets to this machine.
  // Chromium switches that depend on tier need an app restart.
  perfMode: 'auto', // auto | performance | balanced | economy
  // Dev overlay: FPS + RSS + tier (Aplicativo → avançado)
  perfHud: false,
  // Cached Auto tier for next-launch Chromium switches (zero-copy)
  lastPerfTier: null,
  // Use the C++ audio-service child process for mic capture instead of the
  // browser's getUserMedia. Requires the binary to be built
  // (`cmake --build build` in audio-service/).
  useAudioService: false,
  startMinimized: false,
}

/** Shared store so every useSettings() sees the same patch (perfMode, etc.). */
let sharedSettings = { ...SETTINGS_DEFAULTS }
const listeners = new Set()
let loadPromise = null

function emitSettings(next) {
  sharedSettings = next
  if (typeof window !== 'undefined') {
    window.__vcPerfMode = next.perfMode || 'auto'
  }
  for (const fn of listeners) {
    try { fn(next) } catch { /* ignore */ }
  }
}

function ensureLoaded(isElectron) {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    let initial = SETTINGS_DEFAULTS
    if (isElectron) {
      try { initial = await window.electronAPI.getSettings() } catch { /* ignore */ }
    } else if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('voicecraft:settings')
        if (raw) initial = { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) }
      } catch { /* ignore */ }
    }
    emitSettings({ ...SETTINGS_DEFAULTS, ...initial })
    return sharedSettings
  })()
  return loadPromise
}

/**
 * Tiny settings hook. Reads from electronAPI (when available, e.g. Electron)
 * on mount and exposes a setter that persists through IPC. When running in a
 * plain browser (no electronAPI), it falls back to localStorage so dev
 * iteration on http://localhost:5183 still works.
 */
export function useSettings() {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI

  const [settings, setSettings] = useState(() => sharedSettings)
  const [loaded, setLoaded] = useState(() => loadPromise != null)

  useEffect(() => {
    listeners.add(setSettings)
    let cancelled = false
    ensureLoaded(isElectron).then(() => {
      if (!cancelled) {
        setSettings(sharedSettings)
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
      listeners.delete(setSettings)
    }
  }, [isElectron])

  const update = useCallback(async (patch) => {
    const next = { ...sharedSettings, ...patch }
    emitSettings(next)
    if (isElectron) {
      try { await window.electronAPI.setSettings(patch) } catch { /* ignore */ }
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('voicecraft:settings', JSON.stringify(next))
      } catch { /* ignore */ }
    }
  }, [isElectron])

  return [settings, update, { loaded, isElectron }]
}
