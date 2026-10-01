/** Reference-counted body lock; nested modals cannot unlock each other. */
export function createBodyScrollLock() {
  let count = 0
  let snapshot = null

  function acquire(doc = typeof document !== 'undefined' ? document : null) {
    if (!doc?.body) return () => {}
    if (count === 0) {
      const body = doc.body
      const view = doc.defaultView
      const computedPadding = Number.parseFloat(view?.getComputedStyle?.(body)?.paddingRight || '0') || 0
      const scrollbar = Math.max(0, (view?.innerWidth || 0) - (doc.documentElement?.clientWidth || 0))
      snapshot = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
      body.style.overflow = 'hidden'
      if (scrollbar > 0) body.style.paddingRight = `${computedPadding + scrollbar}px`
      body.dataset.vcScrollLocked = 'true'
    }
    count += 1
    let released = false
    return () => {
      if (released) return
      released = true
      count = Math.max(0, count - 1)
      if (count === 0 && snapshot) {
        doc.body.style.overflow = snapshot.overflow
        doc.body.style.paddingRight = snapshot.paddingRight
        delete doc.body.dataset.vcScrollLocked
        snapshot = null
      }
    }
  }

  return { acquire, get count() { return count } }
}

export const bodyScrollLock = createBodyScrollLock()