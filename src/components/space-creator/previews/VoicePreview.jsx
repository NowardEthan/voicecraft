/**
 * VoicePreview — preview of a "Voz" (voice channel) room.
 *
 * Compact representation: room name + "Pronto para entrar" status +
 * a "Entrar" button + mic indicator. No real audio, no real participants
 * list — pure visual.
 */
import { Mic, Headphones } from 'lucide-react'

export function VoicePreview({ roomName, typeLabel }) {
  return (
    <div className="flex flex-col h-full rounded-[12px] border border-line bg-[#16161a] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,63,108,0.30) 0%, rgba(255,63,108,0.14) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,63,108,0.35)',
          }}
        >
          <Mic size={18} strokeWidth={1.7} className="text-[#ffb3c2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-strong leading-tight truncate">
            {roomName || 'sala de voz'}
          </p>
          <p className="text-[11px] text-muted leading-tight">{typeLabel || 'Voz'}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill bg-[#0f1014] border border-line">
          <span className="w-1.5 h-1.5 rounded-full bg-[#32c48d]" />
          <span className="text-[10.5px] text-muted">ao vivo</span>
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4 min-h-[140px]">
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 -m-6 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(255,63,108,0.20), transparent 70%)' }} />
          <div className="relative w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,63,108,0.32) 0%, rgba(255,63,108,0.16) 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(255,63,108,0.40)',
            }}
          >
            <Mic size={26} strokeWidth={1.6} className="text-[#ffb3c2]" />
          </div>
        </div>
        <div>
          <p className="text-[13px] font-medium text-strong">Pronto para entrar</p>
          <p className="text-[11.5px] text-muted mt-1">Sem ninguém conectado ainda.</p>
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="inline-flex items-center gap-2 h-[36px] px-5 rounded-pill text-[12.5px] font-semibold text-strong"
          style={{
            background:
              'linear-gradient(180deg, var(--space-accent) 0%, #e23463 100%)',
            boxShadow:
              '0 6px 20px -8px var(--space-accent-glow-32), inset 0 0 0 1px rgba(255,255,255,0.10)',
          }}
        >
          <Headphones size={13} strokeWidth={2} />
          Entrar
        </button>
      </div>
    </div>
  )
}
