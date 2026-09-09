/**
 * InviteModal — shareable link + copy button.
 *
 * The link encodes the current Space id and (when provided) the target
 * room id so a peer can deep-link straight into the right context.
 *
 * Visual: spec modal — 20 px radius, --vc-surface-1 background, dark
 * scrim, accent button to copy. Closes on Escape, backdrop, or X.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Copy, Check, Link as LinkIcon } from 'lucide-react'
import { ModalShell } from '../../shared/motion/ModalShell.jsx'

export default function InviteModal({
  open,
  space,
  room = null,
  onClose,
}) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef(null)
  const copyTimeoutRef = useRef(null)

  // Build the shareable URL. We use window.location.origin so dev/prod and
  // electron hosts all "just work"; the path encodes space + (optional) room.
  const url = useMemo(() => {
    if (!space) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const params = new URLSearchParams({ space: space.id })
    if (room?.id) params.set('room', room.id)
    return `${origin}/?${params.toString()}`
  }, [space, room])

  useEffect(() => {
    if (!open) return
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [open])

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: select the input so the user can copy manually.
      inputRef.current?.select()
    }
  }

  // Short-circuit before evaluating the JSX below — `space.name` would
  // throw if we tried to render with no space yet. ModalShell already
  // guards on `open`, but the children JSX still gets evaluated as part
  // of building the React element tree.
  if (!open || !space) return null

  return (
    <ModalShell
      open={open && !!space}
      onClose={onClose}
      labelledBy="invite-title"
      maxWidth="md"
      panelClassName="rounded-modal"
    >
      <div className="rounded-modal overflow-hidden bg-surface1 border border-line shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-3 border-b border-line">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LinkIcon size={15} className="text-accent" strokeWidth={1.75} />
              <h2 id="invite-title" className="text-[17px] font-semibold text-strong tracking-tight">
                Convidar pro Space
              </h2>
            </div>
            <p className="text-[12px] text-muted">
              {room
                ? `Link direto pra sala "${room.name}" em "${space.name}".`
                : `Link pra entrar no Space "${space.name}".`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="w-8 h-8 rounded-lg bg-surface2 hover:bg-line flex items-center justify-center text-ink/65 hover:text-strong transition-colors"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1.5">
              Link de convite
            </label>
            <div className="flex items-stretch gap-2">
              <input
                ref={inputRef}
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="
                  flex-1 px-3 py-2 rounded-input
                  bg-surface2 border border-line text-[12px] font-mono text-ink
                  focus:outline-none focus:border-accent/50
                  transition-colors
                "
              />
              <button
                type="button"
                onClick={handleCopy}
                aria-label="Copiar link"
                className={
                  'px-3.5 py-2 rounded-input font-semibold text-[12.5px] inline-flex items-center gap-1.5 ' +
                  'transition-[transform,opacity,background-color,border-color] duration-200 ' +
                  'hover:scale-[1.02] active:scale-[0.96] ' +
                  (copied
                    ? 'bg-positive/15 text-positive border border-positive/30'
                    : 'bg-accent text-strong hover:opacity-90')
                }
              >
                {copied ? (
                  <>
                    <Check size={13} strokeWidth={2.5} />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={13} strokeWidth={2} />
                    Copiar
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 text-[10.5px] text-muted leading-tight">
              Quem abrir o link vai entrar direto no Space {room ? `e abrir "${room.name}"` : ''} assim que aceitar.
            </p>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}
