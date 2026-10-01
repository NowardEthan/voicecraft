// In-memory Firestore mock for unit tests.
// Refs are plain { id, path } objects. Supports get/set/update/delete,
// simple where(field == value) + limit queries, transactions,
// and test helpers __seedDoc/__getDocData/__getWrites/__resetFirestore.
const store = new Map()
let writes = []

function clone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function pathOf(ref) {
  if (typeof ref === 'string') return ref
  if (ref && typeof ref.path === 'string') return ref.path
  if (ref && typeof ref._path === 'string') return ref._path
  if (ref && ref.id != null) return String(ref.id)
  return ''
}

function parentPathOf(docPath) {
  const idx = docPath.lastIndexOf('/')
  return idx === -1 ? '' : docPath.slice(0, idx)
}

function docIdOf(docPath) {
  const idx = docPath.lastIndexOf('/')
  return idx === -1 ? docPath : docPath.slice(idx + 1)
}

function makeDocSnap(docPath) {
  const data = store.has(docPath) ? clone(store.get(docPath)) : undefined
  return {
    id: docIdOf(docPath),
    ref: { id: docIdOf(docPath), path: docPath },
    exists: () => store.has(docPath),
    data: () => data,
  }
}

function runQuery(colRef, constraints) {
  const colPath = pathOf(colRef)
  let entries = []
  for (const pair of store.entries()) {
    if (parentPathOf(pair[0]) !== colPath) continue
    entries.push({ id: docIdOf(pair[0]), path: pair[0], data: clone(pair[1]) })
  }
  let limitN = null
  for (const constraint of constraints || []) {
    if (!constraint || typeof constraint !== 'object') continue
    if (constraint.__kind === 'where' && constraint.op === '==') {
      entries = entries.filter((entry) => (entry.data || {})[constraint.field] === constraint.value)
    } else if (constraint.__kind === 'limit') {
      limitN = constraint.n
    }
  }
  if (limitN != null) entries = entries.slice(0, limitN)
  const docs = entries.map((entry) => ({
    id: entry.id,
    ref: { id: entry.id, path: entry.path },
    exists: () => true,
    data: () => clone(entry.data),
  }))
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (fn) => docs.forEach(fn),
  }
}

function recordWrite(op, docPath, data) {
  writes.push({ op, path: docPath, data: clone(data) })
}

function applySet(ref, data, merge) {
  const docPath = pathOf(ref)
  const next = merge && store.has(docPath)
    ? Object.assign({}, store.get(docPath), clone(data))
    : clone(data)
  store.set(docPath, next)
  recordWrite('set', docPath, next)
}

function applyUpdate(ref, data) {
  const docPath = pathOf(ref)
  const next = Object.assign({}, store.get(docPath) || {}, clone(data))
  store.set(docPath, next)
  recordWrite('update', docPath, clone(data))
}

function applyDelete(ref) {
  const docPath = pathOf(ref)
  store.delete(docPath)
  recordWrite('delete', docPath, null)
}

function joinSegments(segments) {
  const parts = []
  for (const segment of segments) {
    if (segment == null) continue
    if (typeof segment === 'object') {
      if (typeof segment.path === 'string') { parts.push(segment.path); continue }
      if (typeof segment._path === 'string') { parts.push(segment._path); continue }
      if (segment.id != null) { parts.push(String(segment.id)); continue }
      continue
    }
    parts.push(String(segment))
  }
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/')
}

export function doc(...segments) {
  const full = joinSegments(segments)
  return { id: docIdOf(full), path: full }
}

export function collection(...segments) {
  const full = joinSegments(segments)
  return { id: docIdOf(full), path: full }
}

export function getDoc(ref) {
  return Promise.resolve(makeDocSnap(pathOf(ref)))
}

export function getDocFromServer(ref) {
  return Promise.resolve(makeDocSnap(pathOf(ref)))
}

export function getDocs(target) {
  if (target && target.__kind === 'query') {
    return Promise.resolve(runQuery(target.colRef, target.constraints))
  }
  return Promise.resolve(runQuery(target, []))
}

export function setDoc(ref, data, options) {
  applySet(ref, data, !!(options && options.merge))
  return Promise.resolve()
}

export function updateDoc(ref, data) {
  applyUpdate(ref, data)
  return Promise.resolve()
}

export function deleteDoc(ref) {
  applyDelete(ref)
  return Promise.resolve()
}

export function addDoc(colRef, data) {
  const colPath = pathOf(colRef)
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  const docPath = colPath ? colPath + '/' + id : id
  store.set(docPath, clone(data))
  recordWrite('set', docPath, clone(data))
  return Promise.resolve({ id, path: docPath })
}

export function onSnapshot() { return () => {} }

export function writeBatch() {
  const ops = []
  return {
    set: (ref, data, options) => { ops.push({ op: 'set', ref, data, options }) },
    update: (ref, data) => { ops.push({ op: 'update', ref, data }) },
    delete: (ref) => { ops.push({ op: 'delete', ref }) },
    commit: async () => {
      for (const entry of ops) {
        if (entry.op === 'set') applySet(entry.ref, entry.data, !!(entry.options && entry.options.merge))
        else if (entry.op === 'update') applyUpdate(entry.ref, entry.data)
        else if (entry.op === 'delete') applyDelete(entry.ref)
      }
    },
  }
}

export function query(colRef, ...constraints) {
  return { __kind: 'query', colRef, constraints }
}

export function where(field, op, value) {
  return { __kind: 'where', field, op, value }
}

export function orderBy(...a) { return { __kind: 'orderBy', args: a } }

export function limit(n) { return { __kind: 'limit', n } }

export function startAfter(...a) { return { __kind: 'startAfter', args: a } }

export function serverTimestamp() { return Date.now() }

export function arrayUnion(...a) { return a }

export function arrayRemove(...a) { return a }

export function deleteField() { return {} }

export function runTransaction(_db, fn) {
  const transaction = {
    get: (ref) => Promise.resolve(makeDocSnap(pathOf(ref))),
    set: (ref, data, options) => applySet(ref, data, !!(options && options.merge)),
    update: (ref, data) => applyUpdate(ref, data),
    delete: (ref) => applyDelete(ref),
  }
  return Promise.resolve().then(() => fn(transaction))
}

export function __seedDoc(docPath, data) {
  store.set(docPath, clone(data))
}

export function __getDocData(docPath) {
  return store.has(docPath) ? clone(store.get(docPath)) : undefined
}

export function __getWrites() {
  return writes.map((entry) => clone(entry))
}

export function __resetFirestore() {
  store.clear()
  writes = []
}
