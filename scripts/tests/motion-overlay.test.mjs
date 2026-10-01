import test from 'node:test'
import assert from 'node:assert/strict'
import { OVERLAY_LAYERS, overlayLayerVar } from '../../src/shared/motion/layers.js'
import { resolveOverlayMotion } from '../../src/shared/motion/overlayPolicy.js'
import { createBodyScrollLock } from '../../src/shared/motion/scrollLock.js'

test('overlay layers remain strictly ordered', () => {
  assert.deepEqual(Object.keys(OVERLAY_LAYERS), ['drawer', 'popover', 'tooltip', 'modal', 'toast'])
  const values = Object.values(OVERLAY_LAYERS)
  assert.equal(values.every((value, index) => index === 0 || value > values[index - 1]), true)
  assert.equal(overlayLayerVar('unknown'), 'var(--vc-z-popover)')
})

test('overlay motion uses restrained travel and shorter exits', () => {
  const motion = resolveOverlayMotion('top', false)
  assert.equal(motion.initial.y, 6)
  assert.equal(motion.animate.y, 0)
  assert.ok(motion.animate.transition.duration <= 0.24)
  assert.ok(motion.exit.transition.duration < motion.animate.transition.duration)
  assert.ok(Math.abs(motion.exit.y) <= 4)
})

test('reduced overlay motion removes transforms', () => {
  const motion = resolveOverlayMotion('right', true)
  assert.deepEqual(motion.initial, { opacity: 0 })
  assert.equal('x' in motion.animate, false)
  assert.equal(motion.exit.transition.duration, 0.08)
})

test('body scroll lock is reference counted and restores inline styles', () => {
  const body = { style: { overflow: 'auto', paddingRight: '3px' }, dataset: {} }
  const doc = {
    body,
    documentElement: { clientWidth: 980 },
    defaultView: { innerWidth: 1000, getComputedStyle: () => ({ paddingRight: '3px' }) },
  }
  const lock = createBodyScrollLock()
  const releaseA = lock.acquire(doc)
  const releaseB = lock.acquire(doc)
  assert.equal(lock.count, 2)
  assert.equal(body.style.overflow, 'hidden')
  assert.equal(body.style.paddingRight, '23px')
  releaseA()
  assert.equal(body.style.overflow, 'hidden')
  releaseA()
  assert.equal(lock.count, 1)
  releaseB()
  assert.equal(lock.count, 0)
  assert.equal(body.style.overflow, 'auto')
  assert.equal(body.style.paddingRight, '3px')
})