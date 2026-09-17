import { useEffect, useState } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { BrandMark } from '../shared/ui/BrandMark'

const HAS_WINDOW_CONTROLS =
  typeof window !== 'undefined' && !!window.electronAPI?.windowControls

/**
 * Custom frameless title bar — drag region + window controls.
 * Hidden in plain browser (Vite without Electron).
 */
export default function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!HAS_WINDOW_CONTROLS) return undefined
    let cancelled = false
    window.electronAPI.windowControls.isMaximized().then((v) => {
      if (!cancelled) setMaximized(!!v)
    }).catch(() => {})
    const off = window.electronAPI.windowControls.onMaximized((v) => {
      setMaximized(!!v)
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  if (!HAS_WINDOW_CONTROLS) return null

  const api = window.electronAPI.windowControls

  return (
    <header
      className="vc-titlebar relative z-[200] h-9 shrink-0 flex items-stretch select-none border-b border-white/[0.06]"
      style={{
        background: 'linear-gradient(180deg, #14161c 0%, #101218 100%)',
        WebkitAppRegion: 'drag',
      }}
      onDoubleClick={() => api.maximize()}
    >
      <div className="flex items-center gap-2 pl-3 min-w-0 flex-1">
        <BrandMark size={18} decorative className="drop-shadow-[0_0_10px_var(--space-accent-glow-24)]" />
        <span className="text-[12px] font-semibold tracking-tight text-strong/90 truncate">
          Voice
        </span>
      </div>

      <div
        className="flex items-stretch shrink-0"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <TitleBtn label="Minimizar" onClick={() => api.minimize()}>
          <Minus size={14} strokeWidth={1.75} />
        </TitleBtn>
        <TitleBtn
          label={maximized ? 'Restaurar' : 'Maximizar'}
          onClick={() => api.maximize()}
        >
          {maximized ? (
            <span className="relative w-[11px] h-[11px] block">
              <span className="absolute right-0 top-0 w-[8px] h-[8px] border border-current rounded-[1px]" />
              <span className="absolute left-0 bottom-0 w-[8px] h-[8px] border border-current rounded-[1px] bg-[#101218]" />
            </span>
          ) : (
            <Square size={12} strokeWidth={1.75} />
          )}
        </TitleBtn>
        <TitleBtn label="Fechar" danger onClick={() => api.close()}>
          <X size={14} strokeWidth={1.75} />
        </TitleBtn>
      </div>
    </header>
  )
}

function TitleBtn({ children, onClick, label, danger = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={
        'w-[46px] h-full flex items-center justify-center text-muted transition-colors ' +
        (danger
          ? 'hover:bg-[#e81123] hover:text-white'
          : 'hover:bg-white/[0.06] hover:text-strong')
      }
    >
      {children}
    </button>
  )
}
