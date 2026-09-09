// scripts/rewrite-imports.mjs
// One-shot migration: rewrites import paths after the feature-folder
// reorganisation. Idempotent — re-running on already-migrated files is a
// no-op. Run from src/.

import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve('src')

// map: regex (matched against the path string in `from '...'`) → new path
const REPLACEMENTS = [
  // utils/ that became features/*/model/*
  { from: /(['"])(?:\.\.\/)+(?:utils|features\/\w+\/model)\/(spaceTokens)(\.js?)?\1/g,
    to:   (_m, q) => `${q}../../features/spaces/model/spaceTokens${q.includes('.js') ? '.js' : q.includes('.jsx') ? '.jsx' : ''}${q}` },
  // Generic catch: utils/spaceIcons, utils/roomPurposes, utils/network, utils/settings, utils/signalingClient
]

// Simpler approach: exact token replacements scoped to the from-string.
const STRING_REPLACEMENTS = [
  // utils
  ['../../utils/spaceTokens',          '../../features/spaces'],
  ['../../utils/spaceIcons.jsx',       '../../features/spaces'],
  ['../../utils/spaceIcons',           '../../features/spaces'],
  ['../../utils/roomPurposes.js',      '../../features/rooms'],
  ['../../utils/roomPurposes',         '../../features/rooms'],
  ['../../utils/settings',             '../../features/settings'],
  ['../../utils/network',              '../../shared/utils/network'],
  ['../../utils/signalingClient',      '../../shared/connection/signalingClient'],
  // motion
  ['../../motion/ModalShell.jsx',      '../../shared/motion/ModalShell.jsx'],
  ['../../motion/Motion.jsx',          '../../shared/motion/Motion.jsx'],
  ['../../motion/presets.js',          '../../shared/motion/presets.js'],
  ['../../motion/ModalShell',          '../../shared/motion/ModalShell'],
  ['../../motion/presets',             '../../shared/motion/presets'],
  // hooks
  ['../../hooks/useProfilePopover',    '../../features/people'],
  ['../../hooks/useFocusTrap',         '../../shared/hooks/useFocusTrap'],
  ['../hooks/useProfilePopover',       '../features/people'],
  ['../hooks/useFocusTrap',            '../shared/hooks/useFocusTrap'],
  // components
  ['../../components/people/ProfilePopover', '../../features/people'],
  ['../../components/SettingsModal',          '../../features/settings'],
  ['../../components/ui/EmptyState',          '../../shared/ui/EmptyState'],
  ['../../components/ui/InviteModal',         '../../shared/ui/InviteModal'],
  // One-level-up patterns
  ['../utils/spaceTokens',             '../features/spaces'],
  ['../utils/spaceIcons',              '../features/spaces'],
  ['../utils/roomPurposes',            '../features/rooms'],
  ['../utils/settings',                '../features/settings'],
  ['../utils/network',                 '../shared/utils/network'],
  ['../utils/signalingClient',         '../shared/connection/signalingClient'],
  ['../motion/ModalShell',             '../shared/motion/ModalShell'],
  ['../motion/Motion',                 '../shared/motion/Motion'],
  ['../motion/presets',                '../shared/motion/presets'],
  ['../hooks/useProfilePopover',       '../features/people'],
  ['../hooks/useFocusTrap',            '../shared/hooks/useFocusTrap'],
  ['../components/SettingsModal',      '../features/settings'],
  ['../components/ui/EmptyState',      '../shared/ui/EmptyState'],
  ['../components/people/ProfilePopover', '../features/people'],
  // same-level
  ['./utils/spaceTokens',              './features/spaces'],
  ['./utils/spaceIcons',               './features/spaces'],
  ['./utils/roomPurposes',             './features/rooms'],
  ['./utils/settings',                 './features/settings'],
  ['./utils/network',                  './shared/utils/network'],
  ['./utils/signalingClient',          './shared/connection/signalingClient'],
  ['./motion/ModalShell',              './shared/motion/ModalShell'],
  ['./motion/Motion',                  './shared/motion/Motion'],
  ['./motion/presets',                 './shared/motion/presets'],
  ['./hooks/useProfilePopover',        './features/people'],
  ['./hooks/useFocusTrap',             './shared/hooks/useFocusTrap'],
  ['./components/SettingsModal',       './features/settings'],
  ['./components/ui/EmptyState',       './shared/ui/EmptyState'],
  ['./components/people/ProfilePopover', './features/people'],
]

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules') continue
      // Skip the new feature-folder + shared + shell trees — their
      // index.js barrels and inter-feature imports were written by hand
      // and the bulk rewriter would corrupt them.
      if (['features', 'shared', 'shell'].includes(ent.name)) continue
      walk(p, out)
    } else if (/\.(jsx?|tsx?)$/.test(ent.name)) {
      out.push(p)
    }
  }
  return out
}

let totalChanged = 0
let totalFiles = 0
for (const file of walk(SRC)) {
  const original = fs.readFileSync(file, 'utf8')
  let updated = original
  for (const [from, to] of STRING_REPLACEMENTS) {
    // match both `from 'X'` and `from "X"`, with or without extension
    const re = new RegExp(`(from\\s+['"])(${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(['"])`, 'g')
    updated = updated.replace(re, `$1${to}$3`)
  }
  if (updated !== original) {
    fs.writeFileSync(file, updated, 'utf8')
    totalChanged++
    console.log('rewrote', path.relative(SRC, file))
  }
  totalFiles++
}
console.log(`\n${totalChanged} of ${totalFiles} files changed`)
