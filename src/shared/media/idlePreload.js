/**
 * idlePreload — background work in idle slices (UI stays snappy).
 */

export function runWhenIdle(task, { timeout = 900 } = {}) {
  if (typeof task !== 'function') return () => {}
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback((deadline) => {
      try { task(deadline) } catch (err) { console.warn('[idlePreload]', err) }
    }, { timeout })
    return () => {
      try { window.cancelIdleCallback(id) } catch { /* ignore */ }
    }
  }
  const id = setTimeout(() => {
    try { task({ timeRemaining: () => 16, didTimeout: true }) } catch (err) {
      console.warn('[idlePreload]', err)
    }
  }, 80)
  return () => clearTimeout(id)
}

export function createIdleQueue({ concurrency = 1, gapMs = 24 } = {}) {
  const queue = []
  let running = 0
  let disposed = false
  let cancelIdle = null

  const pump = () => {
    if (disposed) return
    cancelIdle?.()
    cancelIdle = runWhenIdle(() => {
      while (!disposed && queue.length > 0 && running < concurrency) {
        const job = queue.shift()
        if (!job) break
        running += 1
        Promise.resolve()
          .then(() => job())
          .catch((err) => console.warn('[idleQueue]', err))
          .finally(() => {
            running -= 1
            if (queue.length > 0) setTimeout(pump, gapMs)
          })
      }
      if (queue.length > 0 && running < concurrency) setTimeout(pump, gapMs)
    }, { timeout: 700 })
  }

  return {
    push(job) {
      if (disposed || typeof job !== 'function') return
      queue.push(job)
      pump()
    },
    dispose() {
      disposed = true
      queue.length = 0
      cancelIdle?.()
    },
  }
}

export function warmImport(factory) {
  if (typeof factory !== 'function') return Promise.resolve(null)
  return Promise.resolve().then(() => factory()).catch(() => null)
}
