/**
 * RoomGroupModal — rich editor for sidebar room groups.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, X } from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import { ColorIdentityPicker, normalizeHex, PALETTE } from '../../spaces/components/ColorIdentityPicker'
import { SpaceIconPicker } from '../../spaces/components/SpaceIconPicker'
import { FontFieldSelect } from '../../spaces/components/FontFieldSelect'
import {
  SpaceIcon,
  normalizeSpaceIcon,
  serializeSpaceIcon,
  getRecentIcons,
  pushRecentIcon,
} from '../../spaces/model/spaceIcons'
import { ROOM_NAME_STYLES, resolveLabeledNameStyle } from '../model/roomCosmetics'
import { GROUP_COLOR_PRESETS } from '../model/roomGroups'

const EMPTY_DRAFT = {
  name: '',
  color: GROUP_COLOR_PRESETS[0],
  icon: null,
  emoji: '',
  nameStyle: 'default',
  fontId: 'default',
}

export function RoomGroupModal({
  open,
  mode = 'create', // 'create' | 'edit'
  initial = null,
  spaceFonts = [],
  busy = false,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [colorOpen, setColorOpen] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const [recents, setRecents] = useState(() => getRecentIcons())
  const iconBtnRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setDraft({
        name: initial.name || '',
        color: normalizeHex(initial.color, GROUP_COLOR_PRESETS[0]),
        icon: initial.icon ? normalizeSpaceIcon(initial.icon) : null,
        emoji: initial.emoji || '',
        nameStyle: initial.nameStyle || 'default',
        fontId: initial.fontId || 'default',
      })
    } else {
      setDraft({ ...EMPTY_DRAFT })
    }
    setColorOpen(false)
    setIconOpen(false)
    setRecents(getRecentIcons())
  }, [open, initial])

  if (!open) return null

  const nameCss = resolveLabeledNameStyle({
    nameStyle: draft.nameStyle,
    fontId: draft.fontId,
    fonts: spaceFonts,
  })
  const title = mode === 'edit' ? 'Editar grupo' : 'Novo grupo'

  const submit = (e) => {
    e?.preventDefault?.()
    if (!draft.name.trim() || busy) return
    onSave?.({
      name: draft.name.trim(),
      color: normalizeHex(draft.color, GROUP_COLOR_PRESETS[0]),
      icon: draft.icon ? serializeSpaceIcon(draft.icon) : null,
      emoji: draft.emoji || null,
      nameStyle: draft.nameStyle || 'default',
      fontId: draft.fontId || 'default',
    })
  }

  return createPortal(
    <>
      <ModalShell
        open
        onClose={busy ? undefined : onClose}
        labelledBy="room-group-title"
        maxWidth="lg"
        closeOnEscape={!iconOpen && !colorOpen && !busy}
        closeOnBackdrop={!iconOpen && !colorOpen && !busy}
        panelClassName="rounded-[20px] overflow-hidden"
      >
        <form
          onSubmit={submit}
          className="bg-[#14161b] border border-white/[0.08] rounded-[20px] overflow-hidden max-h-[min(720px,calc(100vh-40px))] flex flex-col"
        >
          <header className="shrink-0 flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/[0.06]">
            <div>
              <h2 id="room-group-title" className="text-[16px] font-semibold text-strong">
                {title}
              </h2>
              <p className="text-[12px] text-muted mt-0.5">
                Cor, fonte, ícone e emoji — só neste Space.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Fechar"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
            >
              <X size={16} />
            </button>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
            {/* Preview */}
            <div
              className="rounded-xl border border-white/[0.08] px-3.5 py-3 flex items-center gap-2.5"
              style={{ background: `${draft.color}18` }}
            >
              {draft.emoji ? (
                <span className="text-[18px] leading-none">{draft.emoji}</span>
              ) : draft.icon ? (
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: `${draft.color}33`, color: draft.color }}
                >
                  <SpaceIcon value={draft.icon} size={16} />
                </span>
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: draft.color }}
                />
              )}
              <span
                className="text-[13px] font-bold uppercase tracking-[0.12em] truncate"
                style={{ ...nameCss, color: draft.color }}
              >
                {draft.name.trim() || 'Nome do grupo'}
              </span>
            </div>

            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted block mb-1.5">
                Nome
              </span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                maxLength={40}
                placeholder="Ex.: Bem-vindo"
                className="w-full h-10 px-3 rounded-xl bg-[#0d0e12] border border-white/[0.08] text-[13.5px] text-strong outline-none focus:border-accent/50"
                style={nameCss}
                autoFocus
              />
            </label>

            <div>
              <ColorIdentityPicker
                value={draft.color}
                onChange={(c) => setDraft((d) => ({ ...d, color: c }))}
                open={colorOpen}
                onOpenChange={(next) => {
                  if (next) setIconOpen(false)
                  setColorOpen(next)
                }}
                heading="Cor do grupo"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[...GROUP_COLOR_PRESETS, ...PALETTE.map((p) => p.css)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 14).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, color: c }))}
                    aria-label={`Cor ${c}`}
                    className={[
                      'w-6 h-6 rounded-full border-2 transition-transform',
                      draft.color?.toLowerCase() === c.toLowerCase() ? 'scale-110 border-white' : 'border-transparent opacity-85',
                    ].join(' ')}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <FontFieldSelect
                label="Fonte do título"
                value={draft.fontId}
                onChange={(fontId) => setDraft((d) => ({ ...d, fontId }))}
                customFonts={spaceFonts}
                previewText={draft.name.trim() || 'Nome do grupo'}
              />
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mt-3 mb-2">
                Efeito
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_NAME_STYLES.map((s) => {
                  const on = draft.nameStyle === s.id
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, nameStyle: s.id }))}
                      className={[
                        'h-8 px-2.5 rounded-lg text-[12px] border transition-colors',
                        on ? 'border-accent/50 bg-accent/15 text-strong' : 'border-white/10 text-muted hover:text-strong',
                      ].join(' ')}
                      style={resolveLabeledNameStyle({
                        nameStyle: s.id,
                        fontId: draft.fontId,
                        fonts: spaceFonts,
                      })}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-2">
                  Ícone
                </p>
                <button
                  ref={iconBtnRef}
                  type="button"
                  onClick={() => {
                    setColorOpen(false)
                    setIconOpen(true)
                  }}
                  className="w-full h-11 px-3 rounded-xl border border-white/[0.08] bg-[#0d0e12] inline-flex items-center gap-2.5 text-[12.5px] text-strong hover:bg-white/[0.04]"
                >
                  {draft.icon ? (
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${draft.color}28`, color: draft.color }}
                    >
                      <SpaceIcon value={draft.icon} size={16} />
                    </span>
                  ) : (
                    <ImagePlus size={15} className="text-muted" />
                  )}
                  <span className="flex-1 text-left">{draft.icon ? 'Trocar ícone' : 'Escolher ícone'}</span>
                </button>
                {draft.icon && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, icon: null }))}
                    className="mt-1.5 text-[11px] text-muted hover:text-strong"
                  >
                    Remover ícone
                  </button>
                )}
              </div>

              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-2">
                  Emoji
                </p>
                <div className="flex items-center gap-2">
                  <span className="w-11 h-11 rounded-xl border border-white/[0.08] bg-[#0d0e12] flex items-center justify-center text-[22px]">
                    {draft.emoji || '—'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setColorOpen(false)
                      setIconOpen(true)
                    }}
                    className="flex-1 h-11 px-3 rounded-xl border border-white/[0.08] bg-[#0d0e12] text-[12.5px] text-strong hover:bg-white/[0.04]"
                  >
                    Abrir picker (aba Emojis)
                  </button>
                </div>
                {draft.emoji && (
                  <button
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, emoji: '' }))}
                    className="mt-1.5 text-[11px] text-muted hover:text-strong"
                  >
                    Remover emoji
                  </button>
                )}
              </div>
            </div>
          </div>

          <footer className="shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-9 px-3.5 rounded-xl text-[12.5px] font-medium text-ink bg-white/[0.04] border border-white/[0.08]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || !draft.name.trim()}
              className="h-9 px-4 rounded-xl text-[12.5px] font-semibold bg-accent text-strong disabled:opacity-40"
            >
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </footer>
        </form>
      </ModalShell>

      <SpaceIconPicker
        open={iconOpen}
        current={draft.icon}
        currentEmoji={draft.emoji || null}
        recents={recents}
        enableEmojis
        anchorRef={iconBtnRef}
        onClose={() => setIconOpen(false)}
        onPick={(next) => {
          setDraft((d) => ({ ...d, icon: normalizeSpaceIcon(next), emoji: d.emoji }))
          setRecents(pushRecentIcon(next))
          setIconOpen(false)
        }}
        onPickEmoji={(emoji) => {
          setDraft((d) => ({ ...d, emoji }))
          setIconOpen(false)
        }}
      />
    </>,
    document.body,
  )
}
