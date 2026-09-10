import { useEffect, useState } from 'react'
import { Cpu, Mic, RefreshCw, Download, Sliders, Volume2 } from 'lucide-react'
import { detectGpu } from '../../../../utils/gpu'
import { flashToast } from '../../../../shared/utils/toast'

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
  const [gpuInfo, setGpuInfo] = useState({ supported: null, info: null })
  const [appVersion, setAppVersion] = useState(null)
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', percent: 0, version: null, message: null })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    let cancelled = false
    detectGpu().then((res) => {
      if (!cancelled) setGpuInfo(res)
    })
    return () => { cancelled = true }
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

  return (
    <div className="max-w-xl space-y-5">
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

      <div className="rounded-2xl border border-white/[0.07] bg-[#0d0e12] px-4 py-3">
        {gpuInfo.supported === null ? (
          <p className="text-[12px] text-muted">Detectando GPU…</p>
        ) : (
          <div>
            <p className="text-[11px] text-muted mb-0.5">GPU</p>
            <p className="text-[12.5px] text-strong font-medium break-words">
              {formatGpuLabel(gpuInfo)}
            </p>
          </div>
        )}
      </div>

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
