import { useEffect, useMemo, useState } from 'react'
import { AppWindow, Info, Monitor, Search, Sparkles, X } from 'lucide-react'
import { ModalShell } from '../../../../../shared/motion/ModalShell.jsx'
import { looksLikeBrowserWindow } from '../../../../../hooks/useScreenShare'

function processLabel(process) {
  const title = String(process.title || '').trim()
  const name = String(process.name || '').trim()
  if (title && name && title.toLowerCase() !== name.toLowerCase()) {
    return { primary: title, secondary: name }
  }
  return { primary: title || name || `PID ${process.pid}`, secondary: null }
}

export function ScreenSharePicker({ open, sources = [], onPick, onClose }) {
  const screens = sources.filter((source) => source.isScreen)
  const windows = sources.filter((source) => !source.isScreen)
  const [audioMode, setAudioMode] = useState('off')
  const [processes, setProcesses] = useState([])
  const [selectedPid, setSelectedPid] = useState('')
  const [processQuery, setProcessQuery] = useState('')
  const [loadingProcesses, setLoadingProcesses] = useState(false)

  useEffect(() => {
    if (!open) {
      setAudioMode('off')
      setProcessQuery('')
      return undefined
    }
    const listProcesses = window.electronAPI?.audioService?.listProcesses
    if (!listProcesses) return undefined
    let cancelled = false
    setLoadingProcesses(true)
    listProcesses()
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return
        setProcesses(list)
        setSelectedPid((previous) => (
          previous && list.some((process) => String(process.pid) === previous)
            ? previous
            : String(list[0]?.pid || '')
        ))
      })
      .catch(() => {
        if (!cancelled) setProcesses([])
      })
      .finally(() => {
        if (!cancelled) setLoadingProcesses(false)
      })
    return () => { cancelled = true }
  }, [open])

  const filteredProcesses = useMemo(() => {
    const query = processQuery.trim().toLowerCase()
    if (!query) return processes
    return processes.filter((process) => (
      String(process.title || '').toLowerCase().includes(query)
      || String(process.name || '').toLowerCase().includes(query)
      || String(process.pid).includes(query)
    ))
  }, [processQuery, processes])

  const pick = (sourceId) => {
    if (audioMode === 'app' && !selectedPid) return
    onPick?.(sourceId, {
      audioMode,
      appPid: audioMode === 'app' ? Number(selectedPid) : undefined,
    })
  }

  return (
    <ModalShell open={open} onClose={onClose} labelledBy="share-title" maxWidth="lg">
      <div className="bg-surface1 border border-line rounded-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            <h2 id="share-title" className="text-[15px] font-semibold text-strong">Compartilhar tela</h2>
            <p className="text-[12px] text-muted mt-0.5">Escolha a fonte e um dos três modos seguros de áudio.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-lg text-muted hover:text-strong hover:bg-white/[0.06] inline-flex items-center justify-center">
            <X size={15} />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-5">
          <div className="flex gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
            <Info size={14} className="text-accent shrink-0 mt-0.5" />
            <p className="text-[12px] text-ink leading-snug">
              O vídeo nunca inclui áudio do desktop. Os modos de áudio abaixo usam a captura nativa validada antes de publicar.
            </p>
          </div>

          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Áudio do compartilhamento</p>
            <AudioMode value="off" selected={audioMode} onSelect={setAudioMode} label="Sem áudio (apenas vídeo)" />

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <AudioMode value="app" selected={audioMode} onSelect={setAudioMode} label="Um aplicativo" icon />
              {audioMode === 'app' && (
                <div className="pl-6 space-y-2 pt-2">
                  <p className="text-[11.5px] text-muted">Deixe o aplicativo tocando para validar áudio não silencioso.</p>
                  <div className="relative max-w-md">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                    <input type="search" value={processQuery} onChange={(event) => setProcessQuery(event.target.value)} placeholder="Buscar aplicativo ou janela…" className="w-full rounded-lg bg-surface2 border border-white/[0.12] text-[12px] text-strong pl-8 pr-2.5 py-1.5 focus:outline-none focus:border-accent" />
                  </div>
                  <div role="listbox" aria-label="Aplicativos abertos" className="max-w-md max-h-40 overflow-y-auto rounded-lg border border-white/[0.12] bg-surface2 divide-y divide-white/[0.06]">
                    {loadingProcesses && <p className="px-2.5 py-2 text-[12px] text-muted">Carregando aplicativos…</p>}
                    {!loadingProcesses && filteredProcesses.length === 0 && <p className="px-2.5 py-2 text-[12px] text-muted">Nenhum aplicativo disponível.</p>}
                    {filteredProcesses.map((process) => {
                      const label = processLabel(process)
                      const selected = String(process.pid) === selectedPid
                      return (
                        <button key={process.pid} type="button" role="option" aria-selected={selected} onClick={() => setSelectedPid(String(process.pid))} className={`w-full text-left px-2.5 py-1.5 ${selected ? 'bg-accent/15 ring-1 ring-inset ring-accent/40' : 'hover:bg-white/[0.06]'}`}>
                          <span className="block text-[12px] font-medium text-strong truncate">{selected ? '✓ ' : ''}{label.primary}</span>
                          {label.secondary && <span className="block text-[10.5px] text-muted truncate">{label.secondary}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
              <AudioMode value="system-excluding-voice" selected={audioMode} onSelect={setAudioMode} label="Sistema, excluindo o VoiceCraft" icon />
              {audioMode === 'system-excluding-voice' && (
                <p className="pl-6 pt-2 text-[11.5px] text-muted leading-snug">Captura o áudio do Windows, mas exclui toda a árvore de processos do VoiceCraft para não recapturar a chamada.</p>
              )}
            </div>
          </div>

          <SourceGroup title="Telas" icon={Monitor} items={screens} onPick={pick} />
          <SourceGroup title="Janelas" icon={AppWindow} items={windows} onPick={pick} warnBrowser />
          {sources.length === 0 && <p className="text-[13px] text-muted text-center py-8">Nenhuma fonte encontrada.</p>}
        </div>
      </div>
    </ModalShell>
  )
}

function AudioMode({ value, selected, onSelect, label, icon = false }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <input type="radio" name="audioMode" value={value} checked={selected === value} onChange={() => onSelect(value)} className="accent-[var(--space-accent)]" />
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-strong">
        {icon && <Sparkles size={13} className="text-accent" />}
        {label}
      </span>
    </label>
  )
}

function SourceGroup({ title, icon: Icon, items, onPick, warnBrowser = false }) {
  if (!items.length) return null
  return (
    <section>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted mb-2.5 inline-flex items-center gap-1.5"><Icon size={12} />{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {items.map((source) => {
          const browser = warnBrowser && looksLikeBrowserWindow(source.name)
          return (
            <button key={source.id} type="button" onClick={() => onPick(source.id)} className="group text-left rounded-xl overflow-hidden border border-white/[0.08] bg-[#0d0e12] hover:border-accent/50 transition-colors">
              <div className="aspect-video bg-black/40 overflow-hidden">
                {source.thumbnail ? <img src={source.thumbnail} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-muted"><Icon size={22} /></div>}
              </div>
              <p className="px-2.5 py-2 text-[12px] text-strong truncate group-hover:text-accent">{source.name}</p>
              {browser && <p className="px-2.5 pb-2 text-[10.5px] text-muted">Pode ficar cinza ao focar o app</p>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default ScreenSharePicker
