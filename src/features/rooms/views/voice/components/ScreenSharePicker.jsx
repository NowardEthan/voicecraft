import { useState } from 'react'
import { Monitor, AppWindow, X, Info, Volume2 } from 'lucide-react'
import { ModalShell } from '../../../../../shared/motion/ModalShell.jsx'
import { looksLikeBrowserWindow } from '../../../../../hooks/useScreenShare'

export function ScreenSharePicker({ open, sources = [], onPick, onClose }) {
  const screens = sources.filter((s) => s.isScreen)
  const windows = sources.filter((s) => !s.isScreen)
  const [withSystemAudio, setWithSystemAudio] = useState(false)

  const pick = (sourceId) => onPick?.(sourceId, { withAudio: withSystemAudio })

  return (
    <ModalShell open={open} onClose={onClose} labelledBy="share-title" maxWidth="lg">
      <div className="bg-surface1 border border-line rounded-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            <h2 id="share-title" className="text-[15px] font-semibold text-strong">
              Compartilhar tela
            </h2>
            <p className="text-[12px] text-muted mt-0.5">Prefira uma tela — janelas de navegador ficam cinza.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg text-muted hover:text-strong hover:bg-white/[0.06] inline-flex items-center justify-center"
          >
            <X size={15} />
          </button>
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
            <Info size={14} className="text-accent shrink-0 mt-0.5" />
            <p className="text-[12px] text-ink leading-snug">
              YouTube e abas do Chrome ficam cinza ou borrados quando você volta pro VoiceCraft — o Windows para de desenhar o vídeo da janela oculta. Compartilhe a <span className="text-strong font-medium">tela inteira</span> e deixe o vídeo visível (janela ao lado ou segundo monitor).
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={withSystemAudio}
              onChange={(e) => setWithSystemAudio(e.target.checked)}
              className="mt-0.5 accent-[var(--space-accent)]"
            />
            <span className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-strong">
                <Volume2 size={13} />
                Incluir áudio do sistema
              </span>
              <span className="block text-[11.5px] text-muted mt-0.5 leading-snug">
                Para jogo/YouTube. Use fones — senão a call entra no loopback e o outro ouve a própria voz.
              </span>
            </span>
          </label>

          <SourceGroup title="Telas" icon={Monitor} items={screens} onPick={pick} />
          <SourceGroup title="Janelas" icon={AppWindow} items={windows} onPick={pick} warnBrowser />
          {sources.length === 0 && (
            <p className="text-[13px] text-muted text-center py-8">Nenhuma fonte encontrada.</p>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function SourceGroup({ title, icon: Icon, items, onPick, warnBrowser = false }) {
  if (!items.length) return null
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-2.5 inline-flex items-center gap-1.5">
        <Icon size={12} />
        {title}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {items.map((source) => {
          const browser = warnBrowser && looksLikeBrowserWindow(source.name)
          return (
          <button
            key={source.id}
            type="button"
            onClick={() => onPick(source.id)}
            className="group text-left rounded-xl overflow-hidden border border-white/[0.08] bg-[#0d0e12] hover:border-accent/50 transition-colors"
          >
            <div className="aspect-video bg-black/40 overflow-hidden">
              {source.thumbnail ? (
                <img src={source.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">
                  <Icon size={22} />
                </div>
              )}
            </div>
            <p className="px-2.5 py-2 text-[12px] text-strong truncate group-hover:text-accent">
              {source.name}
            </p>
            {browser && (
              <p className="px-2.5 pb-2 text-[10.5px] text-muted leading-snug">
                Pode ficar cinza ao focar o app
              </p>
            )}
          </button>
          )
        })}
      </div>
    </section>
  )
}
