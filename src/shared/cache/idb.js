/**
 * idb — minimal native IndexedDB wrapper for Voice.
 *
 * Zero external deps. Promise-based API that supports Blob / File
 * natively (IndexedDB stores structured-clone values, including Blobs).
 *
 * Stores are declared up-front via `declareStore(name, opts)`. The
 * shared DB `voicecraft_chat_db` includes an upgrade callback that
 * creates any declared stores on first open. Read/write helpers do
 * NOT auto-create stores — callers should `declareStore` first. If a
 * store is missing on read, helpers throw a clear `NotFoundError`.
 */
const DB_NAME = 'voicecraft_chat_db'
const DB_VERSION = 2
const declaredStores = new Map() // name -> { keyPath }

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'))
  })
}

function promisifyTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('IndexedDB tx aborted'))
    tx.onerror = () => reject(tx.error || new Error('IndexedDB tx error'))
  })
}

function ensureNative() {
  if (typeof window === 'undefined') {
    throw new Error('IndexedDB unavailable: no window')
  }
  const idb = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB
  if (!idb) {
    throw new Error('IndexedDB not supported in this environment')
  }
  return idb
}

const dbCache = new Map()

function upgradeCallback(db) {
  for (const [name, opts] of declaredStores.entries()) {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, opts)
    }
  }
}

export async function openDB(name = DB_NAME, version = DB_VERSION) {
  if (dbCache.has(name)) return dbCache.get(name)
  const idb = ensureNative()
  const db = await new Promise((resolve, reject) => {
    const req = idb.open(name, version)
    req.onupgradeneeded = () => {
      try { upgradeCallback(req.result) } catch (err) { reject(err) }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'))
    req.onblocked = () => reject(new Error('IndexedDB open blocked by another connection'))
  })
  dbCache.set(name, db)
  return db
}

function ensureStoreName(storeName) {
  if (!declaredStores.has(storeName)) {
    throw new Error(`Store "${storeName}" was not declared. Call declareStore(name, { keyPath }) first.`)
  }
}

export function declareStore(name, { keyPath = 'id' } = {}) {
  declaredStores.set(name, { keyPath })
  // If the DB is already open without this store, force a version bump
  // by closing the cache so the next open runs the upgrade callback.
  if (dbCache.has(DB_NAME)) {
    try {
      const db = dbCache.get(DB_NAME)
      if (db && db.objectStoreNames && !db.objectStoreNames.contains(name)) {
        db.close()
        dbCache.delete(DB_NAME)
      }
    } catch {}
  }
}

export async function get(storeName, key) {
  ensureStoreName(storeName)
  const db = await openDB()
  const tx = db.transaction(storeName, 'readonly')
  const result = await promisifyRequest(tx.objectStore(storeName).get(key))
  await promisifyTx(tx)
  return result
}

export async function put(storeName, value, key) {
  ensureStoreName(storeName)
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  if (key !== undefined) {
    await promisifyRequest(store.put(value, key))
  } else {
    await promisifyRequest(store.put(value))
  }
  await promisifyTx(tx)
  return value
}

export async function deleteItem(storeName, key) {
  ensureStoreName(storeName)
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  await promisifyRequest(tx.objectStore(storeName).delete(key))
  await promisifyTx(tx)
}

export async function getAll(storeName) {
  ensureStoreName(storeName)
  const db = await openDB()
  const tx = db.transaction(storeName, 'readonly')
  const result = await promisifyRequest(tx.objectStore(storeName).getAll())
  await promisifyTx(tx)
  return Array.isArray(result) ? result : []
}

export async function clear(storeName) {
  ensureStoreName(storeName)
  const db = await openDB()
  const tx = db.transaction(storeName, 'readwrite')
  await promisifyRequest(tx.objectStore(storeName).clear())
  await promisifyTx(tx)
}

// Backwards-compat: explicit upgrade call (no-op now, just verifies store).
export async function upgradeStore(storeName, opts = {}) {
  declareStore(storeName, opts)
  await openDB()
}
