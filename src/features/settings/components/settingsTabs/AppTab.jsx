import { useEffect, useState } from 'react'
import { Cpu, Gauge, Mic, RefreshCw, Download, Sliders, Volume2 } from 'lucide-react'
import { detectGpu } from '../../../../utils/gpu'
import { flashToast } from '../../../../shared/utils/toast'
import { PERF_MODES, resolvePerfProfile } from '../../../../shared/perf/perfProfile'
import { probeHardware } from '../../../../shared/perf/hardwareProbe'

const HAS_ELECTRON_AUDIO = typeof window !== 'undefined' && !!window.electronAPI?.audioService
const HAS_UPDATER = typeof window !== 'undefined' && !!window.electronAPI?.updater

function statusLabel(status, percent, version) {
  switch (status) {
    case 'checking':
      return 'Procurando atualizações…'
    case 'available':
      return version ? `Nova versão ${version} disponível — baixando…` : 'Nova versão disponível — baixando…'
    case 'downloading':
      return `Baixando… ${Math.max(0, Math.min(100, Math.round(percent || 0)))}%`
    case 'downloaded':
      return version ? `Versão ${version} pronta para instalar` : 'Atualização pronta para instalar'
    case 'not-available':
      return 'Você já está na versão mais recente'
    case 'error':
      return 'Não foi possível verificar atualizações'
    default:
      return null
  }
}

function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`rounded-full transition-colors relative shrink-0 ${on ? 'bg-accent' : 'bg-white/15'}`}
      style={{ height: 22, width: 40 }}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          on ? 'translate-x-[20px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function formatGpuLabel(gpuInfo) {
  const device = gpuInfo?.info?.device?.trim()
  const vendor = gpuInfo?.info?.vendor?.trim()
  if (device && device.toLowerCase() !== 'gpu' && device.toLowerCase() !== 'gpu detectada') {
    return device
  }
  if (vendor && vendor.toLowerCase() !== 'desconhecido') return vendor
  return 'GPU detectada'
}

export default function AppTab({ draft, setDraft }) {
  const [gpuInfo, setGpuInfo] = useState(() => ({ supported: null, info: null }))
  const [machine, setMachine] = useState(null)
  const [appVersion, setAppVersion] = useState(null)
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', percent: 0, version: null, message: null })
  const [checking, setChecking] = useState(false)

  const perfMode = draft.perfMode || 'auto'
  const preview = resolvePerfProfile(perfMode)

  useEffect(() => {
    let cancelled = false
    // Defer one frame so the tab paints toggles before GPU probe.
    const id = requestAnimationFrame(() => {
      detectGpu().then((res) => {
        if (!cancelled) setGpuInfo(res)
      })
      probeHardware().then((probe) => {
        if (!cancelled) setMachine(probe)
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [])

  useEffect(() => {
    if (!HAS_UPDATER) return undefined
    let cancelled = false
    window.electronAPI.updater.getVersion().then((v) => {
      if (!cancelled && v) setAppVersion(v)
    }).catch(() => {})
    const off = window.electronAPI.updater.onStatus((payload) => {
      if (!payload || cancelled) return
      setUpdateStatus((prev) => ({
        status: payload.status || prev.status,
        percent: typeof payload.percent === 'number' ? payload.percent : prev.percent,
        version: payload.version ?? prev.version,
        message: payload.message || null,
      }))
      if (payload.status === 'checking' || payload.status === 'downloading' || payload.status === 'available') {
        setChecking(true)
      } else {
        setChecking(false)
      }
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  const handleCheckUpdate = async () => {
    if (!HAS_UPDATER || checking) return
    setChecking(true)
    setUpdateStatus((s) => ({ ...s, status: 'checking', message: null }))
    try {
      const res = await window.electronAPI.updater.check()
      if (!res?.ok) {
        setUpdateStatus({ status: 'error', percent: 0, version: null, message: res?.error || null })
        flashToast(res?.error || 'Falha ao verificar atualizações', { duration: 2800 })
      }
    } catch (err) {
      setUpdateStatus({ status: 'error', percent: 0, version: null, message: err?.message || null })
      flashToast(err?.message || 'Falha ao verificar atualizações', { duration: 2800 })
    } finally {
      setChecking(false)
    }
  }

  const handleInstallUpdate = async () => {
    if (!HAS_UPDATER) return
    flashToast('Reiniciando para instalar…', { duration: 2000 })
    try {
      await window.electronAPI.updater.install()
    } catch (err) {
      flashToast(err?.message || 'Falha ao instalar', { duration: 2800 })
    }
  }

  const updateHint = statusLabel(updateStatus.status, updateStatus.percent, updateStatus.version)
    || (updateStatus.message || null)

  const tierLabel = { high: 'Alto', mid: 'Médio', low: 'Leve' }[preview.tier] || preview.tier
  const cores = machine?.cores ?? preview.cores
  const ramGb = machine?.ramGb ?? preview.ramGb

  return (
    <div className="max-w-xl space-y-5">
      <div className="rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <Gauge size={14} className="text-accent" strokeWidth={1.75} />
          <p className="text-[13px] font-semibold text-strong">Modo de desempenho</p>
        </div>
        <p className="text-[11.5px] text-muted leading-snug">
          Auto usa mais cache/GPU em PCs fortes e reduz carga em fracos. Mudanças que
          afetam o Chromium (ex. Desempenho → zero-copy) pedem reinício.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERF_MODES.map((m) => {
            const on = perfMode === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, perfMode: m.id }))}
                className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  on
                    ? 'border-accent/50 bg-accent/15 text-strong'
                    : 'border-white/[0.08] bg-white/[0.03] text-ink hover:bg-white/[0.06]'
                }`}
              >
                <p className="text-[12px] font-semibold">{m.label}</p>
                <p className="text-[10px] text-muted mt-0.5 leading-snug">{m.hint}</p>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted">
          Perfil ativo: <span className="text-strong font-medium">{tierLabel}</span>
          {' · '}cache {preview.budgets.imageWarmMax}
          {' · '}share {preview.budgets.shareQuality}/{preview.budgets.shareFps}fps
        </p>
      </div>

      <label className="flex items-start justify-between gap-4 cursor-pointer rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-accent" strokeWidth={1.75} />
            <p className="text-[13px] font-semibold text-strong">Aceleração por GPU</p>
          </div>
          <p className="text-[11.5px] text-muted mt-1.5 leading-snug">
            Recomendado. Acelera captura de tela e renderização. Reinicie o app após alterar.
          </p>
        </div>
        <Toggle
          on={!!draft.gpuAcceleration}
          onChange={(v) => setDraft((d) => ({ ...d, gpuAcceleration: v }))}
        />
      </label>

      {HAS_ELECTRON_AUDIO && (
        <label className="flex items-start justify-between gap-4 cursor-pointer rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Mic size={14} className="text-accent" strokeWidth={1.75} />
              <p className="text-[13px] font-semibold text-strong">Audio service (C++)</p>
            </div>
            <p className="text-[11.5px] text-muted mt-1.5 leading-snug">
              Captura de áudio via processo nativo. Requer compilar <code className="text-ink bg-white/[0.06] px-1 rounded">audio-service/</code>.
              {preview.budgets.preferAudioService ? ' Recomendado no seu perfil de desempenho.' : ''}
            </p>
          </div>
          <Toggle
            on={!!draft.useAudioService}
            onChange={(v) => setDraft((d) => ({ ...d, useAudioService: v }))}
          />
        </label>
      )}

      <label className="flex items-center justify-between gap-4 cursor-pointer rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Volume2 size={14} className="text-accent" strokeWidth={1.75} />
            <p className="text-[13px] font-semibold text-strong">Sons da call</p>
          </div>
          <p className="text-[11.5px] text-muted mt-1.5 leading-snug">
            Toques ao entrar, sair, mute e quando alguém chega ou sai da sala.
          </p>
        </div>
        <Toggle
          on={draft.callSounds !== false}
          onChange={(v) => setDraft((d) => ({ ...d, callSounds: v }))}
        />
      </label>

      <label className="flex items-center justify-between gap-4 cursor-pointer rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Sliders size={14} className="text-accent" strokeWidth={1.75} />
          <p className="text-[13px] font-semibold text-strong">Iniciar minimizado</p>
        </div>
        <Toggle
          on={!!draft.startMinimized}
          onChange={(v) => setDraft((d) => ({ ...d, startMinimized: v }))}
        />
      </label>

      <div className="rounded-2xl border border-white/[0.07] bg-[#0d0e12] px-4 py-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Sua máquina</p>
        {gpuInfo.supported === null && !machine ? (
          <p className="text-[12px] text-muted">Detectando hardware…</p>
        ) : (
          <>
            <div>
              <p className="text-[11px] text-muted mb-0.5">GPU</p>
              <p className="text-[12.5px] text-strong font-medium break-words">
                {formatGpuLabel(gpuInfo.supported != null ? gpuInfo : { info: { device: machine?.gpu?.info?.device } })}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink">
              <span><span className="text-muted">CPU</span> {cores} cores</span>
              <span>
                <span className="text-muted">RAM</span>{' '}
                {ramGb != null ? `~${ramGb} GB` : '—'}
              </span>
              <span>
                <span className="text-muted">Auto</span>{' '}
                {(machine?.autoTier || preview.autoTier || 'mid')}
              </span>
            </div>
          </>
        )}
      </div>

      <label className="flex items-start justify-between gap-4 cursor-pointer rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-strong">Overlay de desempenho</p>
          <p className="text-[11.5px] text-muted mt-1.5 leading-snug">
            Mostra FPS, memória e tier no canto da janela (útil para afinar o perfil).
          </p>
        </div>
        <Toggle
          on={!!draft.perfHud}
          onChange={(v) => setDraft((d) => ({ ...d, perfHud: v }))}
        />
      </label>

      {HAS_UPDATER && (
        <div className="rounded-2xl border border-white/[0.07] bg-[#12141a]/70 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw size={14} className="text-accent" strokeWidth={1.75} />
            <p className="text-[13px] font-semibold text-strong">Atualizações</p>
          </div>
          <p className="text-[12px] text-muted">
            Versão instalada:{' '}
            <span className="text-strong font-medium">{appVersion || '…'}</span>
          </p>
          {updateHint && <p className="text-[12px] text-ink">{updateHint}</p>}
          {updateStatus.status === 'downloading' && (
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-accent transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, updateStatus.percent || 0))}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {updateStatus.status === 'downloaded' ? (
              <button
                type="button"
                onClick={handleInstallUpdate}
                className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-on-accent bg-accent hover:opacity-90 inline-flex items-center gap-1.5"
              >
                <Download size={13} strokeWidth={1.75} />
                Reiniciar e instalar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCheckUpdate}
                disabled={checking || updateStatus.status === 'downloading'}
                className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold text-ink bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <RefreshCw size={13} strokeWidth={1.75} className={checking ? 'animate-spin' : ''} />
                Verificar atualizações
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
