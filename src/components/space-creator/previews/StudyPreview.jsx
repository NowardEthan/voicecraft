/**
 * StudyPreview — preview of an "Estudo" (study / shared references) room.
 *
 * Visual: room name header, then a "referências compartilhadas" area
 * (document rows), then an empty state line. Study rooms in Voice
 * are text channels that focus on shared material.
 */
import { BookOpen, FileText, Plus } from 'lucide-react'

export function StudyPreview({ roomName, typeLabel }) {
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
          <BookOpen size={18} strokeWidth={1.7} className="text-[#ffb3c2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-strong leading-tight truncate">
            {roomName || 'estudos'}
          </p>
          <p className="text-[11px] text-muted leading-tight">{typeLabel || 'Estudo'}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 py-4 gap-3 min-h-[140px]">
        <p className="text-[10.5px] font-semibold text-muted uppercase tracking-wider">
          Referências compartilhadas
        </p>
        <div className="rounded-[10px] border border-dashed border-line p-4 flex flex-col items-center justify-center text-center gap-2 min-h-[88px]">
          <div className="flex items-center gap-1.5">
            <FileText size={14} strokeWidth={1.5} className="text-muted/60" />
            <span className="text-[11.5px] text-muted">Nenhum material ainda</span>
          </div>
          <p className="text-[10.5px] text-muted/80 leading-snug max-w-[180px]">
            Links, PDFs e notas vão aparecer aqui quando forem adicionados.
          </p>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="inline-flex items-center gap-1 h-[24px] px-2.5 rounded-md bg-[#0f1014] border border-line text-[10.5px] text-muted hover:text-ink transition-colors"
          >
            <Plus size={11} strokeWidth={2} />
            Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}
