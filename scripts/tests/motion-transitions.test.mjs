import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDisclosureTransition, resolveDrawerTransition, resolveTabTransition, resolveViewTransition } from '../../src/shared/motion/transitionPolicy.js'

test('view transitions are subtle and fast', () => {
  const hidden = resolveViewTransition(false, false)
  const visible = resolveViewTransition(true, false)
  assert.equal(hidden.target.opacity, 0)
  assert.ok(Math.abs(hidden.target.y) <= 6)
  assert.equal(visible.target.y, 0)
  assert.ok(visible.transition.duration <= 0.2)
})

test('drawer exits preserve direction and reduced motion removes transforms', () => {
  const left = resolveDrawerTransition('left', false)
  const right = resolveDrawerTransition('right', false)
  assert.ok(left.initial.x < 0)
  assert.ok(right.initial.x > 0)
  assert.ok(Math.abs(left.exit.x) < Math.abs(left.initial.x))
  const reduced = resolveDrawerTransition('right', true)
  assert.equal('x' in reduced.initial, false)
  assert.ok(reduced.transition.duration <= 0.1)
})

test('tab and disclosure policies stay fast', () => {
  assert.ok(resolveTabTransition(false).transition.duration <= 0.14)
  assert.ok(resolveDisclosureTransition(false).duration <= 0.2)
  assert.equal(resolveDisclosureTransition(true).duration, 0)
})