import { MOTION_INTENTS } from './tokens.js'

const PERF_TIERS = new Set(['low', 'mid', 'high'])
const INTENTS = new Set(Object.values(MOTION_INTENTS))

export function normalizePerfTier(tier) {
  return PERF_TIERS.has(tier) ? tier : 'mid'
}

export function normalizeMotionIntent(intent) {
  // Unknown intents fail closed so new effects are not enabled accidentally.
  return INTENTS.has(intent) ? intent : MOTION_INTENTS.decorative
}

export function resolveMotionPolicy({
  reducedMotion = false,
  perfTier = 'mid',
  visible = true,
} = {}) {
  const tier = normalizePerfTier(perfTier)
  const isDocumentVisible = visible !== false
  const reduced = Boolean(reducedMotion)
  const allowFeedback = isDocumentVisible
  const allowDecorative = isDocumentVisible && !reduced && tier !== 'low'

  return Object.freeze({
    reducedMotion: reduced,
    perfTier: tier,
    isDocumentVisible,
    allowEssential: isDocumentVisible,
    allowFeedback,
    allowDecorative,
    allowContinuous: allowDecorative,
    level: !isDocumentVisible ? 'off' : reduced || tier === 'low' ? 'reduced' : 'full',
  })
}

export function shouldAnimateIntent(policy, intent) {
  switch (normalizeMotionIntent(intent)) {
    case MOTION_INTENTS.essential:
      return policy.allowEssential
    case MOTION_INTENTS.feedback:
      return policy.allowFeedback
    case MOTION_INTENTS.continuous:
      return policy.allowContinuous
    case MOTION_INTENTS.decorative:
    default:
      return policy.allowDecorative
  }
}
