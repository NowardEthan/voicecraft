/** Performance policy for dynamic collections and decorative card effects. */
export const LIST_STAGGER_LIMIT = 8

const CARD_THEME_PARTICLE_BUDGETS = Object.freeze({
  high: Object.freeze({
    compact: Object.freeze({ p: 7, shoot: 1, mote: 5, ember: 8, bit: 4, glint: 4 }),
    full: Object.freeze({ p: 16, shoot: 3, mote: 14, ember: 16, bit: 10, glint: 8 }),
  }),
  mid: Object.freeze({
    compact: Object.freeze({ p: 4, shoot: 1, mote: 3, ember: 5, bit: 3, glint: 2 }),
    full: Object.freeze({ p: 9, shoot: 1, mote: 8, ember: 9, bit: 6, glint: 4 }),
  }),
})

export function resolveDynamicListMotion(itemCount, {
  stagger = 0.03,
  delayChildren = 0.02,
  reducedMotion = false,
  perfTier = 'mid',
  visible = true,
} = {}) {
  const count = Math.max(0, Number(itemCount) || 0)
  const enabled = visible !== false && !reducedMotion && perfTier !== 'low'
  const staggerChildren = enabled && count <= LIST_STAGGER_LIMIT
    ? Math.min(Math.max(0, Number(stagger) || 0), 0.04)
    : 0
  return Object.freeze({
    enabled,
    staggerChildren,
    delayChildren: staggerChildren > 0 ? Math.min(Math.max(0, Number(delayChildren) || 0), 0.12) : 0,
  })
}

export function resolveCardThemeFxBudget({
  perfTier = 'mid',
  compact = false,
  allowDecorative = true,
} = {}) {
  if (!allowDecorative || perfTier === 'low') return null
  const tier = perfTier === 'high' ? 'high' : 'mid'
  return CARD_THEME_PARTICLE_BUDGETS[tier][compact ? 'compact' : 'full']
}
