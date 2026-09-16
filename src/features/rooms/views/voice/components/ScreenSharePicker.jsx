import { useState, useEffect, useMemo } from 'react'
import { Monitor, AppWindow, X, Info, Volume2, Headphones, Sparkles, Search } from 'lucide-react'
import { ModalShell } from '../../../../../shared/motion/ModalShell.jsx'
import { looksLikeBrowserWindow } from '../../../../../hooks/useScreenShare'
import useReducedMotion from '../../../../../hooks/useReducedMotion'

function processLabel(p) {
  const title = String(p.title || '').trim()
  const name = String(p.name || '').trim()
  if (title && name && title.toLowerCase() !== name.toLowerCase()) {
    return { primary: title, secondary: name }
  }
  return { primary: title || name || `PID ${p.pid}`, secondary: null }
}

export function ScreenSharePicker({ open, sources = [], onPick, onClose }) {
  const reducedMotion = useReducedMotion()

  const screens = sources.filter((s) => s.isScreen)
  const windows = sources.filter((s) => !s.isScreen)
  const [audioMode, setAudioMode] = useState('off') // 'off' | 'app' | 'system'
  // Default off: system loopback re-captures call playback → echo when remotes are audible.
  const [usingHeadphones, setUsingHeadphones] = useState(false)
  const [processes, setProcesses] = useState([])
  const [selectedPid, setSelectedPid] = useState('')
  const [processQuery, setProcessQuery] = useState('')
  const [loadingProcs, setLoadingProcs] = useState(false)

  useEffect(() => {
    if (!open) {
      setProcessQuery('')
      return
    }
    if (!window.electronAPI?.audioService?.listProcesses) return
    let cancelled = false
    setLoadingProcs(true)
    window.electronAPI.audioService.listProcesses()
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return
        setProcesses(list)
        setSelectedPid((prev) => {
          if (prev && list.some((p) => String(p.pid) === String(prev))) return prev
          return list[0] ? String(list[0].pid) : ''
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingProcs(false) })
    return () => { cancelled = true }
  }, [open])

  const filteredProcesses = useMemo(() => {
    const q = processQuery.trim().toLowerCase()
    if (!q) return processes
    return processes.filter((p) => {
      const title = String(p.title || '').toLowerCase()
      const name = String(p.name || '').toLowerCase()
      return title.includes(q) || name.includes(q) || String(p.pid).includes(q)
    })
  }, [processes, processQuery])

  const withSystemAudio = audioMode === 'system'
  const pick = (sourceId) => {
    if (audioMode === 'app' && !selectedPid) {
      // Keep picker open — user must pick an app first.
      return
    }
    onPick?.(sourceId, {
      // Desktop loopback only for full system audio. App mode uses WASAPI by PID.
      withAudio: withSystemAudio,
      headphones: audioMode === 'app' || (withSystemAudio && usingHeadphones),
      audioMode,
      appPid: audioMode === 'app' && selectedPid ? parseInt(selectedPid, 10) : null,
    })
  }

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

            {audioMode !== 'off' && (
              <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-200">
                <Headphones size={15} className="shrink-0 text-amber-400" />
                <p className="text-[12px] leading-snug">
                  <span className="font-semibold text-amber-300">Recomendamos fones de ouvido:</span> use fones para evitar retorno ou eco no áudio da chamada.
                </p>
              </div>
            )}

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
            <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.05] transition-colors">
              <label className="flex items-center gap-3 cursor-pointer select-none">
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
              </label>
              {audioMode === 'app' && (
                <div className="pl-6 space-y-2 pt-1">
                  <p className="text-[11.5px] text-muted leading-snug">
                    1) Deixe o YouTube/jogo <span className="text-strong">tocando</span> ·
                    2) Clique no app na lista · 3) Escolha a tela/janela abaixo.
                  </p>
                  <div className="relative max-w-md">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input
                      type="search"
                      value={processQuery}
                      onChange={(e) => setProcessQuery(e.target.value)}
                      placeholder="Buscar app ou janela…"
                      className="w-full rounded-lg bg-surface2 border border-white/[0.12] text-[12px] text-strong pl-8 pr-2.5 py-1.5 focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div
                    role="listbox"
                    aria-label="Aplicativos abertos"
                    className="max-w-md max-h-40 overflow-y-auto rounded-lg border border-white/[0.12] bg-surface2 divide-y divide-white/[0.06]"
                  >
                    {loadingProcs && (
                      <p className="px-2.5 py-2 text-[12px] text-muted">Carregando apps abertos…</p>
                    )}
                    {!loadingProcs && filteredProcesses.length === 0 && (
                      <p className="px-2.5 py-2 text-[12px] text-muted">
                        {processQuery.trim()
                          ? 'Nenhum app bate com a busca.'
                          : 'Nenhum aplicativo com janela aberta encontrado.'}
                      </p>
                    )}
                    {filteredProcesses.map((p) => {
                      const { primary, secondary } = processLabel(p)
                      const selected = String(selectedPid) === String(p.pid)
                      return (
                        <button
                          key={p.pid}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setSelectedPid(String(p.pid))
                          }}
                          className={
                            'w-full text-left px-2.5 py-1.5 transition-colors ' +
                            (selected
                              ? 'bg-accent/15 text-strong ring-1 ring-inset ring-accent/40'
                              : 'text-strong hover:bg-white/[0.06]')
                          }
                        >
                          <span className="block text-[12px] font-medium truncate">
                            {selected ? '✓ ' : ''}{primary}
                          </span>
                          {secondary && (
                            <span className="block text-[10.5px] text-muted truncate">{secondary}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {selectedPid && (
                    <p className="text-[11px] text-accent leading-snug">
                      App selecionado. Agora clique numa tela ou janela abaixo para compartilhar.
                    </p>
                  )}
                </div>
              )}
            </div>

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
                    Captura o som de todas as janelas. Pode gerar eco se a call tocar no mesmo dispositivo —
                    prefira “áudio do aplicativo” acima.
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
                      Ouvir a call mesmo assim (pode dar eco)
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

export default ScreenSharePicker

