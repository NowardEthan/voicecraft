/**
 * enumerateMics — fetches the user's audio input devices.
 *
 * Returns an array of { deviceId, label, groupId }. Labels may be empty in
 * some browsers until the user has granted mic permission at least once.
 */
export async function enumerateMics() {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Microfone (${d.deviceId.slice(0, 6)}…)`,
      groupId: d.groupId,
    }))
}

/**
 * enumerateSpeakers — audio output devices (headphones / speakers).
 * Labels may be empty until permission was granted at least once.
 */
export async function enumerateSpeakers() {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const all = await navigator.mediaDevices.enumerateDevices()
  return all
    .filter((d) => d.kind === 'audiooutput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Saída (${d.deviceId.slice(0, 6)}…)`,
      groupId: d.groupId,
    }))
}

/**
 * Subscribe to device-change events (e.g. user plugs/unplugs a USB mic).
 * Returns an unsubscribe function.
 */
export function watchDeviceChanges(onChange) {
  if (!navigator.mediaDevices?.addEventListener) return () => {}
  navigator.mediaDevices.addEventListener('devicechange', onChange)
  return () => navigator.mediaDevices.removeEventListener('devicechange', onChange)
}
