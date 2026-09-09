/**
 * SpaceSettingsModal — identity + preferences editor for a Space.
 * Layout follows the settings mockup: hero banner, Aparência,
 * Informações, Acesso e preferências, sticky footer with dirty hint.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ImagePlus, Trash2, Eye, EyeOff, Bell, BellOff } from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import { SpaceIconPicker } from './SpaceIconPicker'
import { ColorIdentityPicker, paletteColorFor, PALETTE } from './ColorIdentityPicker'
import { SpaceIcon, normalizeSpaceIcon, serializeSpaceIcon, getRecentIcons, pushRecentIcon } from '../model/spaceIcons'
import { flashToast } from '../../../shared/utils/toast'
import {
  getSpaceCover,
  clearSpaceCover,
  readFileAsDataUrl,
  DEFAULT_COVER_FIT,
  normalizeCoverFit,
} from '../model/spaceCover'
import { SpaceCoverFitControls, SpaceCoverLayer } from './SpaceCoverLayer'
import {
  getVisibility,
  setVisibility,
  getNotify,
  setNotify,
} from '../model/spacePreferences'
import { normalizeVisibility } from '../model/spaceInvite'
import { bannerGradient, bannerOverlay, identitySurfaceStyle, spaceTokens } from '../model/spaceTokens'

function snapshotOf({ icon, name, description, color, cover, coverFit, visibility, notify }) {
  return JSON.stringify({
    icon: serializeSpaceIcon(icon),
    name, description, color, cover: cover || '', coverFit: normalizeCoverFit(coverFit), visibility, notify,
  })
}

export default function SpaceSettingsModal({ open, space, onSave, onClose }) {
  const [icon, setIcon] = useState(() => normalizeSpaceIcon(null))
  const [recents, setRecents] = useState(() => getRecentIcons())
  const iconButtonRef = useRef(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(PALETTE[0].css)
  const [coverDataUrl, setCoverDataUrl] = useState(null)
  const [coverFit, setCoverFit] = useState(DEFAULT_COVER_FIT)
  const [visibility, setVisibilityState] = useState('public')
  const [notify, setNotifyState] = useState('on')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [iconOpen, setIconOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const fileInputRef = useRef(null)
  const baselineRef = useRef('')

  useEffect(() => {
    if (!open || !space) return
    const nextIcon = normalizeSpaceIcon(space.icon)
    const nextName = space.name || ''
    const nextDesc = space.description || ''
    const nextColor = paletteColorFor(space.color).css
    const sharedCover = typeof space.cover === 'string' ? space.cover : null
    const localCover = getSpaceCover(space.id)
    const nextCover = sharedCover || localCover
    const nextFit = normalizeCoverFit(space.coverFit)
    const nextVis = normalizeVisibility(space.visibility ?? getVisibility(space.id))
    const nextNotify = getNotify(space.id)
    setIcon(nextIcon)
    setName(nextName)
    setDescription(nextDesc)
    setColor(nextColor)
    setCoverDataUrl(nextCover)
    setCoverFit(nextFit)
    setVisibilityState(nextVis)
    setNotifyState(nextNotify)
    setError(null)
    setSubmitting(false)
    setIconOpen(false)
    setColorOpen(false)
    baselineRef.current = snapshotOf({
      icon: nextIcon,
      name: nextName,
      description: nextDesc,
      color: nextColor,
      cover: nextCover,
      coverFit: nextFit,
      visibility: nextVis,
      notify: nextNotify,
    })
  }, [open, space])

  const dirty = useMemo(() => {
    if (!open) return false
    return snapshotOf({
      icon, name, description, color, cover: coverDataUrl, coverFit, visibility, notify,
    }) !== baselineRef.current
  }, [open, icon, name, description, color, coverDataUrl, coverFit, visibility, notify])

  if (!open || !space) return null

  const hasCover = typeof coverDataUrl === 'string' && coverDataUrl.startsWith('data:image/')

  const handlePickCover = () => fileInputRef.current?.click()
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setCoverDataUrl(await readFileAsDataUrl(file))
      setCoverFit(DEFAULT_COVER_FIT)
    } catch (err) {
      flashToast(err.message || 'Falha ao carregar imagem')
    }
  }

  const handleSubmit = async (e) => {
    e?.preventDefault?.()
    if (!name.trim()) {
      setError('O nome do Space é obrigatório.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (space.id) {
        clearSpaceCover(space.id)
        setVisibility(space.id, visibility)
        setNotify(space.id, notify)
      }
      const maybePromise = onSave?.({
        name: name.trim(),
        description: description.trim().slice(0, 256),
        color,
        icon: serializeSpaceIcon(icon),
        cover: coverDataUrl || null,
        coverFit: coverDataUrl ? coverFit : null,
        visibility,
      })
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise
      }
      onClose?.()
    } catch (err) {
      setError(err?.message || 'Falha ao salvar as alterações.')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <>
    <ModalShell
      open
      onClose={onClose}
      labelledBy="space-settings-title"
      maxWidth="2xl"
      closeOnEscape={!iconOpen && !colorOpen}
      panelClassName="rounded-[20px] overflow-hidden"
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col min-w-0 max-h-[min(780px,calc(100vh-40px))] rounded-[20px] overflow-hidden"
        style={{
          ...spaceTokens({ color }),
          background: '#14161b',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <header className="shrink-0 flex items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={identitySurfaceStyle(color)}
              aria-hidden
            >
              <SpaceIcon value={icon} size={20} style={{ color: 'inherit' }} />
            </span>
            <div className="min-w-0">
              <h2 id="space-settings-title" className="text-[17px] font-semibold text-strong tracking-tight">
                Configurações do Space
              </h2>
              <p className="text-[12.5px] text-muted mt-0.5">
                Personalize a identidade e as preferências do seu Space
              </p>
            </div>
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

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 space-y-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] min-h-[132px]">
            {hasCover ? (
              <SpaceCoverLayer src={coverDataUrl} fit={coverFit} />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: bannerGradient(color) }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: bannerOverlay(color, hasCover) }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 to-transparent" />
            <div className="relative flex items-center gap-3.5 px-5 py-5">
              <span
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                style={{ backgroundColor: 'rgba(0,0,0,0.38)', boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 50%, transparent)` }}
                aria-hidden
              >
                <SpaceIcon value={icon} size={24} className="text-white" />
              </span>
              <div className="min-w-0">
                <p className="text-[18px] font-semibold text-white tracking-tight truncate">
                  {name.trim() || 'Sem nome'}
                </p>
                <p className="text-[12.5px] text-white/70 mt-0.5 line-clamp-2">
                  {description.trim() || 'Um lugar para jogar, conversar e criar junto.'}
                </p>
              </div>
            </div>
          </div>

          <section>
            <SectionLabel>Aparência</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={identitySurfaceStyle(color)}
                  aria-hidden
                >
                  <SpaceIcon value={icon} size={22} style={{ color: 'inherit' }} />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1.5">Ícone</p>
                  <button
                    ref={iconButtonRef}
                    type="button"
                    onClick={() => {
                      setColorOpen(false)
                      setIconOpen(v => !v)
                    }}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-strong border border-white/[0.08] transition-colors"
                  >
                    <ImagePlus size={13} />
                    Trocar ícone
                  </button>
                  <p className="text-[11px] text-muted mt-1.5">Escolha entre diversos estilos.</p>
                </div>
              </div>
              <ColorIdentityPicker
                value={color}
                onChange={setColor}
                open={colorOpen}
                onOpenChange={(next) => {
                  if (next) setIconOpen(false)
                  setColorOpen(next)
                }}
              />
            </div>
          </section>

          <section>
            <SectionLabel>Imagem de capa</SectionLabel>
            <p className="text-[11.5px] text-muted -mt-1.5 mb-3">
              Tema visual do Space. Arraste para encaixar, scroll para zoom.
            </p>
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0e12] h-[132px]">
              {hasCover ? (
                <SpaceCoverLayer
                  src={coverDataUrl}
                  fit={coverFit}
                  interactive
                  showControls={false}
                  onFitChange={setCoverFit}
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color} 35%, #0d0a0c) 100%)` }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10 pointer-events-none" />
              {hasCover && (
                <SpaceCoverFitControls
                  fit={coverFit}
                  onFitChange={setCoverFit}
                  className="absolute top-2.5 right-2.5 z-20"
                />
              )}
              <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handlePickCover}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-black/45 hover:bg-black/60 text-white border border-white/15 backdrop-blur-sm transition-colors"
                  >
                    <ImagePlus size={13} />
                    Escolher imagem
                  </button>
                  {hasCover && (
                    <button
                      type="button"
                      onClick={() => {
                        setCoverDataUrl(null)
                        setCoverFit(DEFAULT_COVER_FIT)
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium text-white/80 hover:text-danger bg-black/35 hover:bg-danger/20 border border-white/10 backdrop-blur-sm transition-colors"
                    >
                      <Trash2 size={13} />
                      Remover
                    </button>
                  )}
              </div>
            </div>
            <p className="text-[11px] text-muted mt-2">Qualquer tamanho · JPG, PNG, WebP ou GIF.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFile}
              className="hidden"
              aria-hidden
            />
          </section>

          <section>
            <SectionLabel>Informações</SectionLabel>
            <div className="space-y-3">
              <label className="block min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted block mb-1.5">
                  Nome do Space
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  className="w-full h-10 px-3 rounded-xl text-[13.5px] bg-[#0d0e12] border border-white/[0.08] text-strong focus:outline-none focus:border-accent/50 placeholder:text-muted"
                  placeholder="Nome do Space"
                />
                <p className="text-[11px] text-muted mt-1 text-right tabular-nums">{name.length}/64</p>
              </label>
              <label className="block min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted block mb-1.5">
                  Descrição
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={256}
                  rows={3}
                  className="w-full min-h-[72px] px-3 py-2 rounded-xl text-[13px] resize-none bg-[#0d0e12] border border-white/[0.08] text-strong focus:outline-none focus:border-accent/50 placeholder:text-muted"
                  placeholder="Do que se trata este Space?"
                />
                <p className="text-[11px] text-muted mt-1 text-right tabular-nums">{description.length}/256</p>
              </label>
            </div>
          </section>

          <section>
            <SectionLabel>Acesso e preferências</SectionLabel>
            <div className="rounded-2xl border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden bg-white/[0.02]">
              <PrefRow
                icon={visibility === 'public' ? Eye : EyeOff}
                title="Visibilidade do Space"
                hint={visibility === 'public' ? 'Aparece na lista e aceita convites.' : 'Oculto da lista, só entra por link direto.'}
              >
                <Segmented
                  value={visibility}
                  onChange={setVisibilityState}
                  options={[
                    { value: 'public', label: 'Público' },
                    { value: 'private', label: 'Privado' },
                  ]}
                />
              </PrefRow>
              <PrefRow
                icon={notify === 'on' ? Bell : BellOff}
                title="Notificações"
                hint={notify === 'on' ? 'Você recebe alertas deste Space.' : 'Silenciado — só abre quando você entra.'}
              >
                <Segmented
                  value={notify}
                  onChange={setNotifyState}
                  options={[
                    { value: 'on', label: 'Ativas' },
                    { value: 'off', label: 'Silenciadas' },
                  ]}
                />
              </PrefRow>
            </div>
          </section>

          {error && (
            <p className="text-[12px] text-danger" role="alert">{error}</p>
          )}
        </div>

        <footer className="shrink-0 flex items-center justify-between gap-3 px-6 py-3.5 border-t border-white/[0.06]">
          <p className={`text-[12px] ${dirty ? 'text-[#F0B429]' : 'text-transparent'}`}>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" />
            Há alterações não salvas.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="h-9 px-3.5 rounded-xl text-[12.5px] font-medium text-ink bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-9 px-4 rounded-xl text-[12.5px] font-semibold whitespace-nowrap bg-accent text-on-accent hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </footer>
      </form>
    </ModalShell>
    <SpaceIconPicker
      open={iconOpen}
      current={icon}
      recents={recents}
      onPick={(next) => {
        setIcon(next)
        setRecents(pushRecentIcon(next))
        setIconOpen(false)
      }}
      onClose={() => setIconOpen(false)}
      anchorRef={iconButtonRef}
    />
    </>,
    document.body,
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-3">
      {children}
    </p>
  )
}

function PrefRow({ icon: Icon, title, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3.5">
      <div className="flex items-start gap-3 min-w-0">
        <Icon size={16} className="text-muted mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13.5px] text-strong">{title}</p>
          <p className="text-[11.5px] text-muted leading-snug mt-0.5">{hint}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function Segmented({ value, onChange, options }) {
  return (
    <div role="radiogroup" className="inline-flex p-0.5 rounded-lg bg-[#0d0e12] border border-white/[0.08] shrink-0">
      {options.map(opt => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(opt.value)}
            className={[
              'h-7 px-3 rounded-md text-[11.5px] font-medium transition-colors',
              selected ? 'bg-accent text-on-accent' : 'text-muted hover:text-strong',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
