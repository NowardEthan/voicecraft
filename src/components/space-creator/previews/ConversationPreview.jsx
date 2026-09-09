/**
 * ConversationPreview — preview of a "Conversa" (text channel) room.
 *
 * Layout (from spec):
 *   - Compact header: coral icon, room name, type label, 3-dots menu
 *   - Centered empty state with chat icon + "Sua primeira conversa começa aqui."
 *   - Bottom message input (placeholder "Escreva uma mensagem…")
 *
 * All static — no real data, no composer wiring. Pure visual.
 */
import { MessageCircle, Plus, Send, MoreHorizontal } from 'lucide-react'

export function ConversationPreview({ roomName, typeLabel }) {
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
          <MessageCircle size={18} strokeWidth={1.7} className="text-[#ffb3c2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-strong leading-tight truncate">
            {roomName || 'geral'}
          </p>
          <p className="text-[11px] text-muted leading-tight">{typeLabel || 'Conversa'}</p>
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-white/5 transition-colors"
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3 min-h-[140px]">
        <div className="relative">
          <div className="absolute inset-0 -m-3 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(255,63,108,0.18), transparent 70%)' }} />
          <MessageCircle size={32} strokeWidth={1.4} className="relative text-[#ffb3c2]" />
        </div>
        <p className="text-[12.5px] text-muted leading-relaxed max-w-[240px]">
          Sua primeira conversa começa aqui.
        </p>
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-line">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-ink hover:bg-white/5 transition-colors shrink-0"
        >
          <Plus size={15} strokeWidth={1.75} />
        </button>
        <div className="flex-1 h-8 rounded-md bg-[#0f1014] border border-line flex items-center px-3 text-[12px] text-muted">
          Escreva uma mensagem…
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-accent hover:bg-white/5 transition-colors shrink-0"
        >
          <Send size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}
