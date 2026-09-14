/**
 * perfProfile — maps perfMode + hardware probe → tier + budgets.
 *
 * Modes: auto | performance | balanced | economy
 * Tiers:  high | mid | low
 */
import { peekHardwareHint, getCachedHardwareProbe } from './hardwareProbe'

export const PERF_MODES = [
  { id: 'auto', label: 'Auto', hint: 'Escala com o seu PC' },
  { id: 'performance', label: 'Desempenho', hint: 'Mais cache, share e prewarm' },
  { id: 'balanced', label: 'Equilibrado', hint: 'Meio-termo estável' },
  { id: 'economy', label: 'Economia', hint: 'Leve em notebooks fracos' },
]

const BUDGETS = {
  low: {
    imageWarmMax: 24,
    warmConcurrency: 2,
    bootBudgetMs: 6_000,
    bootUrlCap: 20,
    textKeepAlive: 1,
    shareQuality: '540p',
    shareFps: 15,
    videoCodec: 'vp8',
    preferAudioService: false,
    zeroCopy: false,
    appearStagger: 0.02,
    messageWindow: 120,
  },
  mid: {
    imageWarmMax: 48,
    warmConcurrency: 3,
    bootBudgetMs: 9_000,
    bootUrlCap: 36,
    textKeepAlive: 1,
    shareQuality: '720p',
    shareFps: 24,
    videoCodec: 'h264',
    preferAudioService: false,
    zeroCopy: false,
    appearStagger: 0.03,
    messageWindow: 200,
  },
  high: {
    imageWarmMax: 96,
    warmConcurrency: 4,
    bootBudgetMs: 12_000,
    bootUrlCap: 64,
    textKeepAlive: 2,
    shareQuality: '1080p',
    shareFps: 30,
    videoCodec: 'h264',
    preferAudioService: true,
    zeroCopy: true,
    appearStagger: 0.04,
    messageWindow: 320,
  },
}

function modeToTier(perfMode, autoTier) {
  switch (perfMode) {
    case 'performance':
      return 'high'
    case 'economy':
      return 'low'
    case 'balanced':
      return 'mid'
    case 'auto':
    default:
      return autoTier || 'mid'
  }
}

/**
 * Sync resolve using peek/cache — safe during boot before async probe.
 */
export function resolvePerfProfile(perfMode = 'auto') {
  const mode = PERF_MODES.some((m) => m.id === perfMode) ? perfMode : 'auto'
  const cached = getCachedHardwareProbe()
  const hint = peekHardwareHint()
  const autoTier = cached?.autoTier || hint.tierHint || 'mid'
  const tier = modeToTier(mode, autoTier)
  return {
    mode,
    tier,
    autoTier,
    cores: cached?.cores ?? hint.cores,
    ramGb: cached?.ramGb ?? hint.ramGb,
    dedicatedGpu: cached?.dedicatedGpu ?? false,
    gpuLabel: cached?.gpu?.info?.device || null,
    budgets: { ...BUDGETS[tier] },
  }
}

export function getBudgetsForTier(tier) {
  return { ...(BUDGETS[tier] || BUDGETS.mid) }
}
