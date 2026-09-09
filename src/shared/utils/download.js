/**
 * Trigger a file download without navigating the window.
 * Cross-origin `download` attributes are ignored by browsers/Electron —
 * they open the URL instead and trap the user on a bare image page.
 */
export async function downloadUrl(url, filename = 'arquivo') {
  if (!url) return false
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename || 'arquivo'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
    return true
  } catch {
    // Last resort: open in a new tab/window instead of replacing this one.
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    } catch {
      return false
    }
  }
}
