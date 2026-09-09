import { useEffect, useState } from 'react'
import { X, Mic, Volume2, MonitorUp, Sliders, Cpu, Zap, LogOut } from 'lucide-react'
import { enumerateMics, watchDeviceChanges } from '../../../utils/devices'
import { detectGpu } from '../../../utils/gpu'
import { ModalShell } from '../../../shared/motion/ModalShell.jsx'

const HAS_ELECTRON_AUDIO = typeof window !== 'undefined' && !!window.electronAPI?.audioService

/**
 * Settings modal — accessible from the home screen.
 * Lets the user pick the default microphone, configure defaults that are
 * applied on the next call, and toggle GPU acceleration. All values are
 * persisted through useSettings.
 */
export default function SettingsModal({ settings, onChange, onClose, account, onSignOut }) {
  const [mics, setMics] = useState([])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const list = await enumerateMics()
      if (!cancelled) setMics(list)
    }
    refresh()
    return watchDeviceChanges(refresh)
  }, [])

  // Detect GPU once on mount. Shown as informational read-only in the
  // "Desempenho" section.
  const [gpuInfo, setGpuInfo] = useState({ supported: null, info: null })
  useEffect(() => {
    let cancelled = false
    detectGpu().then((res) => {
      if (!cancelled) setGpuInfo(res)
    })
    return () => { cancelled = true }
  }, [])

  // Resolve a friendly label for the currently-saved deviceId.
  const currentMicLabel = mics.find(m => m.deviceId === settings.microphoneId)?.label
    || (settings.microphoneId ? 'Microfone desconhecido' : 'Padrão do sistema')

  return (
    <ModalShell
      open
      onClose={onClose}
      labelledBy="settings-title"
      maxWidth="md"
      panelClassName="rounded-2xl overflow-hidden"
      contentClassName=""
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(28, 28, 30, 0.98)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="px-6 pt-6 pb-4 border-b border-line flex items-start justify-between">
          <div>
            <h2 id="settings-title" className="text-[18px] font-semibold text-strong tracking-tight">
              Configurações
            </h2>
            <p className="text-[12px] text-muted mt-1">
              Aplicado na próxima chamada
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar configurações"
            title="Fechar"
            className="w-8 h-8 rounded-full hover:bg-surface2 flex items-center justify-center transition-all"
          >
            <X size={14} strokeWidth={1.75} className="text-ink" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {account && (
            <Section icon={LogOut} title="Conta">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-strong truncate">
                    {account.displayName || 'Sua conta'}
                  </p>
                  <p className="text-[12px] text-muted truncate">
                    {account.email || 'Conta conectada'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="h-8 px-3 rounded-lg text-[12px] font-medium text-ink bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] shrink-0"
                >
                  Sair
                </button>
              </div>
            </Section>
          )}

          {/* Microphone picker */}
          <Section icon={Mic} title="Microfone">
            <select
              value={settings.microphoneId || ''}
              onChange={(e) => onChange({ microphoneId: e.target.value || null })}
              className="w-full px-3 py-2 rounded-lg bg-surface1 border border-line text-strong text-[13px] focus:outline-none focus:border-accent transition-colors"
            >
              <option value="">Padrão do sistema</option>
              {mics.map(m => (
                <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
              ))}
            </select>
            {settings.microphoneId && (
              <p className="text-[11px] text-muted mt-1.5 leading-tight">
                Selecionado: {currentMicLabel}
              </p>
            )}
          </Section>

          {/* DSP default */}
          <Section icon={Volume2} title="Processamento de Áudio">
            <div className="flex gap-1.5">
              {[
                { key: 'off',   label: 'Sem filtro' },
                { key: 'light', label: 'Suave' },
                { key: 'strong', label: 'Forte' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => onChange({ dspLevel: key })}
                  className={`flex-1 px-3 py-2 rounded-lg text-[12px] font-medium transition-all duration-200 ${
                    settings.dspLevel === key
                      ? 'bg-accent-soft text-accent ring-1 ring-accent/30'
                      : 'bg-surface1 text-ink hover:bg-surface2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Section>

          {/* Screen share defaults */}
          <Section icon={MonitorUp} title="Compartilhamento de Tela">
            <div>
              <Label>Resolução padrão</Label>
              <div className="flex gap-1.5">
                {[
                  { key: '720p',  label: 'HD' },
                  { key: '1080p', label: 'Full HD' },
                  { key: '1440p', label: '2K' },
                  { key: '4k',    label: '4K' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => onChange({ screenQuality: key })}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                      settings.screenQuality === key
                        ? 'bg-accent-soft text-accent ring-1 ring-accent/30'
                        : 'bg-surface1 text-ink hover:bg-surface2'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <Label>FPS</Label>
              <div className="flex gap-1.5">
                {[15, 30, 60].map((fps) => (
                  <button
                    key={fps}
                    onClick={() => onChange({ screenFramerate: fps })}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                      settings.screenFramerate === fps
                        ? 'bg-accent-soft text-accent ring-1 ring-accent/30'
                        : 'bg-surface1 text-ink hover:bg-surface2'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted mt-2.5 leading-snug">
              HD a 30 fps deixa a sala bem mais leve. 2K, 4K e 60 fps pesam no PC — principalmente com YouTube.
            </p>
          </Section>

          {/* Performance: GPU acceleration toggle. Requires restart to take
              effect — when toggled, the change is persisted but Electron
              needs to apply `disableHardwareAcceleration()` BEFORE
              `app.whenReady()` on the next launch. */}
          <Section icon={Zap} title="Desempenho">
            <div className="space-y-3">
              <label className="flex items-start justify-between gap-3 cursor-pointer">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Cpu size={13} strokeWidth={1.75} className="text-ink" />
                    <span className="text-[13px] font-medium text-strong">Aceleração por GPU</span>
                  </div>
                  <p className="text-[11px] text-muted leading-tight mt-1 ml-5">
                    Recomendado. Acelera captura de tela, renderização de preview e encoding de vídeo. Reinicie o app após alterar.
                  </p>
                </div>
                <Toggle
                  on={settings.gpuAcceleration}
                  onChange={(v) => onChange({ gpuAcceleration: v })}
                />
              </label>

              {/* Audio service toggle — only relevant in Electron. In a plain
                  browser there's no electronAPI.audioService, so the toggle
                  would do nothing. */}
              {HAS_ELECTRON_AUDIO && (
                <label className="flex items-start justify-between gap-3 cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Mic size={13} strokeWidth={1.75} className="text-ink" />
                      <span className="text-[13px] font-medium text-strong">Audio service (C++)</span>
                    </div>
                    <p className="text-[11px] text-muted leading-tight mt-1 ml-5">
                      Captura de áudio via processo nativo (mais estável). Requer compilar <code className="text-ink bg-surface1 px-1 rounded">audio-service/</code> antes.
                    </p>
                  </div>
                  <Toggle
                    on={settings.useAudioService}
                    onChange={(v) => onChange({ useAudioService: v })}
                  />
                </label>
              )}

              <div className="px-3 py-2 rounded-lg bg-canvas border border-line">
                {gpuInfo.supported === null ? (
                  <p className="text-[11px] text-muted">Detectando GPU…</p>
                ) : (
                  <p className="text-[12px] text-strong font-medium break-words">
                    {gpuInfo.info?.device || 'GPU detectada'}
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* Behavior */}
          <Section icon={Sliders} title="Comportamento">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[13px] text-strong">Iniciar minimizado</span>
              <Toggle
                on={settings.startMinimized}
                onChange={(v) => onChange({ startMinimized: v })}
              />
            </label>
          </Section>
        </div>
      </div>
    </ModalShell>
  )
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Icon size={13} strokeWidth={1.75} className="text-muted" />
        <p className="text-[11px] font-medium text-muted uppercase tracking-[0.06em]">{title}</p>
      </div>
      {children}
    </div>
  )
}

function Label({ children }) {
  return (
    <p className="text-[11px] text-muted mb-1.5">{children}</p>
  )
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-9 h-5 rounded-full transition-colors relative ${
        on ? 'bg-accent' : 'bg-surface2'
      }`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          on ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
