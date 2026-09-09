// Settings feature — public surface.
// Owns user preferences (mic, audio, theme) and the modal UI. The hook
// is the source of truth — components read it directly instead of
// receiving settings through props.
export { default as SettingsModal } from './components/SettingsModal'
export { useSettings } from './hooks/useSettings'
