/**
 * ImageLightbox — full-screen image preview overlay.
 *
 * Shell component: fixed inset, blurred backdrop, close on backdrop
 * click or Escape. The image inside stops propagation so clicks
 * don't accidentally close the dialog.
 */
import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in cursor-zoom-out"
      role="dialog"
      aria-modal="true"
      aria-label="Imagem ampliada"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-black/50 border border-white/15 text-strong hover:bg-black/70 flex items-center justify-center"
        aria-label="Fechar"
        title="Fechar"
      >
        <X size={16} />
      </button>
      <img
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl cursor-default"
      />
    </div>
  )
}
