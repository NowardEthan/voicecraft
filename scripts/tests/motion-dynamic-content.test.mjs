import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LIST_STAGGER_LIMIT,
  resolveCardThemeFxBudget,
  resolveDynamicListMotion,
} from '../../src/shared/motion/dynamicPolicy.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (relative) => readFileSync(join(root, relative), 'utf8')

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return ['.js', '.jsx', '.css'].includes(extname(entry.name)) ? [target] : []
  })
}

test('dynamic lists stagger only small visible collections', () => {
  const small = resolveDynamicListMotion(LIST_STAGGER_LIMIT, {
    stagger: 0.2,
    delayChildren: 0.5,
    perfTier: 'high',
  })
  assert.equal(small.enabled, true)
  assert.equal(small.staggerChildren, 0.04)
  assert.equal(small.delayChildren, 0.12)

  assert.equal(resolveDynamicListMotion(LIST_STAGGER_LIMIT + 1, { perfTier: 'high' }).staggerChildren, 0)
  assert.equal(resolveDynamicListMotion(3, { perfTier: 'low' }).staggerChildren, 0)
  assert.equal(resolveDynamicListMotion(3, { reducedMotion: true }).staggerChildren, 0)
  assert.equal(resolveDynamicListMotion(3, { visible: false }).staggerChildren, 0)
})

test('card theme particle budgets scale down and fail closed', () => {
  const high = resolveCardThemeFxBudget({ perfTier: 'high' })
  const mid = resolveCardThemeFxBudget({ perfTier: 'mid' })
  const compact = resolveCardThemeFxBudget({ perfTier: 'high', compact: true })
  for (const key of Object.keys(high)) {
    assert.ok(mid[key] <= high[key], key)
    assert.ok(compact[key] <= high[key], key)
  }
  assert.equal(resolveCardThemeFxBudget({ perfTier: 'low' }), null)
  assert.equal(resolveCardThemeFxBudget({ allowDecorative: false }), null)
})

test('chat window stays outside layout animation', () => {
  const source = read('src/components/views/MessageList.jsx')
  assert.match(source, /data-motion-layout="static"/)
  assert.match(source, /data-motion-policy="static-window"/)
  assert.match(source, /preservePositionRef/)
  assert.match(source, /scrollTop \+= target\.getBoundingClientRect\(\)\.top - preserved\.top/)
  assert.doesNotMatch(source, /framer-motion|AnimatePresence|<motion\.|(?:^|\s)layout(?:Id)?=/m)
})

test('card effects use policy gates and viewport pausing', () => {
  const source = read('src/features/account/components/CardThemeFx.jsx')
  assert.match(source, /useMotionPolicy/)
  assert.match(source, /resolveCardThemeFxBudget/)
  assert.match(source, /IntersectionObserver/)
  assert.match(source, /data-motion-paused/)
  assert.match(source, /data-motion-intent="continuous"/)
})

test('source rejects broad and layout-bound animation regressions', () => {
  const files = sourceFiles(join(root, 'src'))
  const source = files.map((target) => readFileSync(target, 'utf8')).join('\n')
  assert.doesNotMatch(source, /\btransition-all\b|transition\s*:\s*all\b/)
  assert.doesNotMatch(source, /animate=\{\{\s*width\b|transition-\[width\]/)
  const willChangeValues = [...source.matchAll(/will-change\s*:\s*([^;}\n]+)/g)].map((match) => match[1].trim())
  assert.deepEqual([...new Set(willChangeValues)], ['auto'])

  const css = read('src/index.css')
  assert.equal((css.match(/animation-duration:\s*0\.001ms\s*!important/g) || []).length, 1)
  assert.doesNotMatch(css, /@keyframes\s+vc-fx-[^{]+\{[^}]*\b(?:top|right|bottom|left|width|height|background-position|stroke-dashoffset)\s*:/s)
  assert.doesNotMatch(css, /@keyframes\s+(?:sound-wave|vc-wave-bar)[^{]+\{[^}]*\bheight\s*:/s)

  const names = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1])
  assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), [])
})
