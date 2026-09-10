import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, RefreshCw, Sparkles, X } from 'lucide-react'

/**
 * Compact floating update notice (Electron packaged builds).
 * Shows while downloading and stays until install / dismiss when ready.
 */
export default function UpdateToast() {
  const [state, setState] = useState(null) // null | { status, version, percent, message }
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI?.updater : null
    if (!api?.onStatus) return undefined

    const off = api.onStatus((payload) => {
      if (!payload?.status) return
      if (payload.status === 'checking' || payload.status === 'not-available') return
      if (payload.status === 'error') {
        // Keep quiet for background check failures; Settings still shows detail.
        return
      }
      setDismissed(false)
      setState((prev) => ({
        status: payload.status,
        version: payload.version ?? prev?.version ?? null,
        percent: typeof payload.percent === 'number' ? payload.percent : (prev?.percent ?? 0),
        message: payload.message || null,
      }))
    })
    return () => { off?.() }
  }, [])

  const visible = !!state && !dismissed && (
    state.status === 'available'
    || state.status === 'downloading'
    || state.status === 'downloaded'
  )

  const onInstall = useCallback(async () => {
    try {
      await window.electronAPI?.updater?.install?.()
    } catch {
      /* Settings path still works */
    }
  }, [])

  const percent = Math.max(0, Math.min(100, Math.round(state?.percent || 0)))
  const ready = state?.status === 'downloaded'
  const downloading = state?.status === 'available' || state?.status === 'downloading'

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="update-toast"
          initial={{ opacity: 0, y: 18, scale: 0.96, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 10, scale: 0.98, filter: 'blur(2px)' }}
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-5 right-5 z-[60] w-[min(340px,calc(100vw-2.5rem))]"
          role="status"
          aria-live="polite"
        >
          <div
            className="relative overflow-hidden rounded-2xl border border-white/[0.1] shadow-2xl"
            style={{
              background: 'linear-gradient(145deg, rgba(28,30,38,0.94) 0%, rgba(18,20,26,0.97) 100%)',
              backdropFilter: 'blur(28px) saturate(1.2)',
              boxShadow:
                '0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
          >
            {/* Accent wash */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-40"
              style={{
                background: 'radial-gradient(circle, var(--space-accent-soft) 0%, transparent 70%)',
              }}
            />
            <div
              aria-hidden
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{ background: 'var(--space-accent)' }}
            />

            <div className="relative pl-4 pr-3 pt-3.5 pb-3.5">
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: 'var(--space-accent-soft)',
                    boxShadow: ready ? '0 0 20px var(--space-accent-glow-24)' : 'none',
                  }}
                >
                  {ready ? (
                    <Sparkles size={16} strokeWidth={1.75} style={{ color: 'var(--space-accent)' }} />
                  ) : (
                    <RefreshCw
                      size={15}
                      strokeWidth={1.75}
                      className={downloading ? 'animate-spin' : ''}
                      style={{ color: 'var(--space-accent)', animationDuration: '1.6s' }}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-strong tracking-tight leading-snug">
                        {ready ? 'Atualização pronta' : 'Nova atualização'}
                      </p>
                      <p className="text-[11.5px] text-muted mt-0.5 leading-snug">
                        {ready
                          ? (state.version
                            ? `Versão ${state.version} baixada — reinicie para instalar`
                            : 'Reinicie para instalar a nova versão')
                          : (state.version
                            ? `Baixando versão ${state.version}…`
                            : 'Baixando a nova versão…')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDismissed(true)}
                      aria-label="Dispensar"
                      className="w-7 h-7 -mr-1 -mt-0.5 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-white/[0.06] transition-colors shrink-0"
                    >
                      <X size={13} strokeWidth={1.75} />
                    </button>
                  </div>

                  {downloading && (
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase tracking-[0.08em] text-muted font-medium">
                          Download
                        </span>
                        <span className="text-[11px] tabular-nums text-ink/80">{percent}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: 'var(--space-accent)' }}
                          initial={false}
                          animate={{ width: `${Math.max(percent, percent > 0 ? 4 : 0)}%` }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  )}

                  {ready && (
                    <button
                      type="button"
                      onClick={onInstall}
                      className="mt-3 h-8 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 transition-opacity hover:opacity-90"
                      style={{
                        background: 'var(--space-accent)',
                        color: 'var(--space-on-accent)',
                      }}
                    >
                      <Download size={13} strokeWidth={2} />
                      Reiniciar e instalar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
