import test from 'node:test'
import assert from 'node:assert/strict'
import { MOTION_INTENTS } from '../../src/shared/motion/tokens.js'
import {
  normalizeMotionIntent,
  normalizePerfTier,
  resolveMotionPolicy,
  shouldAnimateIntent,
} from '../../src/shared/motion/policy.js'

test('full policy allows every motion intent', () => {
  const policy = resolveMotionPolicy({ reducedMotion: false, perfTier: 'high', visible: true })
  for (const intent of Object.values(MOTION_INTENTS)) {
    assert.equal(shouldAnimateIntent(policy, intent), true)
  }
  assert.equal(policy.level, 'full')
})

test('low tier keeps feedback but disables decorative and continuous motion', () => {
  const policy = resolveMotionPolicy({ perfTier: 'low' })
  assert.equal(policy.allowEssential, true)
  assert.equal(policy.allowFeedback, true)
  assert.equal(policy.allowDecorative, false)
  assert.equal(policy.allowContinuous, false)
  assert.equal(policy.level, 'reduced')
})

test('OS reduced motion disables decorative and continuous intents', () => {
  const policy = resolveMotionPolicy({ reducedMotion: true, perfTier: 'high', visible: true })
  assert.equal(shouldAnimateIntent(policy, MOTION_INTENTS.essential), true)
  assert.equal(shouldAnimateIntent(policy, MOTION_INTENTS.feedback), true)
  assert.equal(shouldAnimateIntent(policy, MOTION_INTENTS.decorative), false)
  assert.equal(shouldAnimateIntent(policy, MOTION_INTENTS.continuous), false)
  assert.equal(policy.level, 'reduced')
})

test('hidden documents disable all motion intents', () => {
  const policy = resolveMotionPolicy({ visible: false, perfTier: 'high' })
  for (const intent of Object.values(MOTION_INTENTS)) {
    assert.equal(shouldAnimateIntent(policy, intent), false)
  }
})

test('invalid values use conservative defaults', () => {
  assert.equal(normalizePerfTier('ultra'), 'mid')
  assert.equal(normalizeMotionIntent('unknown'), MOTION_INTENTS.decorative)
})
