import { useEffect, useRef, useState } from 'react'

const ATTACK_FRAMES = 5
const RELEASE_MS = 520
const NOISE_MIN = 0.012
const NOISE_MAX = 0.065

function readLevel(source) {
  if (source && typeof source === 'object' && 'current' in source) {
    return Number(source.current) || 0
  }
  return Number(source) || 0
}

/**
 * Turns a raw VU level into a stable speaking flag.
 * Accepts a number or a ref so the analyser can update without React state.
 */
export function useSpeakingDetector(inputLevel, { muted = false } = {}) {
  const [speaking, setSpeaking] = useState(false)
  const fallbackRef = useRef(0)
  const stateRef = useRef({
    speaking: false,
    noise: 0.02,
    above: 0,
    quietAt: 0,
  })

  if (!(inputLevel && typeof inputLevel === 'object' && 'current' in inputLevel)) {
    fallbackRef.current = Number(inputLevel) || 0
  }

  useEffect(() => {
    let raf = 0
    const source = (inputLevel && typeof inputLevel === 'object' && 'current' in inputLevel)
      ? inputLevel
      : fallbackRef

    const tick = () => {
      const s = stateRef.current
      const level = readLevel(source)

      if (muted) {
        s.above = 0
        s.quietAt = 0
        if (s.speaking) {
          s.speaking = false
          setSpeaking(false)
        }
        raf = requestAnimationFrame(tick)
        return
      }

      if (!s.speaking || level < s.noise * 2.4) {
        s.noise = s.noise * 0.996 + level * 0.004
      }
      s.noise = Math.min(NOISE_MAX, Math.max(NOISE_MIN, s.noise))

      const startAt = s.noise + 0.036
      const stopAt = s.noise + 0.014

      if (level >= startAt) {
        s.above += 1
        s.quietAt = 0
        if (!s.speaking && s.above >= ATTACK_FRAMES) {
          s.speaking = true
          setSpeaking(true)
        }
      } else {
        s.above = 0
        if (s.speaking && level <= stopAt) {
          if (!s.quietAt) s.quietAt = performance.now()
          else if (performance.now() - s.quietAt >= RELEASE_MS) {
            s.speaking = false
            s.quietAt = 0
            setSpeaking(false)
          }
        } else if (s.speaking) {
          s.quietAt = 0
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [muted, inputLevel])

  return speaking
}
