/**
 * usePublicSpacesCache — single shared public-spaces list for home + warmup.
 * Survives tab switches so covers aren't re-fetched / re-flicked.
 */
import { useCallback, useEffect, useState } from 'react'
import { getSharedSignaling } from '../connection/useSignaling'
import { resolveSpaceCover } from '../../features/spaces/model/spaceCover'
import { warmImages } from './imageWarm'
import { runWhenIdle } from './idlePreload'

let _cache = { list: [], loaded: false, loading: false }
const _listeners = new Set()

function emit() {
  for (const fn of _listeners) {
    try { fn(_cache) } catch { /* ignore */ }
  }
}

async function fetchPublic(query = '') {
  const sig = getSharedSignaling()
  if (!sig?.listPublicSpaces) return []
  const list = await sig.listPublicSpaces({ query, limit: 48 })
  return list || []
}

function warmCoversQuietly(list) {
  const urls = []
  for (const s of list || []) {
    const cover = resolveSpaceCover(s)
    if (cover) urls.push(cover)
  }
  if (!urls.length) return
  runWhenIdle(() => {
    warmImages(urls.slice(0, 16), { concurrency: 4 })
  }, { timeout: 400 })
}

export async function ensurePublicSpaces(query = '') {
  if (_cache.loaded && !query) return _cache.list
  if (_cache.loading && !query) {
    return new Promise((resolve) => {
      const wait = (state) => {
        if (!state.loading) {
          _listeners.delete(wait)
          resolve(state.list)
        }
      }
      _listeners.add(wait)
    })
  }
  _cache = { ..._cache, loading: true }
  emit()
  try {
    const list = await fetchPublic(query)
    if (!query) {
      _cache = { list, loaded: true, loading: false }
      warmCoversQuietly(list)
    } else {
      _cache = { ..._cache, loading: false }
    }
    emit()
    return list
  } catch {
    _cache = { ..._cache, loading: false }
    emit()
    return []
  }
}

export function usePublicSpacesCache() {
  const [state, setState] = useState(() => ({
    publicSpaces: _cache.list,
    publicLoading: _cache.loading && !_cache.loaded,
  }))

  useEffect(() => {
    const onChange = (c) => {
      setState({
        publicSpaces: c.list,
        publicLoading: c.loading && !c.loaded,
      })
    }
    _listeners.add(onChange)
    onChange(_cache)
    ensurePublicSpaces('')
    return () => { _listeners.delete(onChange) }
  }, [])

  const reload = useCallback((q = '') => ensurePublicSpaces(q), [])

  return {
    publicSpaces: state.publicSpaces,
    publicLoading: state.publicLoading,
    reload,
  }
}
