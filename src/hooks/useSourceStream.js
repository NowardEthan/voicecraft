import { useEffect, useState } from 'react'

/**
 * useSourceStream — acquires a live MediaStream for the given Electron
 * desktopCapturer source ID while `active` is true. Cleans up on deactivation
 * and on unmount, so we never leak streams.
 *
 * Falls back gracefully: if getUserMedia fails (permission, source busy),
 * returns null and the caller can show the static thumbnail instead.
 */
export function useSourceStream(sourceId, active) {
  const [stream, setStream] = useState(null)

  useEffect(() => {
    if (!active || !sourceId) {
      setStream(null)
      return
    }

    let cancelled = false
    let acquired = null

    navigator.mediaDevices
      .getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: 540,
            maxHeight: 304,
            maxFrameRate: 30,
          },
        },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        acquired = s
        setStream(s)
      })
      .catch((err) => {
        console.warn('[useSourceStream] failed for', sourceId, err?.message || err)
      })

    return () => {
      cancelled = true
      if (acquired) {
        acquired.getTracks().forEach((t) => t.stop())
      }
      setStream(null)
    }
  }, [sourceId, active])

  return stream
}
