/**
 * ConnectionStatus — small text + colored dot reflecting the state of
 * the LiveKit room connection.
 *
 * Always pairs color with text so color-blind users and screen readers
 * can read the state.
 */
const STATE_LABEL = {
  connecting:   { label: 'Conectando…',   tone: 'warning', text: 'text-warning' },
  connected:    { label: 'Conectado',     tone: 'positive', text: 'text-positive' },
  disconnected: { label: 'Desconectado',  tone: 'muted', text: 'text-muted' },
  failed:       { label: 'Falha',         tone: 'danger', text: 'text-danger' },
  closed:       { label: 'Encerrado',     tone: 'muted', text: 'text-muted' },
  reconnecting: { label: 'Reconectando…', tone: 'warning', text: 'text-warning' },
}

const TONE_DOT = {
  positive: 'bg-positive',
  warning:  'bg-warning',
  danger:   'bg-danger',
  muted:    'bg-muted/60',
}

export function ConnectionStatus({ state, pulse = false }) {
  const info = STATE_LABEL[state] || STATE_LABEL.connecting
  const busy = state === 'connecting' || state === 'reconnecting' || pulse
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${info.text}`}
      aria-live="polite"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[info.tone]} ${busy ? 'pulse-dot' : ''}`}
        aria-hidden
      />
      <span>{info.label}</span>
    </span>
  )
}
