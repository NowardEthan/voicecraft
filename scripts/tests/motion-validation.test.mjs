import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OVERLAY_LAYERS } from '../../src/shared/motion/layers.js'
import { MOTION_DURATION, MOTION_EASING, MOTION_INTENTS } from '../../src/shared/motion/tokens.js'
import { resolveMotionPolicy, shouldAnimateIntent } from '../../src/shared/motion/policy.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (path) => readFileSync(join(root, path), 'utf8')

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return ['.js', '.jsx', '.css'].includes(extname(entry.name)) ? [target] : []
  })
}

function keyframeBlocks(css) {
  const blocks = []
  const pattern = /@keyframes\s+([\w-]+)\s*\{/g
  let match
  while ((match = pattern.exec(css))) {
    let depth = 1
    let cursor = pattern.lastIndex
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === '{') depth += 1
      if (css[cursor] === '}') depth -= 1
      cursor += 1
    }
    assert.equal(depth, 0, 'unclosed keyframes: ' + match[1])
    blocks.push({ name: match[1], body: css.slice(pattern.lastIndex, cursor - 1) })
    pattern.lastIndex = cursor
  }
  return blocks
}

const AUTHORIZED_CSS_LOOPS = new Set([
  'attention', 'breathe', 'connection-pulse', 'float', 'glow-pulse', 'orb-drift',
  'pulse-dot', 'pulse-ring', 'shimmer', 'sound-wave', 'spin', 'vc-boot-dot',
  'vc-brand-loader', 'vc-card-avatar-glow', 'vc-drop-pulse', 'vc-fx-bit-fall',
  'vc-fx-constellation', 'vc-fx-corner', 'vc-fx-fall', 'vc-fx-flare-pop',
  'vc-fx-glint', 'vc-fx-moon-phase', 'vc-fx-moon-shade', 'vc-fx-orb-breathe',
  'vc-fx-petal', 'vc-fx-pixel-blink', 'vc-fx-rift', 'vc-fx-rise', 'vc-fx-scan',
  'vc-fx-shoot', 'vc-fx-twinkle', 'vc-jump-bounce', 'vc-jump-pulse',
  'vc-speaking-pulse', 'vc-tag-marquee', 'vc-typing-dot', 'vc-typing-wave', 'vc-wave-bar',
])

test('canonical JS and CSS tokens remain aligned and restrained', () => {
  assert.deepEqual(Object.keys(MOTION_INTENTS), ['essential', 'feedback', 'decorative', 'continuous'])
  assert.equal(Math.max(...Object.values(MOTION_DURATION)), 0.22)
  for (const easing of Object.values(MOTION_EASING)) {
    assert.equal(easing.length, 4)
    assert.ok(easing.every(Number.isFinite))
  }
  const css = read('src/shared/motion/motion.css')
  for (const [name, seconds] of Object.entries(MOTION_DURATION)) {
    const milliseconds = name === 'instant' ? 1 : seconds * 1000
    assert.match(css, new RegExp('--vc-motion-duration-' + name + ': ' + milliseconds + 'ms'))
  }
})

test('policy matrix disables continuous motion for reduced, low-tier, and hidden states', () => {
  for (const state of [
    { reducedMotion: true, perfTier: 'high', visible: true },
    { reducedMotion: false, perfTier: 'low', visible: true },
    { reducedMotion: false, perfTier: 'high', visible: false },
  ]) {
    const policy = resolveMotionPolicy(state)
    assert.equal(policy.allowContinuous, false)
    assert.equal(shouldAnimateIntent(policy, MOTION_INTENTS.continuous), false)
  }
  const provider = read('src/shared/motion/MotionPolicyProvider.jsx')
  assert.match(provider, /document\.addEventListener\('visibilitychange', update\)/)
  assert.match(provider, /root\.dataset\.documentVisibility/)
  assert.match(provider, /root\.dataset\.motionContinuous/)
  const css = read('src/shared/motion/motion.css')
  assert.match(css, /data-document-visibility='hidden'[\s\S]*animation-play-state: paused !important/)
  assert.match(css, /data-motion-continuous='off'[\s\S]*data-motion-intent='continuous'[\s\S]*animation: none !important/)
})

test('modal contract keeps stable presence, portal lifecycle, focus trap, and restoration', () => {
  const source = read('src/shared/motion/ModalShell.jsx')
  assert.match(source, /return createPortal\([\s\S]*<AnimatePresence>[\s\S]*\{open && \(/)
  assert.match(source, /role="dialog"[\s\S]*aria-modal="true"/)
  assert.match(source, /modalStack\.push\(id\)/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /event\.target === event\.currentTarget/)
  assert.match(source, /bodyScrollLock\.acquire\(document\)/)
  assert.match(source, /opener\?\.isConnected[\s\S]*opener\.focus\(\)/)
  assert.match(source, /exit: \{ opacity: 0/)
})

test('anchored overlays keep exit presence, stack dismissal, and focus restoration', () => {
  const source = read('src/shared/motion/AnchoredOverlay.jsx')
  assert.match(source, /const presence = \([\s\S]*<AnimatePresence>[\s\S]*\{open && \(/)
  assert.match(source, /createPortal\(presence, document\.body\)/)
  assert.match(source, /overlayStack\.push\(id\)/)
  assert.match(source, /isTopOverlay\(id\)/)
  assert.match(source, /closeRef\.current\?\.\('outside'\)/)
  assert.match(source, /closeRef\.current\?\.\('escape'\)/)
  assert.match(source, /restoreTargetRef\.current[\s\S]*target\?\.isConnected[\s\S]*target\.focus\(\)/)
  assert.match(read('src/shared/motion/overlayPolicy.js'), /exit: Object\.freeze\(\{ opacity: 0/)
})

test('pinned messages guard positioned styles until anchor coordinates exist', () => {
  const source = read('src/features/chat/PinnedMessagesPanel.jsx')
  assert.match(source, /open=\{open && !!pos\}/)
  assert.match(source, /style=\{pos \? \{[\s\S]*top: pos\.top,[\s\S]*left: pos\.left,[\s\S]*width: pos\.width,[\s\S]*\} : undefined\}/)
  assert.doesNotMatch(source, /style=\{\{\s*top: pos\.top/)
})
test('semantic overlay layers match the CSS scale', () => {
  const css = read('src/shared/motion/motion.css')
  const values = Object.values(OVERLAY_LAYERS)
  assert.equal(new Set(values).size, values.length)
  assert.ok(values.every((value, index) => index === 0 || value > values[index - 1]))
  for (const [layer, value] of Object.entries(OVERLAY_LAYERS)) {
    assert.match(css, new RegExp('--vc-z-' + layer + ': ' + value + ';'))
    assert.match(css, new RegExp('\\.vc-layer-' + layer + ' \\{ z-index: var\\(--vc-z-' + layer + '\\)'))
  }
})

test('all keyframes are unique and compositor-safe', () => {
  const cssFiles = sourceFiles(join(root, 'src')).filter((path) => extname(path) === '.css')
  const blocks = cssFiles.flatMap((path) => keyframeBlocks(readFileSync(path, 'utf8')).map((block) => ({ ...block, path })))
  const names = blocks.map(({ name }) => name)
  assert.deepEqual(names.filter((name, index) => names.indexOf(name) !== index), [])
  const layoutProperty = /(?:^|[;{]\s*)(?:top|right|bottom|left|inset|width|height|min-width|max-width|min-height|max-height|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|background-position|stroke-dashoffset)\s*:/m
  for (const { name, body, path } of blocks) {
    assert.doesNotMatch(body, layoutProperty, 'layout property in ' + name + ' (' + relative(root, path) + ')')
  }
})

test('source rejects transition-all and layout-bound motion', () => {
  const files = sourceFiles(join(root, 'src'))
  const source = files.map((path) => readFileSync(path, 'utf8')).join('\n')
  assert.doesNotMatch(source, /\btransition-all\b|transition\s*:\s*all\b/)
  assert.doesNotMatch(source, /animate=\{\{\s*(?:width|height|top|right|bottom|left)\b/)
})

test('continuous CSS and JavaScript loops are explicitly authorized and gated', () => {
  const css = read('src/index.css')
  const loopNames = new Set([...css.matchAll(/animation\s*:\s*([\w-]+)[^;{}]*\binfinite\b/g)].map((match) => match[1]))
  assert.deepEqual([...loopNames].sort(), [...AUTHORIZED_CSS_LOOPS].sort())

  const jsLoops = sourceFiles(join(root, 'src')).filter((path) => /repeat\s*:\s*Infinity/.test(readFileSync(path, 'utf8')))
  assert.deepEqual(jsLoops.map((path) => relative(root, path).replaceAll('\\', '/')).sort(), [
    'src/features/auth/views/LoginScreenVoice.jsx',
    'src/shell/BootSplash.jsx',
  ])
  for (const path of jsLoops) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /useMotionPolicy/)
    assert.match(source, /allowContinuous/)
    for (const match of source.matchAll(/repeat\s*:\s*Infinity/g)) {
      const context = source.slice(Math.max(0, match.index - 220), match.index + 80)
      assert.match(context, /allowContinuous \?/)
    }
  }
})

test('migrated 60 Hz-sensitive flows use transform or opacity contracts', () => {
  const css = read('src/index.css')
  const blocks = new Map(keyframeBlocks(css).map(({ name, body }) => [name, body]))
  for (const name of ['vc-wave-bar', 'sound-wave']) {
    assert.match(blocks.get(name) || '', /transform:\s*scaleY/)
    assert.doesNotMatch(blocks.get(name) || '', /height\s*:/)
  }
  for (const name of ['shimmer', 'vc-fx-fall', 'vc-fx-rise', 'vc-fx-shoot']) {
    assert.match(blocks.get(name) || '', /transform:/)
  }
  assert.match(read('src/shell/BootSplash.jsx'), /animate=\{\{ scaleX: progress \}\}/)
  assert.doesNotMatch(read('src/components/views/MessageList.jsx'), /framer-motion|AnimatePresence|<motion\.|(?:^|\s)layout(?:Id)?=/m)
})
