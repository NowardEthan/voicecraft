/**
 * telemetry.js — performance monitoring and longtask tracking.
 * Zero network: no fetch, sendBeacon or XMLHttpRequest.
 * Maintains a circular buffer of the last 50 longtask entries.
 */

const MAX_LONGTASKS = 50

if (typeof window !== 'undefined') {
  window.__VOICE_PERF__ = window.__VOICE_PERF__ || {}
  if (!Array.isArray(window.__VOICE_PERF__.longtasks)) {
    window.__VOICE_PERF__.longtasks = []
  }
}

let observer = null

export function initTelemetry() {
  if (typeof window === 'undefined') return
  if (observer) return

  window.__VOICE_PERF__ = window.__VOICE_PERF__ || {}
  if (!Array.isArray(window.__VOICE_PERF__.longtasks)) {
    window.__VOICE_PERF__.longtasks = []
  }

  if (typeof PerformanceObserver === 'undefined') {
    return
  }

  try {
    const supportedTypes = PerformanceObserver.supportedEntryTypes || []
    if (!supportedTypes.includes('longtask')) {
      return
    }

    observer = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      for (const entry of entries) {
        const item = {
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
          attribution: entry.attribution ? JSON.parse(JSON.stringify(entry.attribution)) : [],
        }

        const buf = window.__VOICE_PERF__.longtasks
        buf.push(item)
        if (buf.length > MAX_LONGTASKS) {
          buf.shift()
        }

        console.info(`[voice-perf] longtask detected: ${entry.duration.toFixed(1)}ms`)
      }
    })

    observer.observe({ entryTypes: ['longtask'] })
  } catch (err) {
    console.info('[voice-perf] PerformanceObserver error:', err)
  }
}

export function getLongTasks() {
  if (typeof window === 'undefined' || !window.__VOICE_PERF__) return []
  return [...(window.__VOICE_PERF__.longtasks || [])]
}

export function clearLongTasks() {
  if (typeof window !== 'undefined' && window.__VOICE_PERF__) {
    window.__VOICE_PERF__.longtasks = []
  }
}
