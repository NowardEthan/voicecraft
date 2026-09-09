/**
 * Singleton cache for the local MediaStream so HMR re-mounts and React
 * StrictMode double-invocations don't trigger repeated getUserMedia prompts.
 *
 * On `acquire`, returns the cached stream if it's still active. Otherwise
 * creates a new one. Concurrent requests share the same in-flight promise.
 *
 * Also handles Vite HMR cleanup so we don't leave handles stuck on the OS side.
 */

let cached = null
let inflight = null

export function acquireLocalMedia(constraints) {
  // If the cached stream is gone (tracks stopped by HMR or by the OS), clear it.
  if (cached && !cached.active) {
    cached = null
  }
  if (cached) return Promise.resolve(cached)
  if (inflight) return inflight

  inflight = navigator.mediaDevices
    .getUserMedia(constraints)
    .then((stream) => {
      cached = stream
      inflight = null
      stream.getVideoTracks().forEach((t) =>
        t.addEventListener('ended', () => {
          if (cached === stream) cached = null
        })
      )
      return stream
    })
    .catch((err) => {
      inflight = null
      throw err
    })

  return inflight
}

export function releaseLocalMedia() {
  if (cached) {
    cached.getTracks().forEach((t) => t.stop())
    cached = null
  }
}

// Vite HMR: when this module is replaced, stop any active tracks so the OS
// releases the camera/mic before the new module instance asks for them again.
if (typeof import.meta !== 'undefined' && import.meta.hot) {
  import.meta.hot.dispose(() => {
    releaseLocalMedia()
  })
}

export function getCachedStream() {
  return cached && cached.active ? cached : null
}
