/**
 * GifPicker — Discord-style GIF / sticker search panel (Giphy).
 * Falls back to local .gif file pick when API key is missing.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, FolderOpen, Loader2 } from 'lucide-react'
import {
  fetchFeaturedGifs,
  fetchFeaturedStickers,
  hasGiphyKey,
  searchGifs,
  searchStickers,
} from './giphy'

const SUGGESTIONS = ['oi', 'obrigado', 'lol', 'clap', 'dance', 'cat', 'dog', 'fire', 'yes', 'no']
const TABS = [
  { id: 'gif', label: 'GIFs' },
  { id: 'sticker', label: 'Stickers' },
]

export default function GifPicker({
  onPick,
  onPickFile,
  accent = null,
  className = '',
}) {
  const [tab, setTab] = useState('gif')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const reqId = useRef(0)
  const keyed = hasGiphyKey()
  const isSticker = tab === 'sticker'

  const load = useCallback(async (q, variant) => {
    if (!keyed) return
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    setItems([])
    try {
      let list
      if (variant === 'sticker') {
        list = q.trim() ? await searchStickers(q) : await fetchFeaturedStickers()
      } else {
        list = q.trim() ? await searchGifs(q) : await fetchFeaturedGifs()
      }
      if (id !== reqId.current) return
      setItems(list)
    } catch (err) {
      if (id !== reqId.current) return
      setError(err?.message || 'Falha ao carregar')
      setItems([])
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }, [keyed])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!keyed) return undefined
    const t = setTimeout(() => load(query, tab), tab === 'gif' && !query ? 0 : 280)
    return () => clearTimeout(t)
  }, [query, tab, load, keyed])

  return (
    <div
      className={`vc-gif-picker flex flex-col rounded-2xl overflow-hidden border border-line bg-surface1 shadow-2xl ${className}`}
      style={{
        width: 360,
        height: 440,
        '--gif-accent': accent || 'var(--space-accent, #22c55e)',
      }}
      data-vc-gif-picker="1"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 px-3 pt-3 pb-1">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                'h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors ' +
                (active
                  ? 'text-strong bg-surface2'
                  : 'text-muted hover:text-strong hover:bg-surface2/60')
              }
              aria-pressed={active}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 px-3 pt-2 pb-2">
        <div className="flex-1 flex items-center gap-2 h-9 px-2.5 rounded-xl bg-surface2 border border-line">
          <Search size={14} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!keyed}
            placeholder={
              keyed
                ? (isSticker ? 'Buscar stickers…' : 'Buscar GIFs…')
                : 'Configure VITE_GIPHY_API_KEY'
            }
            className="flex-1 min-w-0 bg-transparent text-[13px] text-strong placeholder:text-muted focus:outline-none disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-9 w-9 rounded-xl flex items-center justify-center text-muted hover:text-strong hover:bg-surface2 border border-line shrink-0"
          title="Enviar arquivo .gif"
          aria-label="Enviar arquivo GIF"
        >
          <FolderOpen size={15} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/gif,.gif,image/webp,.webp,image/png,.png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onPickFile?.(file)
          }}
        />
      </div>

      {keyed && (
        <div className="flex gap-1.5 px-3 pb-2 overflow-x-auto no-scrollbar">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setQuery(s)}
              className="shrink-0 h-7 px-2.5 rounded-full text-[11px] font-medium text-muted hover:text-strong border border-line hover:border-[color:var(--gif-accent)]/40"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        {!keyed && (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
            <p className="text-[13px] text-strong font-medium">GIFs e stickers</p>
            <p className="text-[12px] text-muted leading-relaxed">
              Defina <code className="text-[11px] px-1 rounded bg-surface2">VITE_GIPHY_API_KEY</code> no
              .env para buscar. Enquanto isso, envie um arquivo .gif.
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="h-9 px-4 rounded-full text-[12px] font-semibold text-black"
              style={{ background: 'var(--gif-accent)' }}
            >
              Escolher arquivo
            </button>
          </div>
        )}

        {keyed && loading && !items.length && (
          <div className="h-full flex items-center justify-center text-muted">
            <Loader2 size={18} className="animate-spin" />
          </div>
        )}

        {keyed && error && (
          <p className="text-[12px] text-danger px-1 py-2">{error}</p>
        )}

        {keyed && (
          <div className="grid grid-cols-2 gap-1.5">
            {items.map((g) => (
              <button
                key={`${g.variant}-${g.id}`}
                type="button"
                onClick={() => onPick?.(g)}
                className={
                  'relative aspect-square rounded-xl overflow-hidden hover:ring-2 hover:ring-[color:var(--gif-accent)] ' +
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gif-accent)] ' +
                  (g.variant === 'sticker' ? 'bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_70%),#0b0d12]' : 'bg-black/30')
                }
                title={g.title}
              >
                <img
                  src={g.preview || g.url}
                  alt={g.title}
                  loading="lazy"
                  className={
                    g.variant === 'sticker'
                      ? 'absolute inset-0 w-full h-full object-contain p-2'
                      : 'absolute inset-0 w-full h-full object-cover'
                  }
                />
              </button>
            ))}
          </div>
        )}

        {keyed && !loading && !error && items.length === 0 && (
          <p className="text-[12px] text-muted text-center py-8">
            {isSticker ? 'Nenhum sticker encontrado' : 'Nenhum GIF encontrado'}
          </p>
        )}
      </div>

      {keyed && (
        <div className="px-3 py-2 border-t border-line flex items-center justify-end">
          <a
            href="https://giphy.com/"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-semibold tracking-wide text-muted hover:text-strong uppercase"
          >
            Powered by GIPHY
          </a>
        </div>
      )}
    </div>
  )
}
