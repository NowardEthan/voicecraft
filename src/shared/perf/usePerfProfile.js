/**
 * usePerfProfile — reactive tier + budgets from settings + hardware probe.
 */
import { useEffect, useState } from 'react'
import { useSettings } from '../../features/settings'
import { probeHardware } from './hardwareProbe'
import { resolvePerfProfile } from './perfProfile'
import { setImageWarmPerfMode } from '../media/imageWarm'

export function usePerfProfile() {
  const [settings, updateSettings] = useSettings()
  const [profile, setProfile] = useState(() => resolvePerfProfile(settings?.perfMode || 'auto'))

  useEffect(() => {
    let cancelled = false
    const mode = settings?.perfMode || 'auto'
    setImageWarmPerfMode(mode)
    setProfile(resolvePerfProfile(mode))
    probeHardware().then((probe) => {
      if (cancelled) return
      setProfile(resolvePerfProfile(mode))
      const tier = probe?.autoTier
      if (tier && settings?.lastPerfTier !== tier) {
        updateSettings?.({ lastPerfTier: tier })
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-probe on mode change
  }, [settings?.perfMode])

  return profile
}

export { resolvePerfProfile, PERF_MODES } from './perfProfile'
