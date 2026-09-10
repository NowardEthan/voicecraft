/**
 * RoomEditorModal — create/edit sala: type, name, and cosmetics (C).
 */
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2, X } from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import { RoomTypeSelector } from '../../../components/space-creator/RoomTypeSelector'
import { RoomNameField } from '../../../components/space-creator/RoomNameField'
import { RoomTypeContext } from '../../../components/space-creator/RoomTypeContext'
import {
  DEFAULT_ROOM_NAMES,
  PURPOSE_BY_KEY,
  CREATE_PURPOSES,
  purposeOf,
  normalizePurposeKey,
} from '../model/roomPurposes'
import {
  ROOM_EMOJI_PRESETS,
  ROOM_NAME_STYLES,
  normalizeRoomEmoji,
  resolveRoomNameStyle,
} from '../model/roomCosmetics'
import { RoomIconMark } from './RoomIconMark'
import { SpaceIconPicker } from '../../spaces/components/SpaceIconPicker'
import { ColorIdentityPicker, PALETTE, normalizeHex } from '../../spaces/components/ColorIdentityPicker'
import { identitySurfaceStyle, serializeSpaceIcon } from '../../spaces'
import { readFileAsDataUrl } from '../model/roomCover'

export default function RoomEditorModal({
  open,
  mode = 'create',
  room = null,
  submitting = false,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const isEdit = mode === 'edit' && room
  const [purposeKey, setPurposeKey] = useState('conversation')
  const [name, setName] = useState('')
  const [manuallyRenamed, setManuallyRenamed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState(null)

  const [icon, setIcon] = useState(null)
  const [emoji, setEmoji] = useState(null)
  const [color, setColor] = useState(null)
  const [nameStyle, setNameStyle] = useState('default')
  const [cover, setCover] = useState(null)
  const [coverRemoved, setCoverRemoved] = useState(false)

  const [iconOpen, setIconOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const iconBtnRef = useRef(null)
  const coverInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (isEdit) {
      const purpose = purposeOf(room)
      setPurposeKey(normalizePurposeKey(purpose.key))
      setName(room.name || '')
      setManuallyRenamed(true)
      setIcon(room.icon || null)
      setEmoji(room.emoji || null)
      setColor(room.color || null)
      setNameStyle(room.nameStyle || 'default')
      setCover(room.cover || null)
      setCoverRemoved(false)
    } else {
      setPurposeKey('conversation')
      setName(DEFAULT_ROOM_NAMES.conversation)
      setManuallyRenamed(false)
      setIcon(null)
      setEmoji(null)
      setColor(null)
      setNameStyle('default')
      setCover(null)
      setCoverRemoved(false)
    }
    setConfirmDelete(false)
    setError(null)
    setIconOpen(false)
    setColorOpen(false)
  }, [open, isEdit, room])

  const selected = PURPOSE_BY_KEY[purposeKey] || PURPOSE_BY_KEY.conversation
  const originalPurpose = isEdit ? purposeOf(room).key : null
  const typeFlip = isEdit && (originalPurpose === 'voice') !== (purposeKey === 'voice')
  const previewRoom = {
    purpose: purposeKey,
    icon: emoji ? null : icon,
    emoji,
    color,
    nameStyle,
  }
  const accent = color ? normalizeHex(color) : selected.color
  const nameCss = resolveRoomNameStyle(nameStyle).style

  const handleSelectType = (next) => {
    setPurposeKey(next)
    if (!manuallyRenamed) {
      setName(DEFAULT_ROOM_NAMES[next] || '')
    }
  }

  const cosmeticsPayload = () => {
    const payload = {
      icon: emoji ? null : (icon || null),
      emoji: emoji || null,
      color: color || null,
      nameStyle: nameStyle || 'default',
    }
    if (coverRemoved) {
      payload.cover = null
      payload.coverFit = null
    } else if (typeof cover === 'string' && cover.startsWith('data:image/')) {
      payload.cover = cover
    }
    return payload
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Dê um nome pra sala.')
      return
    }
    setError(null)
    try {
      const cosmetics = cosmeticsPayload()
      if (isEdit) {
        await onUpdate?.(room, { name: trimmed, purpose: purposeKey, ...cosmetics })
      } else {
        await onCreate?.(purposeKey, trimmed, cosmetics)
      }
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Não deu pra salvar a sala.')
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    try {
      await onDelete?.(room)
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Não deu pra excluir a sala.')
    }
  }

  const pickEmoji = (value) => {
    const next = normalizeRoomEmoji(value)
    setEmoji(next)
    if (next) setIcon(null)
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy="room-editor-title"
      maxWidth="lg"
      panelClassName="rounded-[20px] overflow-hidden"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col min-w-0 max-h-[min(88vh,720px)] rounded-[20px] overflow-hidden bg-[#14161b] border border-white/[0.08]"
      >
        <header className="shrink-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 id="room-editor-title" className="text-[17px] font-semibold text-strong tracking-tight">
              {isEdit ? 'Editar sala' : 'Criar sala'}
            </h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              {isEdit
                ? 'Nome, tipo e aparência desta sala.'
                : 'Texto ou voz — e personalize ícone, cor e capa.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        <div className="px-5 pb-4 space-y-4 overflow-y-auto min-h-0">
          <RoomTypeSelector
            types={CREATE_PURPOSES}
            value={purposeKey}
            onChange={handleSelectType}
            compact
          />
          <RoomNameField
            value={name}
            placeholder={DEFAULT_ROOM_NAMES[purposeKey] || 'geral'}
            onChange={(value) => {
              setName(value)
              setManuallyRenamed(true)
            }}
          />

          <section className="rounded-[14px] bg-white/[0.03] border border-white/[0.06] p-3.5 space-y-3.5">
            <div className="flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-[12px] flex items-center justify-center shrink-0"
                style={color ? identitySurfaceStyle(accent) : { background: selected.soft, color: selected.color }}
                aria-hidden
              >
                <RoomIconMark room={previewRoom} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] text-strong truncate"
                  style={{ ...nameCss, color: accent }}
                >
                  {name.trim() || 'prévia da sala'}
                </p>
                <p className="text-[11px] text-muted mt-0.5">Prévia na lista de salas</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1.5">Ícone</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  ref={iconBtnRef}
                  type="button"
                  onClick={() => {
                    setColorOpen(false)
                    setIconOpen((v) => !v)
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-strong border border-white/[0.08] transition-colors"
                >
                  <ImagePlus size={13} />
                  Escolher ícone
                </button>
                {(icon || emoji) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIcon(null)
                      setEmoji(null)
                    }}
                    className="h-8 px-2.5 rounded-lg text-[12px] text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                  >
                    Usar padrão
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROOM_EMOJI_PRESETS.map((em) => {
                  const active = emoji === em
                  return (
                    <button
                      key={em}
                      type="button"
                      onClick={() => pickEmoji(active ? null : em)}
                      className={
                        'w-8 h-8 rounded-lg text-[15px] flex items-center justify-center transition-colors ' +
                        (active
                          ? 'bg-accent/20 ring-1 ring-accent/50'
                          : 'bg-white/[0.04] hover:bg-white/[0.08]')
                      }
                      aria-pressed={active}
                    >
                      {em}
                    </button>
                  )
                })}
              </div>
            </div>

            <ColorIdentityPicker
              value={color || selected.color}
              onChange={(hex) => setColor(normalizeHex(hex))}
              open={colorOpen}
              onOpenChange={(next) => {
                if (next) setIconOpen(false)
                setColorOpen(next)
              }}
              heading="Cor da sala"
            />
            {color && (
              <button
                type="button"
                onClick={() => setColor(null)}
                className="text-[11.5px] text-muted hover:text-strong transition-colors"
              >
                Voltar à cor do tipo
              </button>
            )}
            {!color && (
              <div className="flex flex-wrap gap-1.5 -mt-1">
                {PALETTE.slice(0, 8).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.name}
                    onClick={() => setColor(p.css)}
                    className="w-6 h-6 rounded-full border border-white/10 hover:scale-110 transition-transform"
                    style={{ background: p.css }}
                    aria-label={p.name}
                  />
                ))}
              </div>
            )}

            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1.5">Estilo do nome</p>
              <div className="flex flex-wrap gap-1.5">
                {ROOM_NAME_STYLES.map((style) => {
                  const active = nameStyle === style.id
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => setNameStyle(style.id)}
                      title={style.label}
                      className={
                        'h-9 min-w-[2.5rem] px-2.5 rounded-lg text-[13px] transition-colors ' +
                        (active
                          ? 'bg-accent/20 text-accent ring-1 ring-accent/40'
                          : 'bg-white/[0.04] text-ink hover:bg-white/[0.08] hover:text-strong')
                      }
                      style={style.style}
                      aria-pressed={active}
                    >
                      {style.preview}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1.5">Capa da sala</p>
              <p className="text-[11.5px] text-muted mb-2">Compartilhada com todo o space (não só no seu PC).</p>
              {cover ? (
                <div className="relative rounded-[12px] overflow-hidden aspect-[16/7] bg-black/40">
                  <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 p-2 flex gap-2 bg-gradient-to-t from-black/70 to-transparent">
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      className="h-7 px-2.5 rounded-md text-[11.5px] font-medium bg-white/15 hover:bg-white/25 text-strong"
                    >
                      Trocar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCover(null)
                        setCoverRemoved(true)
                      }}
                      className="h-7 px-2.5 rounded-md text-[11.5px] font-medium text-danger hover:bg-danger/20"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="w-full h-16 rounded-[12px] border border-dashed border-white/15 text-[12.5px] text-muted hover:text-strong hover:border-white/25 hover:bg-white/[0.03] transition-colors"
                >
                  Enviar imagem de capa
                </button>
              )}
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  try {
                    const dataUrl = await readFileAsDataUrl(file)
                    setCover(dataUrl)
                    setCoverRemoved(false)
                  } catch {
                    setError('Não deu pra ler a imagem.')
                  }
                }}
              />
            </div>
          </section>

          {isEdit ? (
            <p className="text-[12px] text-muted leading-snug">
              {selected.contextDescription}
              {typeFlip
                ? purposeKey === 'voice'
                  ? ' Trocar para voz transforma esta sala numa chamada ao vivo.'
                  : ' Trocar para texto tira o áudio ao vivo desta sala.'
                : ''}
            </p>
          ) : (
            <RoomTypeContext type={selected} />
          )}
          {error && (
            <p className="text-[12px] text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-white/[0.06]">
          {isEdit ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className={
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12.5px] font-semibold transition-colors ' +
                (confirmDelete
                  ? 'bg-danger text-white'
                  : 'text-danger hover:bg-danger/15')
              }
            >
              <Trash2 size={13} strokeWidth={2} />
              {confirmDelete ? 'Excluir de vez?' : 'Excluir sala'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-[10px] text-[12.5px] font-medium text-ink hover:text-strong hover:bg-white/[0.06] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="h-9 px-4 rounded-[10px] text-[12.5px] font-semibold bg-accent text-strong hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {submitting ? 'Salvando…' : isEdit ? 'Salvar' : 'Criar sala'}
            </button>
          </div>
        </footer>
      </form>

      <SpaceIconPicker
        open={iconOpen}
        current={icon}
        onPick={(next) => {
          setIcon(serializeSpaceIcon(next))
          setEmoji(null)
          setIconOpen(false)
        }}
        onClose={() => setIconOpen(false)}
        anchorRef={iconBtnRef}
      />
    </ModalShell>
  )
}
