/**
 * Full-area join/reconnect state so the room never looks “live” before LiveKit is ready.
 */
import { Loader2, PhoneOff } from 'lucide-react'

const PHASE_COPY = {
  token: {
    title: 'Preparando a chamada',
    detail: 'Obtendo acesso à sala…',
  },
  mic: {
    title: 'Preparando a chamada',
    detail: 'Solicitando o microfone…',
  },
  connecting: {
    title: 'Entrando na sala',
    detail: 'Conectando ao servidor de voz…',
  },
  publishing: {
    title: 'Quase lá',
    detail: 'Ativando seu áudio na call…',
  },
  reconnecting: {
    title: 'Reconectando',
    detail: 'A conexão caiu — tentando voltar…',
  },
}

export function CallConnectingState({
  roomName,
  phase = 'connecting',
  onLeave,
  reducedMotion = false,
}) {
  const copy = PHASE_COPY[phase] || PHASE_COPY.connecting

  return (
    <div
      className="flex-1 flex items-center justify-center px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="
          max-w-sm w-full rounded-[18px] border border-white/[0.10]
          bg-[#140e11]/88 backdrop-blur-md
          p-7 flex flex-col items-center text-center gap-4
          shadow-[0_22px_50px_-18px_rgba(0,0,0,0.65)]
        "
      >
        <div
          className="
            w-14 h-14 rounded-2xl flex items-center justify-center
            border border-white/[0.08]
          "
          style={{
            backgroundColor: 'var(--space-accent-soft)',
            color: 'var(--space-accent)',
            boxShadow: '0 10px 28px -12px var(--space-accent-glow-24)',
          }}
          aria-hidden
        >
          <Loader2
            size={22}
            strokeWidth={2}
            className={reducedMotion ? '' : 'animate-spin'}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-[15px] font-semibold text-strong tracking-tight">
            {copy.title}
          </p>
          {roomName ? (
            <p className="text-[13px] text-ink truncate max-w-[16rem] mx-auto">
              {roomName}
            </p>
          ) : null}
          <p className="text-[12.5px] text-muted leading-snug">
            {copy.detail}
          </p>
        </div>

        <div className="flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--space-accent)',
                opacity: phaseStep(phase) >= i ? 0.95 : 0.25,
                transition: 'opacity 200ms ease',
              }}
            />
          ))}
        </div>

        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="
              mt-1 inline-flex items-center gap-2 h-9 px-4 rounded-pill
              bg-white/[0.05] hover:bg-white/[0.09]
              border border-white/[0.10] text-ink hover:text-strong
              text-[12.5px] font-medium transition-colors duration-150
            "
          >
            <PhoneOff size={13} strokeWidth={1.8} />
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

function phaseStep(phase) {
  if (phase === 'token') return 0
  if (phase === 'mic') return 1
  if (phase === 'connecting' || phase === 'publishing') return 2
  if (phase === 'reconnecting') return 1
  return 1
}
