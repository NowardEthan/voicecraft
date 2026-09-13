import { useState, useEffect } from 'react'
import { Monitor, AppWindow, X, Info, Volume2, Headphones, Sparkles } from 'lucide-react'
import { ModalShell } from '../../../../../shared/motion/ModalShell.jsx'
import { looksLikeBrowserWindow } from '../../../../../hooks/useScreenShare'

export function ScreenSharePicker({ open, sources = [], onPick, onClose }) {
  const screens = sources.filter((s) => s.isScreen)
  const windows = sources.filter((s) => !s.isScreen)
  const [audioMode, setAudioMode] = useState('off') // 'off' | 'app' | 'system'
  const [usingHeadphones, setUsingHeadphones] = useState(true)
  const [processes, setProcesses] = useState([])
  const [selectedPid, setSelectedPid] = useState('')

  useEffect(() => {
    if (!open) return
    if (window.electronAPI?.audioService?.listProcesses) {
      window.electronAPI.audioService.listProcesses().then((list) => {
        if (Array.isArray(list)) {
          setProcesses(list)
          if (list.length > 0 && !selectedPid) {
            setSelectedPid(String(list[0].pid))
          }
        }
      }).catch(() => {})
    }
  }, [open, selectedPid])

  const withSystemAudio = audioMode === 'system'
  const pick = (sourceId) => onPick?.(sourceId, {
    withAudio: audioMode !== 'off',
    headphones: withSystemAudio && usingHeadphones,
    audioMode,
    appPid: audioMode === 'app' && selectedPid ? parseInt(selectedPid, 10) : null,
  })

  return (
    <ModalShell open={open} onClose={onClose} labelledBy="share-title" maxWidth="lg">
      <div className="bg-surface1 border border-line rounded-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            <h2 id="share-title" className="text-[15px] font-semibold text-strong">
              Compartilhar tela
            </h2>
            <p className="text-[12px] text-muted mt-0.5">Pra jogar: escolha a janela do jogo · qualidade leve.</p>
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
              <span className="text-strong font-medium">Jogando + call:</span> compartilhe a{' '}
              <span className="text-strong font-medium">janela do jogo</span> (não a tela inteira),
              use HD/Leve a 15 fps nas configurações e deixe áudio do sistema desligado se só forem falar no mic.
              YouTube/Chrome em janela ficam cinza — aí sim use a tela inteira.
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Áudio do compartilhamento
            </p>

            {/* Opção 1: Desligado */}
            <label className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 cursor-pointer select-none hover:bg-white/[0.05] transition-colors">
              <input
                type="radio"
                name="audioMode"
                value="off"
                checked={audioMode === 'off'}
                onChange={() => setAudioMode('off')}
                className="accent-[var(--space-accent)]"
              />
              <span className="text-[12.5px] font-medium text-strong">Sem áudio (apenas vídeo)</span>
            </label>

            {/* Opção 2: Estilo Discord — Áudio por App */}
            <label className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 cursor-pointer select-none hover:bg-white/[0.05] transition-colors">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="audioMode"
                  value="app"
                  checked={audioMode === 'app'}
                  onChange={() => setAudioMode('app')}
                  className="accent-[var(--space-accent)]"
                />
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-strong">
                  <Sparkles size={13} className="text-accent" />
                  Capturar áudio do aplicativo (estilo Discord — sem eco da call)
                </span>
              </div>
              {audioMode === 'app' && (
                <div className="pl-6 space-y-1.5 pt-1">
                  <p className="text-[11.5px] text-muted leading-snug">
                    Captura apenas o som do jogo ou app selecionado. Os amigos ouvem o jogo sem eco da própria voz e sem precisar mutar o seu PC.
                  </p>
                  <select
                    value={selectedPid}
                    onChange={(e) => setSelectedPid(e.target.value)}
                    className="w-full max-w-sm rounded-lg bg-surface2 border border-white/[0.12] text-[12px] text-strong px-2.5 py-1.5 focus:outline-none focus:border-accent"
                  >
                    {processes.map((p) => (
                      <option key={p.pid} value={p.pid}>
                        {p.name} (PID: {p.pid})
                      </option>
                    ))}
                    {processes.length === 0 && (
                      <option value="">Nenhum aplicativo com áudio detectado no momento</option>
                    )}
                  </select>
                </div>
              )}
            </label>

            {/* Opção 3: Sistema inteiro */}
            <label className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 cursor-pointer select-none hover:bg-white/[0.05] transition-colors">
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  name="audioMode"
                  value="system"
                  checked={audioMode === 'system'}
                  onChange={() => setAudioMode('system')}
                  className="accent-[var(--space-accent)]"
                />
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-strong">
                  <Volume2 size={13} />
                  Capturar todo o áudio do Windows (sistema inteiro)
                </span>
              </div>
              {audioMode === 'system' && (
                <div className="pl-6 space-y-2 pt-1">
                  <p className="text-[11.5px] text-muted leading-snug">
                    Captura o som de todas as janelas do Windows. Sem fones, a call fica muda no seu PC pra não gerar eco.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={usingHeadphones}
                      onChange={(e) => setUsingHeadphones(e.target.checked)}
                      className="accent-[var(--space-accent)]"
                    />
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-strong">
                      <Headphones size={12} />
                      Estou de fones de ouvido (manter voz da call ativa)
                    </span>
                  </label>
                </div>
              )}
            </label>
          </div>

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
