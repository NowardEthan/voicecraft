/**
 * PerfHud — optional FPS / RSS / tier overlay (settings → perfHud).
 */
import { useEffect, useState } from 'react'
import { useSettings } from '../../features/settings'
import { usePerfProfile } from './usePerfProfile'
import { imageWarmSize } from '../media/imageWarm'

export default function PerfHud() {
  const [settings] = useSettings()
  const profile = usePerfProfile()
  const [fps, setFps] = useState(0)
  const [rssMb, setRssMb] = useState(null)

  useEffect(() => {
    if (!settings?.perfHud) return undefined
    let frames = 0
    let last = performance.now()
    let raf = 0
    const tick = (now) => {
      frames += 1
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [settings?.perfHud])

  useEffect(() => {
    if (!settings?.perfHud) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const snap = await window.electronAPI?.getPerfSnapshot?.()
        if (cancelled || !snap?.ok) return
        const wb = snap.memory?.workingSetSize
        if (typeof wb === 'number') setRssMb(Math.round(wb / 1024))
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [settings?.perfHud])

  if (!settings?.perfHud) return null

  return (
    <div
      className="fixed bottom-3 right-3 z-[9999] pointer-events-none select-none
        rounded-lg border border-white/15 bg-black/70 px-2.5 py-1.5
        font-mono text-[10px] leading-relaxed text-white/90 shadow-lg"
      aria-hidden
    >
      <div>{fps} fps · tier {profile.tier} ({profile.mode})</div>
      <div>
        {rssMb != null ? `${rssMb} MB RSS` : '— MB'}
        {' · '}
        warm {imageWarmSize()}/{profile.budgets.imageWarmMax}
      </div>
    </div>
  )
}
