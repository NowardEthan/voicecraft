import { useEffect, useMemo, useState } from 'react'
import {
  X, RotateCcw, Mic, MonitorUp, AppWindow, UserRound,
} from 'lucide-react'
import { enumerateMics, enumerateSpeakers, watchDeviceChanges } from '../../../utils/devices'
import { ModalShell } from '../../../shared/motion/ModalShell.jsx'
import { BrandAppIcon } from '../../../shared/ui/BrandMark'
import { SETTINGS_DEFAULTS } from '../hooks/useSettings'
import AudioTab from './settingsTabs/AudioTab'
import VideoTab from './settingsTabs/VideoTab'
import AppTab from './settingsTabs/AppTab'
import AccountTab from './settingsTabs/AccountTab'

function cloneSettings(settings) {
  return { ...SETTINGS_DEFAULTS, ...settings }
}

function diffSettings(from, to) {
  const patch = {}
  const keys = new Set([...Object.keys(from || {}), ...Object.keys(to || {})])
  keys.forEach((key) => {
    if (from?.[key] !== to?.[key]) patch[key] = to[key]
  })
  return patch
}

/**
 * Call settings modal — draft until Aplicar; matches the VoiceCraft mockup.
 */
export default function SettingsModal({
  settings,
  onChange,
  onClose,
  account,
  onSignOut,
  accountProfile = null,
  isPrincipal = false,
  canClaimPrincipal = false,
  onClaimPrincipal = null,
}) {
  const [draft, setDraft] = useState(() => cloneSettings(settings))
  const [tab, setTab] = useState('audio')
  const [mics, setMics] = useState([])
  const [speakers, setSpeakers] = useState([])

  useEffect(() => {
    setDraft(cloneSettings(settings))
  }, [settings])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const [micList, speakerList] = await Promise.all([
        enumerateMics(),
        enumerateSpeakers(),
      ])
      if (!cancelled) {
        setMics(micList)
        setSpeakers(speakerList)
      }
    }
    refresh()
    return watchDeviceChanges(refresh)
  }, [])

  const tabs = useMemo(() => {
    const list = [
      { id: 'audio', label: 'Áudio', Icon: Mic },
      { id: 'video', label: 'Vídeo e tela', Icon: MonitorUp },
      { id: 'app', label: 'Aplicativo', Icon: AppWindow },
    ]
    if (account) list.push({ id: 'account', label: 'Conta', Icon: UserRound })
    return list
  }, [account])

  useEffect(() => {
    if (!account && tab === 'account') setTab('audio')
  }, [account, tab])

  const handleApply = () => {
    const patch = diffSettings(cloneSettings(settings), draft)
    if (Object.keys(patch).length) onChange?.(patch)
    onClose?.()
  }

  const handleReset = () => {
    setDraft(cloneSettings(SETTINGS_DEFAULTS))
  }

  const handleCancel = () => onClose?.()

  return (
    <ModalShell
      open
      onClose={handleCancel}
      labelledBy="settings-title"
      describedBy="settings-desc"
      maxWidth="4xl"
      panelClassName="rounded-[22px] overflow-hidden"
      contentClassName=""
    >
      <div
        className="rounded-[22px] overflow-hidden flex flex-col max-h-[min(90vh,860px)]"
        style={{
          background: 'linear-gradient(180deg, rgba(22,24,30,0.99) 0%, rgba(14,16,22,0.99) 100%)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 28px 80px -24px rgba(0,0,0,0.75)',
        }}
      >
        <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <BrandAppIcon size={40} decorative className="mt-0.5 shadow-[0_0_20px_rgba(255,63,108,0.28)]" />
            <div className="min-w-0">
              <h2 id="settings-title" className="text-[17px] sm:text-[18px] font-semibold text-strong tracking-tight">
                Configurações da chamada
              </h2>
              <p id="settings-desc" className="text-[12px] text-muted mt-0.5">
                Ajuste antes de entrar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Fechar configurações"
            title="Fechar"
            className="w-8 h-8 rounded-full hover:bg-white/[0.06] flex items-center justify-center transition-all shrink-0"
          >
            <X size={15} strokeWidth={1.75} className="text-ink" />
          </button>
        </div>

        <div className="px-5 sm:px-6 shrink-0" role="tablist" aria-label="Seções de configuração">
          <div className="flex gap-1 border-b border-white/[0.07] overflow-x-auto">
            {tabs.map(({ id, label, Icon }) => {
              const on = tab === id
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(id)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                    on ? 'text-accent' : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon size={14} strokeWidth={1.8} className={on ? 'text-accent' : 'text-muted'} />
                  {label}
                  {on && (
                    <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-accent" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5">
          {tab === 'audio' && (
            <AudioTab draft={draft} setDraft={setDraft} mics={mics} speakers={speakers} />
          )}
          {tab === 'video' && <VideoTab draft={draft} setDraft={setDraft} />}
          {tab === 'app' && <AppTab draft={draft} setDraft={setDraft} />}
          {tab === 'account' && (
            <AccountTab
              account={account}
              onSignOut={onSignOut}
              profile={accountProfile}
              isPrincipal={isPrincipal}
              canClaimPrincipal={canClaimPrincipal}
              onClaimPrincipal={onClaimPrincipal}
            />
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-white/[0.07] flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleReset}
            className="h-10 px-3.5 rounded-xl text-[12.5px] font-semibold text-muted hover:text-ink hover:bg-white/[0.04] inline-flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw size={14} strokeWidth={1.75} />
            Redefinir
          </button>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleCancel}
              className="h-10 px-4 rounded-xl text-[12.5px] font-semibold text-ink bg-white/[0.04] border border-white/[0.1] hover:bg-white/[0.08] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="h-10 px-5 rounded-xl text-[12.5px] font-semibold text-on-accent bg-accent hover:opacity-90 shadow-[0_8px_24px_-10px_rgba(255,63,108,0.7)] transition-opacity"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
