/**
 * MusicPreview — preview of a "Música" (shared listening) room.
 *
 * Visual: room name + compact "agora tocando" panel with cover art placeholder,
 * track name placeholder, and player controls. No real audio, no queue.
 */
import { Music, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'

export function MusicPreview({ roomName, typeLabel }) {
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
          <Music size={18} strokeWidth={1.7} className="text-[#ffb3c2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-strong leading-tight truncate">
            {roomName || 'música'}
          </p>
          <p className="text-[11px] text-muted leading-tight">{typeLabel || 'Música'}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10.5px] text-muted">
          <Volume2 size={12} strokeWidth={1.75} />
          0 ouvindo
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3 min-h-[140px]">
        <div
          className="w-[72px] h-[72px] rounded-[12px] flex items-center justify-center"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,63,108,0.32) 0%, rgba(167,139,250,0.20) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,63,108,0.30)',
          }}
        >
          <Music size={28} strokeWidth={1.4} className="text-[#ffb3c2]" />
        </div>
        <div>
          <p className="text-[12.5px] font-medium text-ink">Nenhuma faixa tocando</p>
          <p className="text-[11px] text-muted leading-snug mt-1 max-w-[200px]">
            Compartilhe uma música ou playlist para começar a ouvir junto.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-muted/60 mt-1">
          <SkipBack size={14} strokeWidth={1.5} />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background:
                'linear-gradient(180deg, var(--space-accent) 0%, #e23463 100%)',
              boxShadow: '0 4px 14px -4px var(--space-accent-glow-32)',
            }}
          >
            <Play size={14} strokeWidth={2} className="text-strong translate-x-[1px]" />
          </button>
          <SkipForward size={14} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  )
}
