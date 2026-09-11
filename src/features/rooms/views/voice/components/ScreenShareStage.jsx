import { useEffect, useRef } from 'react'
import { Maximize2, Minimize2, Monitor, Square, Video } from 'lucide-react'

export function ScreenShareStage({
  stream,
  isSelf = false,
  expanded = false,
  fill = false,
  compact = false,
  immersive = false,
  chromeVisible = true,
  kind = 'screen',
  title,
  mirrored = false,
  onToggleExpand,
  onStop,
}) {
  const videoRef = useRef(null)
  const isCamera = kind === 'camera'
  const Icon = isCamera ? Video : Monitor
  const label = title
    || (isCamera
      ? (isSelf ? 'Sua câmera' : 'Câmera')
      : (isSelf ? 'Você está compartilhando' : 'Tela compartilhada'))
  const showHud = !compact && (!immersive || chromeVisible)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream || null
    if (stream) {
      const play = () => { el.play?.().catch(() => {}) }
      play()
      el.addEventListener('loadedmetadata', play)
      return () => {
        el.removeEventListener('loadedmetadata', play)
        el.srcObject = null
      }
    }
    return () => { el.srcObject = null }
  }, [stream])

  return (
    <div
      onDoubleClick={onToggleExpand}
      title={
        compact
          ? 'Clique para destacar'
          : immersive
            ? 'Clique duas vezes para sair do modo cinema'
            : 'Clique duas vezes para modo cinema'
      }
      className={[
        'relative overflow-hidden bg-black',
        immersive
          ? 'h-full w-full min-h-0 rounded-none border-0 shadow-none'
          : [
            'border border-white/[0.10]',
            'shadow-[0_18px_44px_-16px_rgba(0,0,0,0.6)]',
            fill || expanded ? 'h-full w-full min-h-0 rounded-[14px]' : 'h-full min-h-[120px] rounded-[16px]',
          ].join(' '),
        compact ? 'rounded-[12px] shadow-none border border-white/[0.10] cursor-pointer' : '',
        onToggleExpand && !compact ? (immersive ? 'cursor-zoom-out' : 'cursor-zoom-in') : '',
      ].filter(Boolean).join(' ')}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none"
        style={{ transform: mirrored ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)' }}
        autoPlay
        playsInline
        muted
      />
      {showHud && (
        <div
          className={[
            'absolute top-3 left-3 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full',
            'bg-black/80 border border-white/20 text-white text-[11px] font-semibold max-w-[70%] truncate',
            'shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]',
            immersive ? 'transition-opacity duration-200' : '',
          ].join(' ')}
        >
          <Icon size={12} className="shrink-0" />
          <span className="truncate">{label}</span>
        </div>
      )}
      {onToggleExpand && showHud && (
        <button
          type="button"
          onClick={onToggleExpand}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={immersive ? 'Sair do modo cinema' : 'Modo cinema'}
          title={immersive ? 'Sair do modo cinema' : 'Modo cinema'}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/75 border border-white/20 text-white inline-flex items-center justify-center hover:bg-black/90 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.8)]"
        >
          {immersive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
      {isSelf && !isCamera && onStop && (compact || showHud) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStop?.()
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={[
            'absolute inline-flex items-center gap-1.5 rounded-full bg-danger text-white font-semibold hover:bg-danger/90',
            'border border-white/15 shadow-[0_10px_24px_-10px_rgba(239,68,68,0.55)]',
            compact ? 'bottom-1.5 right-1.5 h-6 px-2 text-[10px]' : 'bottom-3 right-3 h-8 px-3 text-[12px]',
          ].join(' ')}
        >
          <Square size={compact ? 9 : 11} fill="currentColor" />
          Parar
        </button>
      )}
    </div>
  )
}
