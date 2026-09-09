import { useEffect, useRef } from 'react'
import { Maximize2, Minimize2, Monitor, Square, Video } from 'lucide-react'

export function ScreenShareStage({
  stream,
  isSelf = false,
  expanded = false,
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

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.srcObject = stream || null
    return () => { el.srcObject = null }
  }, [stream])

  return (
    <div
      onDoubleClick={onToggleExpand}
      title={expanded ? 'Clique duas vezes para voltar' : 'Clique duas vezes para ampliar na sala'}
      className={[
        'relative overflow-hidden border border-white/[0.10] bg-black h-full min-h-[200px]',
        'shadow-[0_18px_44px_-16px_rgba(0,0,0,0.6)]',
        expanded ? 'rounded-[18px] cursor-zoom-out' : 'rounded-[16px] cursor-zoom-in',
      ].join(' ')}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain bg-black pointer-events-none"
        style={{ transform: mirrored ? 'scaleX(-1) translateZ(0)' : 'translateZ(0)' }}
        autoPlay
        playsInline
        muted={isSelf || isCamera}
      />
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-black/70 border border-white/10 text-white text-[11px] font-medium">
        <Icon size={12} />
        {label}
      </div>
      {onToggleExpand && (
        <button
          type="button"
          onClick={onToggleExpand}
          onDoubleClick={(e) => e.stopPropagation()}
          aria-label={expanded ? 'Recolher' : 'Ampliar na sala'}
          title={expanded ? 'Recolher' : 'Ampliar na sala'}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/55 border border-white/10 text-white inline-flex items-center justify-center hover:bg-black/70"
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
      {isSelf && !isCamera && onStop && (
        <button
          type="button"
          onClick={onStop}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-danger/90 text-white text-[12px] font-semibold hover:bg-danger"
        >
          <Square size={11} fill="currentColor" />
          Parar
        </button>
      )}
    </div>
  )
}
