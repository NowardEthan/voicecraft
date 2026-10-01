/**
 * Focus-trapped full-screen image gallery.
 */
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { ModalShell } from '../../shared/motion/ModalShell'

export default function ImageLightbox({
  src = null,
  images = null,
  index = 0,
  onClose,
  onIndexChange = null,
}) {
  const list = Array.isArray(images) && images.length ? images.filter(Boolean) : (src ? [src] : [])
  const [localIndex, setLocalIndex] = useState(index)

  useEffect(() => {
    setLocalIndex(Math.min(Math.max(0, index), Math.max(0, list.length - 1)))
  }, [index, list.length])

  const safeIndex = Math.min(Math.max(0, localIndex), Math.max(0, list.length - 1))
  const current = list[safeIndex] || null

  const go = (next) => {
    if (!list.length) return
    const target = (next + list.length) % list.length
    setLocalIndex(target)
    onIndexChange?.(target)
  }

  useEffect(() => {
    if (!current) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft' && list.length > 1) {
        event.preventDefault()
        go(safeIndex - 1)
      } else if (event.key === 'ArrowRight' && list.length > 1) {
        event.preventDefault()
        go(safeIndex + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [current, list.length, safeIndex])

  return (
    <ModalShell
      open={!!current}
      onClose={onClose}
      labelledBy="vc-image-lightbox-title"
      maxWidth="4xl"
      panelClassName="vc-image-lightbox"
      contentClassName="vc-image-lightbox__content"
    >
      <div className="vc-image-lightbox__header">
        <h2 id="vc-image-lightbox-title">
          {list.length > 1 ? `Imagem ${safeIndex + 1} de ${list.length}` : 'Imagem ampliada'}
        </h2>
        <button type="button" onClick={onClose} aria-label="Fechar imagem"><X size={18} /></button>
      </div>

      <div className="vc-image-lightbox__stage">
        {list.length > 1 && (
          <button type="button" className="vc-image-lightbox__previous" onClick={() => go(safeIndex - 1)} aria-label="Imagem anterior">
            <ChevronLeft size={22} />
          </button>
        )}
        {current ? <img key={current} src={current} alt="" decoding="async" /> : null}
        {list.length > 1 && (
          <button type="button" className="vc-image-lightbox__next" onClick={() => go(safeIndex + 1)} aria-label="Proxima imagem">
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {list.length > 1 && (
        <div className="vc-image-lightbox__thumbs" aria-label="Imagens da mensagem">
          {list.map((url, itemIndex) => (
            <button
              key={`${url}-${itemIndex}`}
              type="button"
              className={itemIndex === safeIndex ? 'is-active' : ''}
              onClick={() => go(itemIndex)}
              aria-label={`Imagem ${itemIndex + 1}`}
              aria-current={itemIndex === safeIndex ? 'true' : undefined}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}
    </ModalShell>
  )
}
