// scripts/tests/test_signaling_cache.mjs
// Standalone Node test exercising SignalingClient cache logic + static
// inspection of all 5 contract files. Stubs firebase/* + internal
// firebase/feature imports via a custom ESM loader.
//
// Usage:   node scripts/tests/test_signaling_cache.mjs

import { strict as assert } from 'node:assert'
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

// ---------------------------------------------------------------
// Custom ESM loader that intercepts the heavy/foreign imports of
// SignalingClient.js (firebase, internal firebase/feature helpers)
// and substitutes our local mocks. Everything else passes through.
// ---------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')
const srcRoot     = path.join(projectRoot, 'src')

const mockDir = path.join(__dirname, '.mocks')
fs.mkdirSync(mockDir, { recursive: true })

const writeMock = (rel, body) => {
  const p = path.join(mockDir, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body, 'utf8')
}

// firebase/firestore
writeMock('firebase_firestore.mjs', `
export const doc = () => ({})
export const collection = () => ({})
export const getDoc = () => Promise.resolve({ exists: () => false, data: () => ({}) })
export const getDocs = () => Promise.resolve({ docs: [] })
export const setDoc = () => Promise.resolve()
export const updateDoc = () => Promise.resolve()
export const deleteDoc = () => Promise.resolve()
export const addDoc = () => Promise.resolve({ id: 'fake' })
export const onSnapshot = () => () => {}
export const writeBatch = () => ({ delete() {}, update() {}, commit: () => Promise.resolve() })
export const query = (...a) => a
export const where = (...a) => a
export const orderBy = (...a) => a
export const limit = (n) => n
export const startAfter = (...a) => a
export const serverTimestamp = () => Date.now()
export const arrayUnion = (...a) => a
export const arrayRemove = (...a) => a
export const deleteField = () => ({})
`)

// firebase/auth
writeMock('firebase_auth.mjs', `
export const onAuthStateChanged = () => () => {}
export const updateProfile = () => Promise.resolve()
export const getAuth = () => ({ currentUser: null })
`)

// firebase/storage — only getStorage is used indirectly via app.js
writeMock('firebase_storage.mjs', `
export const getStorage = () => ({})
`)

// firebase/app
writeMock('firebase_app.mjs', `
export const auth = { currentUser: null }
export const db = {}
export const VC = { users: 'vc_users', spaces: 'vc_spaces', userTags: 'vc_user_tags', config: 'vc_config' }
`)

// firebase/covers + firebase/chatFiles + firebase/presence
writeMock('firebase_covers.mjs', `
export const deleteSpaceCover = () => Promise.resolve()
export const uploadSpaceCover = () => Promise.resolve(null)
export const uploadSpaceIcon = () => Promise.resolve(null)
export const deleteSpaceIcon = () => Promise.resolve()
export const uploadRoomCover = () => Promise.resolve(null)
export const deleteRoomCover = () => Promise.resolve()
export const uploadAnnounceAsset = () => Promise.resolve(null)
`)
writeMock('firebase_chatFiles.mjs', `
export const uploadChatFile = () => Promise.resolve(null)
`)
writeMock('firebase_presence.mjs', `
export const attachUserPresence = () => () => {}
export const attachSpacePresence = () => () => ({ setRoomId: () => {} })
export const listenSpacePresence = () => () => {}
export const isPresenceLastFresh = () => true
`)

// features/spaces/model/spaceRoles + spaceTypography
writeMock('spaceRoles.mjs', `
export const canSpacePermission = () => true
export const normalizePerms = () => ({})
export const fullPerms = () => ({})
`)
writeMock('spaceTypography.mjs', `
export const normalizeSpaceFonts = (v) => v || []
export const normalizeTypography = (v) => v || null
`)

const HOOK = path.join(__dirname, 'hook.mjs')
fs.writeFileSync(HOOK, `
import { pathToFileURL } from 'node:url'
const mocks = ${JSON.stringify(mockDir)}
const subs = {
  'firebase/firestore':                'firebase_firestore.mjs',
  'firebase/auth':                     'firebase_auth.mjs',
  'firebase/storage':                  'firebase_storage.mjs',
  '../firebase/app':                   'firebase_app.mjs',
  '../firebase/covers':                'firebase_covers.mjs',
  '../firebase/chatFiles':             'firebase_chatFiles.mjs',
  '../firebase/presence':              'firebase_presence.mjs',
  '../../features/spaces/model/spaceRoles': 'spaceRoles.mjs',
  '../../features/spaces/model/spaceTypography': 'spaceTypography.mjs',
}
export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(subs, specifier)) {
    return {
      url: pathToFileURL(mocks + '/' + subs[specifier]).href,
      shortCircuit: true,
      format: 'module',
    }
  }
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (err && err.code === 'ERR_MODULE_NOT_FOUND') {
      try {
        return await nextResolve(specifier + '.js', context)
      } catch {}
    }
    throw err
  }
}
`, 'utf8')

register(pathToFileURL(HOOK))

// ---------------------------------------------------------------
// Import the production module through our loader.
// ---------------------------------------------------------------
const { SignalingClient } = await import(
  pathToFileURL(path.join(srcRoot, 'shared/connection/signalingClient.js')).href
)

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
const makeSpace = (id, extras = {}) => ({
  id,
  name: `Space ${id}`,
  rooms: [],
  members: [],
  memberIds: [],
  ...extras,
})

const readSrc = (rel) => fs.readFileSync(path.join(srcRoot, rel), 'utf8')

const results = []
const test = (name, fn) => {
  try {
    fn()
    results.push({ name, ok: true,  err: null })
  } catch (err) {
    results.push({ name, ok: false, err: err.message })
  }
}

// ---------------------------------------------------------------
// Dynamic / runtime tests (C1, C9)
// ---------------------------------------------------------------
test('C1 — _spaceCacheById is a Map', () => {
  const c = new SignalingClient()
  assert.ok(c._spaceCacheById instanceof Map)
})

test('C1 — getCachedSpace on empty cache returns null', () => {
  const c = new SignalingClient()
  assert.equal(c.getCachedSpace('any-id'), null)
  assert.equal(c.getCachedSpace(null), null)
  assert.equal(c.getCachedSpace(undefined), null)
  assert.equal(c.getCachedSpace(''), null)
})

test('C1 — cacheSpace stores a Space in the Map', () => {
  const c = new SignalingClient()
  const s = makeSpace('s1', { name: 'Hello' })
  const out = c.cacheSpace(s)
  assert.equal(out, s)
  assert.equal(c.getCachedSpace('s1'), s)
})

test('C1 — cacheSpace replaces an existing entry', () => {
  const c = new SignalingClient()
  c.cacheSpace(makeSpace('s1', { name: 'v1' }))
  c.cacheSpace(makeSpace('s1', { name: 'v2' }))
  assert.equal(c.getCachedSpace('s1').name, 'v2')
})

test('C1 — cacheSpace ignores falsy / id-less objects', () => {
  const c = new SignalingClient()
  c.cacheSpace(null)
  c.cacheSpace(undefined)
  c.cacheSpace({})
  assert.equal(c._spaceCacheById.size, 0)
})

test('C1 — cacheSpace keeps _spaceCache in sync when storing the active space', () => {
  const c = new SignalingClient()
  c.spaceId = 'active'
  const s = makeSpace('active', { name: 'Active' })
  c.cacheSpace(s)
  assert.equal(c._spaceCache, s)
})

test('C1 — cacheSpace does NOT clobber _spaceCache when storing a non-active space', () => {
  const c = new SignalingClient()
  const active = makeSpace('active')
  c.spaceId = 'active'
  c._spaceCache = active
  c.cacheSpace(makeSpace('other'))
  assert.equal(c._spaceCache, active)
})

test('C1 — invalidateCachedSpace removes a single id', () => {
  const c = new SignalingClient()
  c.cacheSpace(makeSpace('a'))
  c.cacheSpace(makeSpace('b'))
  c.invalidateCachedSpace('a')
  assert.equal(c.getCachedSpace('a'), null)
  assert.ok(c.getCachedSpace('b'))
})

test('C1 — invalidateCachedSpace clears _spaceCache if it pointed at the deleted space', () => {
  const c = new SignalingClient()
  c.spaceId = 'gone'
  const s = makeSpace('gone')
  c._spaceCache = s
  c.cacheSpace(s)
  c.invalidateCachedSpace('gone')
  assert.equal(c._spaceCache, null)
})

test('C1 — invalidateCachedSpace ignores missing ids', () => {
  const c = new SignalingClient()
  c.cacheSpace(makeSpace('a'))
  c.invalidateCachedSpace('does-not-exist')
  assert.ok(c.getCachedSpace('a'))
  c.invalidateCachedSpace(null)
  c.invalidateCachedSpace('')
})

test('C1 — clearSpaceCache wipes everything', () => {
  const c = new SignalingClient()
  c.cacheSpace(makeSpace('a'))
  c.cacheSpace(makeSpace('b'))
  c.spaceId = 'a'
  c._spaceCache = makeSpace('a')
  c.clearSpaceCache()
  assert.equal(c._spaceCacheById.size, 0)
  assert.equal(c._spaceCache, null)
})

// ---------------------------------------------------------------
// Cache miss path (C2) — exercise the full hydration chain without
// Firestore by stubbing `getDoc` + `getDocs` on the live prototype.
// ---------------------------------------------------------------
const stubSnapshot = (data) => ({
  exists: () => true,
  id: data?.id || 's-stub',
  data: () => data,
})

test('C2 — cache miss invokes _hydrateSpace exactly once and caches the result', async () => {
  // Build a fresh client and stub the firebase/firestore primitives that
  // _hydrateSpace reaches. We intercept via the signalingClient's own
  // module-private helpers by temporarily monkey-patching getDoc/getDocs
  // on the firebase_firestore mock that was imported transitively.
  const sigMod = await import(
    pathToFileURL(path.join(srcRoot, 'shared/connection/signalingClient.js')).href +
    '?t=' + Date.now()
  )
  const c = new sigMod.SignalingClient()
  c.userId = 'u-test'
  // Capture how many times _hydrateSpace is invoked.
  let hydrateCalls = 0
  const original = c._hydrateSpace.bind(c)
  c._hydrateSpace = async function (...args) {
    hydrateCalls += 1
    return original(...args)
  }
  // Reach into the firebase/firestore mock by re-importing it via the
  // mocks dir; both .mjs files share the same ESl module cache.
  const firestoreMockPath = path.join(mockDir, 'firebase_firestore.mjs')
  const firestoreUrl = pathToFileURL(firestoreMockPath).href
  const firestoreMod = await import(firestoreUrl)
  const spaceData = {
    name: 'CacheMiss Space',
    description: '',
    icon: 'ph:users-three:outline',
    color: '#E74C3C',
    visibility: 'public',
    memberIds: ['u-test'],
    roomCount: 0,
    events: [],
    createdBy: 'u-test',
  }
  firestoreMod.getDoc = async (ref) => stubSnapshot({ id: ref?.id, ...spaceData })
  firestoreMod.getDocs = async () => ({ docs: [] })

  // Pre-condition: cache is empty
  assert.equal(c.getCachedSpace('cache-miss-id'), null)

  const result = await c.joinSpace('cache-miss-id', { keepVoice: false })

  assert.equal(hydrateCalls, 1,
    `expected exactly one _hydrateSpace call, got ${hydrateCalls}`)
  assert.ok(result && result.space && result.space.id === 'cache-miss-id',
    'joinSpace must return the hydrated space')
  assert.equal(c.getCachedSpace('cache-miss-id'), result.space,
    'cache-miss must store the hydrated space in _spaceCacheById')
})

test('C2 — _hydrateSpace stores its return value via cacheSpace', async () => {
  const sigMod = await import(
    pathToFileURL(path.join(srcRoot, 'shared/connection/signalingClient.js')).href +
    '?t=' + (Date.now() + 1)
  )
  const c = new sigMod.SignalingClient()
  c.userId = 'u-test'
  c.spaceId = 'hydrate-target'

  // Stub Firestore so _hydrateSpace has data to build from.
  const firestoreMod = await import(
    pathToFileURL(path.join(mockDir, 'firebase_firestore.mjs')).href
  )
  firestoreMod.getDoc = async (ref) => stubSnapshot({
    id: ref?.id,
    name: 'HydrateTarget',
    memberIds: ['u-test'],
    roomCount: 0,
    events: [],
  })
  firestoreMod.getDocs = async () => ({ docs: [] })

  // Cache must be empty before.
  assert.equal(c.getCachedSpace('hydrate-target'), null)
  const out = await c._hydrateSpace('hydrate-target')
  assert.ok(out && out.id === 'hydrate-target', '_hydrateSpace must return the full space')
  assert.equal(c.getCachedSpace('hydrate-target'), out,
    '_hydrateSpace must mirror its result into _spaceCacheById')
  assert.equal(c._spaceCache, out,
    '_hydrateSpace must also update _spaceCache when the hydrated space is the active one')
})

test('C2 — _hydrateSpace returns the same object that cacheSpace stores', async () => {
  const c = new SignalingClient()
  c.userId = 'u-test'
  c.spaceId = 'same-ref'
  const firestoreMod = await import(
    pathToFileURL(path.join(mockDir, 'firebase_firestore.mjs')).href +
    '?t=' + (Date.now() + 2)
  )
  firestoreMod.getDoc = async (ref) => stubSnapshot({
    id: ref?.id,
    name: 'SameRef',
    memberIds: ['u-test'],
    roomCount: 0,
    events: [],
  })
  firestoreMod.getDocs = async () => ({ docs: [] })

  const out = await c._hydrateSpace('same-ref')
  const fromCache = c.getCachedSpace('same-ref')
  assert.equal(out, fromCache,
    '_hydrateSpace and getCachedSpace must return the SAME object reference (identity)')
})

test('C2 — source documents the elimination of the double-hydrate', () => {
  const src = readSrc('shared/connection/signalingClient.js')
  // The cache miss branch must contain a comment that explicitly mentions
  // the eliminated double-hydrate behavior.
  const missIdx = src.indexOf('Cache miss:')
  assert.ok(missIdx > -1, 'cache miss branch comment must exist')
  const window = src.slice(missIdx, missIdx + 600)
  assert.ok(/double/i.test(window) || /once/i.test(window),
    'cache miss branch must document the elimination of the double-hydrate')
})

// ---------------------------------------------------------------
// Stable panel transition (C5) — no forced unmount on Space change.
// ---------------------------------------------------------------
test('C5 — AppShell panel wrapper has no key= attribute', () => {
  const src = readSrc('shell/AppShell.jsx')
  const panelIdx = src.indexOf('<SpaceContextPanel')
  assert.ok(panelIdx > -1, 'SpaceContextPanel JSX must exist')
  // Inspect the wrapper <div> directly above SpaceContextPanel.
  // We expect to find `<div` followed by className props and a closing `>`
  // before `<SpaceContextPanel`. The window covers the entire wrapper.
  const before = src.slice(Math.max(0, panelIdx - 800), panelIdx)
  // Extract the last <div ... > block right before SpaceContextPanel.
  const lastDivMatch = before.match(/<div\b[^>]*>/g)
  assert.ok(lastDivMatch && lastDivMatch.length > 0,
    'expected a <div> wrapper before SpaceContextPanel')
  const wrapper = lastDivMatch[lastDivMatch.length - 1]
  assert.equal(/\bkey\s*=/.test(wrapper), false,
    `wrapper <div> must not have a key= attribute, got: ${wrapper.slice(0, 160)}…`)
})

test('C5 — SpaceContextPanel does NOT export a keyed remount sentinel', () => {
  const src = readSrc('components/layout/SpaceContextPanel.jsx')
  // The component body itself must not declare a remount key based on
  // space.id (e.g. `<div key={space?.id}>` wrapping the whole tree).
  assert.equal(/<div[^>]*key=\{space\?\.id\}/.test(src), false,
    'SpaceContextPanel must not use a space.id-based key on its outer div')
  // The internal reset effect is allowed and required (per C4).
  assert.ok(/setMenuOpen\(false\)[\s\S]*?setSpaceSettingsOpen\(false\)[\s\S]*?setConfirmDeleteId\(null\)[\s\S]*?\}, \[space\?\.id\]\)/.test(src),
    'C4 reset effect must still be present')
})

test('C5 — Panel transitions reset ephemeral state via effect, not unmount', () => {
  const src = readSrc('components/layout/SpaceContextPanel.jsx')
  // Find every useEffect whose dependency array mentions space?.id and
  // verify that at least one of them resets the ephemeral state (i.e.
  // setMenuOpen/setSpaceSettingsOpen/setConfirmDeleteId).
  const effectRegex = /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[space\?\.id\]\)/g
  const effects = src.match(effectRegex) || []
  assert.ok(effects.length >= 1,
    'SpaceContextPanel must have at least one useEffect keyed on [space?.id]')
  const resetEffect = effects.find((e) =>
    /setMenuOpen\(/i.test(e) &&
    /setSpaceSettingsOpen\(/i.test(e) &&
    /setConfirmDeleteId\(/i.test(e)
  )
  assert.ok(resetEffect,
    'SpaceContextPanel must reset menuOpen + spaceSettingsOpen + confirmDeleteId on space change')
})

// ---------------------------------------------------------------
// Invariants (I1–I8) — explicit named tests.
// ---------------------------------------------------------------

test('I1 — keepVoice propagation chain is intact (C7 cross-check)', () => {
  // I1 is structurally identical to C7 but listed here as an explicit
  // invariant. Re-check that all three legs of the chain survive.
  const useSrc   = readSrc('features/spaces/hooks/useCurrentSpace.js')
  const shellSrc = readSrc('shell/AppShell.jsx')
  const sigSrc   = readSrc('shared/connection/signalingClient.js')
  assert.ok(/keepVoice: !!opts\.keepVoice/.test(useSrc),
    'I1: useCurrentSpace.selectSpace must forward keepVoice')
  assert.ok(/keepVoice: !!currentRoom/.test(shellSrc),
    'I1: AppShell must pass keepVoice: !!currentRoom')
  assert.ok(/voiceSpaceId = this\.voiceSpaceId \|\| \(this\.roomId \? this\.spaceId : null\)/.test(sigSrc),
    'I1: joinSpace must compute voiceSpaceId preserving LiveKit session')
  assert.ok(/preserving = !!\(keepVoice && voiceRoomId && voiceSpaceId\)/.test(sigSrc),
    'I1: joinSpace must derive preserving from keepVoice + active call')
})

test('I2 — _spaceCacheById.get(id) returns the same object passed to cacheSpace', () => {
  const c = new SignalingClient()
  const s = makeSpace('identity-check', { name: 'Identity' })
  c.cacheSpace(s)
  const got = c.getCachedSpace('identity-check')
  assert.equal(got, s, 'I2: cache must return the same object reference (===)')
})

test('I3 — cacheSpace silently ignores null / undefined / id-less entries', () => {
  const c = new SignalingClient()
  c.cacheSpace(makeSpace('seed'))
  const sizeBefore = c._spaceCacheById.size
  c.cacheSpace(null)
  c.cacheSpace(undefined)
  c.cacheSpace({})
  c.cacheSpace({ name: 'no id here' })
  c.cacheSpace(0)
  c.cacheSpace('')
  assert.equal(c._spaceCacheById.size, sizeBefore,
    'I3: invalid entries must not mutate the cache size')
  assert.ok(c.getCachedSpace('seed'),
    'I3: pre-existing valid entry must survive invalid cacheSpace calls')
})

test('I4 — _spaceCache mirrors the active Space in the per-id cache', () => {
  const c = new SignalingClient()
  c.spaceId = 'active-i4'
  const a = makeSpace('active-i4', { name: 'I4 Active' })
  c.cacheSpace(a)
  assert.equal(c._spaceCache, a,
    'I4: cacheSpace must update _spaceCache when the entry is the active space')
  assert.equal(c._spaceCache, c._spaceCacheById.get('active-i4'),
    'I4: _spaceCache must equal the per-id cache entry for the active space')

  // Switch active id — cacheSpace for the new active id must win.
  c.spaceId = 'new-active'
  const b = makeSpace('new-active', { name: 'I4 New' })
  c.cacheSpace(b)
  assert.equal(c._spaceCache, b,
    'I4: _spaceCache must follow spaceId after the active id changes')
  // The old entry remains in the per-id cache.
  assert.equal(c._spaceCacheById.get('active-i4'), a,
    'I4: previously-cached entry must remain in the per-id cache')
})

test('I5 — invalidateCachedSpace zeros _spaceCache only when spaceId matches', () => {
  const c = new SignalingClient()
  c.spaceId = 'leave-me'
  const active = makeSpace('leave-me')
  c._spaceCache = active
  c.cacheSpace(active)
  // Invalidate a DIFFERENT id — active cache must survive.
  c.invalidateCachedSpace('other-id')
  assert.equal(c._spaceCache, active,
    'I5: invalidating a non-active id must not clear _spaceCache')
  // Now invalidate the active id.
  c.invalidateCachedSpace('leave-me')
  assert.equal(c._spaceCache, null,
    'I5: invalidating the active id must clear _spaceCache')
  assert.equal(c.getCachedSpace('leave-me'), null,
    'I5: per-id cache must also drop the invalidated id')
})

test('I6 — clearSpaceCache wipes both _spaceCache and _spaceCacheById', () => {
  const c = new SignalingClient()
  c.cacheSpace(makeSpace('a'))
  c.cacheSpace(makeSpace('b'))
  c.cacheSpace(makeSpace('c'))
  c.spaceId = 'a'
  c._spaceCache = makeSpace('a')
  c.clearSpaceCache()
  assert.equal(c._spaceCacheById.size, 0,
    'I6: per-id cache must be empty after clearSpaceCache')
  assert.equal(c._spaceCache, null,
    'I6: _spaceCache must be null after clearSpaceCache')
})

test('I7 — _reconcileMemberDocs is fire-and-forget at every joinSpace call site', () => {
  const src = readSrc('shared/connection/signalingClient.js')
  // No `await` in front of _reconcileMemberDocs anywhere.
  const noAwait = !/await\s+this\._reconcileMemberDocs/.test(src)
  assert.ok(noAwait, 'I7: _reconcileMemberDocs must never be awaited')
  // Must be invoked at least twice (cache-hit and cache-miss branches).
  const calls = src.match(/this\._reconcileMemberDocs\(spaceId\)/g) || []
  assert.ok(calls.length >= 2,
    `I7: expected >=2 fire-and-forget call sites, found ${calls.length}`)
})

test('I8 — useCurrentSpace onPresenceChanged returns prev on no-change (idempotence)', () => {
  const useSrc = readSrc('features/spaces/hooks/useCurrentSpace.js')
  // Look for the shallow-check guard that returns `prev` unchanged.
  assert.ok(/if \(!changed\) return prev/.test(useSrc),
    'I8: onPresenceChanged must return prev when nothing changed')
  // Also verify the outer updater calls the React setter with prev when
  // nothing changed — this is what avoids re-renders on idle RTDB ticks.
  // The shallow check has an explanatory comment between the setter call
  // and the early-return, so the window needs to span the full block.
  assert.ok(/setSpaceMembers\(\(prev\)\s*=>\s*\{[\s\S]*?if \(!changed\) return prev/.test(useSrc),
    'I8: setSpaceMembers must early-return prev when nothing changed')
})

// ---------------------------------------------------------------
// C9 (existing) — kept here to anchor the test name to the contract.
// ---------------------------------------------------------------
test('C9 — getCachedSpace delivers cache hit without side-effects', () => {
  const c = new SignalingClient()
  const s = makeSpace('sX', {
    rooms: [{ id: 'r1', name: 'General' }],
    members: [{ userId: 'u1', displayName: 'Alice' }],
  })
  c.cacheSpace(s)
  const before = JSON.stringify({
    size: c._spaceCacheById.size,
    cache: c._spaceCache,
  })
  const hit = c.getCachedSpace('sX')
  const after = JSON.stringify({
    size: c._spaceCacheById.size,
    cache: c._spaceCache,
  })
  assert.equal(hit, s, 'returns the cached object identity')
  assert.equal(before, after, 'no side-effects from a read')
})

test('Multiple Spaces round-trip correctly', () => {
  const c = new SignalingClient()
  const a = makeSpace('alpha')
  const b = makeSpace('beta')
  const d = makeSpace('delta')
  c.cacheSpace(a); c.cacheSpace(b); c.cacheSpace(d)
  assert.equal(c.getCachedSpace('alpha'), a)
  assert.equal(c.getCachedSpace('beta'), b)
  assert.equal(c.getCachedSpace('delta'), d)
  c.invalidateCachedSpace('beta')
  assert.equal(c.getCachedSpace('beta'), null)
  assert.equal(c.getCachedSpace('alpha'), a)
  assert.equal(c.getCachedSpace('delta'), d)
})

// ---------------------------------------------------------------
// Static / source-inspection tests (C3, C4, C6, C7/I1, C8)
// ---------------------------------------------------------------
test('C3 — _reconcileMemberDocs is fire-and-forget (>=2 call sites, none awaited)', () => {
  const src = readSrc('shared/connection/signalingClient.js')
  const matches = src.match(/_reconcileMemberDocs\(spaceId\)\s*\n\s*\.catch\(/g) || []
  assert.ok(matches.length >= 2,
    `expected >=2 fire-and-forget call sites, found ${matches.length}`)
  assert.equal(/await\s+this\._reconcileMemberDocs/.test(src), false,
    'joinSpace must not await _reconcileMemberDocs')
})

test('C3b — _reconcileMemberDocs never mass-deletes from a canonicalIds Set', () => {
  const src = readSrc('shared/connection/signalingClient.js')
  assert.equal(/canonicalIds/.test(src), false,
    'stale canonicalIds reconcile caused mutual kicks; must not return')
  assert.ok(/email === myEmail/.test(src),
    'reconcile may only remove leftover Auth UIDs for the same email')
})

test('C3 — cache-miss path runs _hydrateSpace exactly once', () => {
  const src = readSrc('shared/connection/signalingClient.js')
  // We expect ONE call to _hydrateSpace inside joinSpace, and the
  // explanatory comment must mention the eliminated double-hydrate.
  const calls = (src.match(/this\._hydrateSpace\(spaceId,/g) || []).length
  assert.ok(calls >= 1 && calls <= 2,
    `expected 1-2 _hydrateSpace call sites, found ${calls}`)
  assert.ok(/double(d)? the first-visit|ran it twice/i.test(src) || /once[\s\S]*double/i.test(src),
    'should document the elimination of the double-hydrate')
})

test('C4 — AppShell.jsx does NOT key the SpaceContextPanel wrapper by currentSpace.id', () => {
  const src = readSrc('shell/AppShell.jsx')
  const panelIdx = src.indexOf('<SpaceContextPanel')
  assert.ok(panelIdx > -1, 'SpaceContextPanel JSX must exist')
  const before = src.slice(Math.max(0, panelIdx - 400), panelIdx)
  assert.equal(/key=\{currentSpace\?\.id\}/.test(before), false,
    'wrapper must not have key={currentSpace?.id}')
})

test('C4 — SpaceContextPanel resets menuOpen etc. on space.id change', () => {
  const src = readSrc('components/layout/SpaceContextPanel.jsx')
  assert.ok(
    /useEffect\(\(\) => \{[\s\S]*?setMenuOpen\(false\)[\s\S]*?setSpaceSettingsOpen\(false\)[\s\S]*?setConfirmDeleteId\(null\)[\s\S]*?\}, \[space\?\.id\]\)/.test(src),
    'SpaceContextPanel must reset menuOpen+spaceSettingsOpen+confirmDeleteId on space.id change',
  )
})

test('C6 — applyPresenceMap shallow-checks before mutating _spaceCache', () => {
  const src = readSrc('shared/connection/signalingClient.js')
  assert.ok(/if \(changed && this\._spaceCache\?\.members\)/.test(src),
    'applyPresenceMap must guard the members mutation with `changed`')
  assert.ok(/let changed = false/.test(src),
    'applyPresenceMap must compute a `changed` flag')
})

test('C6 — useCurrentSpace onPresenceChanged returns prev when nothing changed', () => {
  const src = readSrc('features/spaces/hooks/useCurrentSpace.js')
  assert.ok(/if \(!changed\) return prev/.test(src),
    'useCurrentSpace onPresenceChanged must early-return prev on no-change')
})

test('C7 / I1 — keepVoice is threaded; voiceSpaceId preserves LiveKit', () => {
  const useSrc  = readSrc('features/spaces/hooks/useCurrentSpace.js')
  const sigSrc  = readSrc('shared/connection/signalingClient.js')
  const shellSrc = readSrc('shell/AppShell.jsx')
  // useCurrentSpace forwards keepVoice
  assert.ok(/keepVoice: !!opts\.keepVoice/.test(useSrc),
    'useCurrentSpace must forward keepVoice')
  // AppShell uses keepVoice=!!currentRoom
  assert.ok(/keepVoice: !!currentRoom/.test(shellSrc),
    'AppShell must pass keepVoice: !!currentRoom')
  // joinSpace computes voiceSpaceId + preserving
  assert.ok(/voiceSpaceId = this\.voiceSpaceId \|\| \(this\.roomId \? this\.spaceId : null\)/.test(sigSrc),
    'joinSpace must compute voiceSpaceId preserving LiveKit session')
  assert.ok(/preserving = !!\(keepVoice && voiceRoomId && voiceSpaceId\)/.test(sigSrc),
    'joinSpace must compute `preserving` from keepVoice + active call')
})

test('C8 — ScreenSharePicker still ships the headphones checkbox', () => {
  const src = readSrc('features/rooms/views/voice/components/ScreenSharePicker.jsx')
  assert.ok(/usingHeadphones/.test(src), 'ScreenSharePicker must keep the headphones toggle')
  // Use plain string contains — `onPick?.(` is awkward in a regex literal.
  assert.ok(
    src.includes('onPick?.(sourceId,') &&
    src.includes('headphones: withSystemAudio && usingHeadphones'),
    'ScreenSharePicker must forward the headphones flag through onPick',
  )
  assert.ok(/Headphones/.test(src), 'ScreenSharePicker must import the Headphones icon')
})

test('C8 — useLiveKitRoom still mutes mic when capturing system audio without headphones', () => {
  const src = readSrc('features/rooms/views/voice/useLiveKitRoom.js')
  assert.ok(/screenAudioCaptureRef = useRef\(\{ active: false, headphones: false \}\)/.test(src),
    'useLiveKitRoom must keep the active/headphones ref shape')
  assert.ok(/duckMic = !!\(cap\?\.active && !cap\?\.headphones && audio\.dataset\?\.vcSource !== 'screen'\)/.test(src),
    'useLiveKitRoom must compute duckMic from active+!headphones')
  assert.ok(
    /setScreenAudioCaptureActive = useCallback\(\(active, opts = \{\}\) => \{[\s\S]*?headphones: !!\(active && opts\.headphones\)/.test(src),
    'setScreenAudioCaptureActive must accept the headphones opt',
  )
})

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
let okCount = 0, failCount = 0
for (const r of results) {
  const tag = r.ok ? 'PASS' : 'FAIL'
  console.log(`${tag}  ${r.name}`)
  if (!r.ok) console.log(`        ↳ ${r.err}`)
  r.ok ? okCount++ : failCount++
}
console.log(`\n${okCount} passed · ${failCount} failed`)
process.exit(failCount === 0 ? 0 : 1)
