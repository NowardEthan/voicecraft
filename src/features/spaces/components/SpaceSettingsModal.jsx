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
import { SpaceIconCropModal } from './SpaceIconCropModal'
import { ColorIdentityPicker, paletteColorFor, PALETTE } from './ColorIdentityPicker'
import { SpaceIcon, normalizeSpaceIcon, serializeSpaceIcon, getRecentIcons, pushRecentIcon, isSpaceIconImage } from '../model/spaceIcons'
import { flashToast } from '../../../shared/utils/toast'
import {
  getSpaceCover,
  setSpaceCover,
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
import { SpaceRolesPanel } from './SpaceRolesPanel'
import { FontFieldSelect, FontUploadRow } from './FontFieldSelect'
import {
  ensureSpaceFontFaces,
  fieldFontStyle,
  normalizeSpaceFonts,
  normalizeTypography,
} from '../model/spaceTypography'
import { uploadSpaceFont } from '../model/spaceFontsStore'

function isCoverSrc(src) {
  return typeof src === 'string'
    && (src.startsWith('data:image/') || /^https?:\/\//.test(src))
}

function snapshotOf({ icon, name, description, slogan, color, cover, coverFit, visibility, notify, typography, fonts }) {
  return JSON.stringify({
    icon: serializeSpaceIcon(icon),
    name,
    description,
    slogan,
    color,
    cover: cover || '',
    coverFit: normalizeCoverFit(coverFit),
    visibility,
    notify,
    typography: normalizeTypography(typography),
    fonts: normalizeSpaceFonts(fonts).map((f) => f.id),
  })
}

export default function SpaceSettingsModal({ open, space, onSave, onClose, isCreator = false }) {
  const [tab, setTab] = useState('general') // 'general' | 'roles'
  const [icon, setIcon] = useState(() => normalizeSpaceIcon(null))
  const [recents, setRecents] = useState(() => getRecentIcons())
  const iconButtonRef = useRef(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [slogan, setSlogan] = useState('')
  const [color, setColor] = useState(PALETTE[0].css)
  const [coverDataUrl, setCoverDataUrl] = useState(null)
  const [coverFit, setCoverFit] = useState(DEFAULT_COVER_FIT)
  const [visibility, setVisibilityState] = useState('public')
  const [notify, setNotifyState] = useState('on')
  const [typography, setTypography] = useState(() => normalizeTypography(null))
  const [fonts, setFonts] = useState([])
  const [fontUploading, setFontUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [iconOpen, setIconOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const [iconCrop, setIconCrop] = useState(null) // { src, fit }
  const fileInputRef = useRef(null)
  const iconFileRef = useRef(null)
  const baselineRef = useRef('')

  useEffect(() => {
    if (!open || !space) return
    const nextIcon = normalizeSpaceIcon(space.icon)
    const nextName = space.name || ''
    const nextDesc = space.description || ''
    const nextSlogan = space.slogan || space.tagline || ''
    const nextColor = paletteColorFor(space.color).css
    const sharedCover = isCoverSrc(space.cover) ? space.cover : null
    const localCover = getSpaceCover(space.id)
    const nextCover = sharedCover || (isCoverSrc(localCover) ? localCover : null)
    const nextFit = normalizeCoverFit(space.coverFit)
    const nextVis = normalizeVisibility(space.visibility ?? getVisibility(space.id))
    const nextNotify = getNotify(space.id)
    const nextTypography = normalizeTypography(space.typography)
    const nextFonts = normalizeSpaceFonts(space.fonts)
    setIcon(nextIcon)
    setName(nextName)
    setDescription(nextDesc)
    setSlogan(nextSlogan)
    setColor(nextColor)
    setCoverDataUrl(nextCover)
    setCoverFit(nextFit)
    setVisibilityState(nextVis)
    setNotifyState(nextNotify)
    setTypography(nextTypography)
    setFonts(nextFonts)
    ensureSpaceFontFaces(nextFonts)
    setError(null)
    setSubmitting(false)
    setIconOpen(false)
    setColorOpen(false)
    setTab('general')
    baselineRef.current = snapshotOf({
      icon: nextIcon,
      name: nextName,
      description: nextDesc,
      slogan: nextSlogan,
      color: nextColor,
      cover: nextCover,
      coverFit: nextFit,
      visibility: nextVis,
      notify: nextNotify,
      typography: nextTypography,
      fonts: nextFonts,
    })
  }, [open, space])

  const dirty = useMemo(() => {
    if (!open) return false
    return snapshotOf({
      icon, name, description, slogan, color, cover: coverDataUrl, coverFit, visibility, notify, typography, fonts,
    }) !== baselineRef.current
  }, [open, icon, name, description, slogan, color, coverDataUrl, coverFit, visibility, notify, typography, fonts])

  if (!open || !space) return null

  const hasCover = isCoverSrc(coverDataUrl)
  const draftSpace = { typography, fonts }
  const nameFont = fieldFontStyle(draftSpace, 'name')
  const descFont = fieldFontStyle(draftSpace, 'description')
  const sloganFont = fieldFontStyle(draftSpace, 'slogan')

  const setFieldFont = (field, fontId) => {
    setTypography((prev) => ({
      ...normalizeTypography(prev),
      [field]: { fontId },
    }))
  }

  const handleFontUpload = async (file) => {
    if (!space?.id || fontUploading) return
    setFontUploading(true)
    try {
      const created = await uploadSpaceFont(space.id, file)
      setFonts((prev) => [...normalizeSpaceFonts(prev), created])
      ensureSpaceFontFaces([created])
      flashToast(`Fonte “${created.label}” enviada`)
    } catch (err) {
      flashToast(err?.message || 'Falha ao enviar fonte')
    } finally {
      setFontUploading(false)
    }
  }

  const handlePickCover = () => fileInputRef.current?.click()

  const handlePickIconImage = () => {
    setIconOpen(false)
    setColorOpen(false)
    iconFileRef.current?.click()
  }

  const handleIconFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setIconCrop({
        src: dataUrl,
        fit: icon?.type === 'image' ? (icon.fit || DEFAULT_COVER_FIT) : DEFAULT_COVER_FIT,
      })
    } catch (err) {
      flashToast(err?.message || 'Falha ao abrir imagem')
    }
  }

  const handleApplyIconCrop = ({ dataUrl, fit, rawSrc }) => {
    setIcon({
      type: 'image',
      src: dataUrl,
      rawSrc: rawSrc || dataUrl,
      fit: normalizeCoverFit(fit),
    })
    setIconCrop(null)
  }
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
    if (tab !== 'general') return
    if (!name.trim()) {
      setError('O nome do Space é obrigatório.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (space.id) {
        setVisibility(space.id, visibility)
        setNotify(space.id, notify)
      }
      const payload = {
        name: name.trim(),
        description: description.trim().slice(0, 256),
        slogan: slogan.trim().slice(0, 80),
        color,
        icon: serializeSpaceIcon(icon),
        cover: coverDataUrl || null,
        coverFit: coverDataUrl ? coverFit : null,
        visibility,
        typography: normalizeTypography(typography),
        fonts: normalizeSpaceFonts(fonts),
      }
      // Keep a local copy so the banner still works if Storage upload fails.
      if (space.id && typeof coverDataUrl === 'string' && coverDataUrl.startsWith('data:image/')) {
        setSpaceCover(space.id, coverDataUrl)
      } else if (space.id && !coverDataUrl) {
        clearSpaceCover(space.id)
      }
      const maybePromise = onSave?.(payload)
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise
      }
      if (space.id && isCoverSrc(coverDataUrl) && !coverDataUrl.startsWith('data:image/')) {
        clearSpaceCover(space.id)
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
      closeOnEscape={!iconOpen && !colorOpen && !iconCrop}
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

        <div className="shrink-0 px-6 pb-3 flex items-center gap-1 border-b border-white/[0.06]">
          <TabButton active={tab === 'general'} onClick={() => setTab('general')}>
            Geral
          </TabButton>
          <TabButton active={tab === 'roles'} onClick={() => setTab('roles')}>
            Cargos
          </TabButton>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 space-y-6">
          {tab === 'roles' ? (
            <div className="pt-4">
              <SpaceRolesPanel spaceId={space.id} enabled={!!isCreator} />
            </div>
          ) : (
          <>
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
            <div className="relative flex items-end justify-between gap-4 px-5 py-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                  style={{ backgroundColor: 'rgba(0,0,0,0.38)', boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 50%, transparent)` }}
                  aria-hidden
                >
                  <SpaceIcon value={icon} size={24} className="text-white" />
                </span>
                <div className="min-w-0">
                  <p
                    className="text-[18px] font-semibold text-white tracking-tight truncate"
                    style={nameFont}
                  >
                    {name.trim() || 'Sem nome'}
                  </p>
                  <p
                    className="text-[12.5px] text-white/70 mt-0.5 line-clamp-2"
                    style={descFont}
                  >
                    {description.trim() || 'Um lugar para jogar, conversar e criar junto.'}
                  </p>
                </div>
              </div>
              <p
                className="hidden sm:block text-right text-[18px] leading-tight font-semibold text-white/85 max-w-[140px] shrink-0 select-none"
                style={{ ...sloganFont, whiteSpace: 'pre-line' }}
              >
                {(slogan.trim() || 'Good Games\nBetter People.')}
              </p>
            </div>
          </div>

          <section>
            <SectionLabel>Aparência</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                  style={identitySurfaceStyle(color)}
                  aria-hidden
                >
                  <SpaceIcon
                    value={icon}
                    size={isSpaceIconImage(icon) ? 48 : 22}
                    className={isSpaceIconImage(icon) ? 'rounded-xl' : undefined}
                    style={{ color: 'inherit' }}
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted mb-1.5">Ícone</p>
                  <div className="flex flex-wrap items-center gap-1.5">
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
                    <button
                      type="button"
                      onClick={handlePickIconImage}
                      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-strong border border-white/[0.08] transition-colors"
                    >
                      Enviar imagem
                    </button>
                    {isSpaceIconImage(icon) && (
                      <button
                        type="button"
                        onClick={() => {
                          const src = icon?.rawSrc || icon?.src
                          if (!src) return
                          setIconCrop({
                            src,
                            fit: icon?.fit || DEFAULT_COVER_FIT,
                          })
                        }}
                        className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-strong border border-white/[0.08] transition-colors"
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted mt-1.5">
                    Ícones prontos ou PNG/JPEG com crop, zoom e preview.
                  </p>
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
            <input
              ref={iconFileRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              onChange={handleIconFile}
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
                  style={nameFont}
                />
                <FontFieldSelect
                  label="Fonte do nome"
                  value={typography.name?.fontId}
                  onChange={(id) => setFieldFont('name', id)}
                  customFonts={fonts}
                  previewText={name.trim() || 'Nome'}
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
                  style={descFont}
                />
                <FontFieldSelect
                  label="Fonte da descrição"
                  value={typography.description?.fontId}
                  onChange={(id) => setFieldFont('description', id)}
                  customFonts={fonts}
                  previewText={description.trim() || 'Descrição'}
                />
                <p className="text-[11px] text-muted mt-1 text-right tabular-nums">{description.length}/256</p>
              </label>
              <label className="block min-w-0">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted block mb-1.5">
                  Frase do banner
                </span>
                <textarea
                  value={slogan}
                  onChange={(e) => setSlogan(e.target.value)}
                  maxLength={80}
                  rows={2}
                  className="w-full min-h-[56px] px-3 py-2 rounded-xl text-[13px] resize-none bg-[#0d0e12] border border-white/[0.08] text-strong focus:outline-none focus:border-accent/50 placeholder:text-muted"
                  placeholder={'Good Games\nBetter People.'}
                  style={sloganFont}
                />
                <FontFieldSelect
                  label="Fonte da frase"
                  value={typography.slogan?.fontId}
                  onChange={(id) => setFieldFont('slogan', id)}
                  customFonts={fonts}
                  previewText={(slogan.trim() || 'Frase').split('\n')[0]}
                />
                <p className="text-[11px] text-muted mt-1">
                  Aparece no lado direito do hero. Use Enter para quebrar linha.
                  <span className="float-right tabular-nums">{slogan.length}/80</span>
                </p>
              </label>
              <FontUploadRow onUpload={handleFontUpload} busy={fontUploading} />
              <p className="text-[11px] text-muted leading-snug">
                Fontes enviadas ficam neste Space — todo mundo vê o mesmo estilo.
              </p>
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
          </>
          )}
        </div>

        {tab === 'general' && (
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
        )}
      </form>
    </ModalShell>
    <SpaceIconPicker
      open={iconOpen}
      current={icon}
      recents={recents}
      enableEmojis={false}
      onUploadImage={handlePickIconImage}
      onPick={(next) => {
        setIcon(next)
        setRecents(pushRecentIcon(next))
        setIconOpen(false)
      }}
      onClose={() => setIconOpen(false)}
      anchorRef={iconButtonRef}
    />
    <SpaceIconCropModal
      open={!!iconCrop}
      src={iconCrop?.src}
      initialFit={iconCrop?.fit}
      spaceColor={color}
      spaceName={name || space?.name || 'Space'}
      onCancel={() => setIconCrop(null)}
      onPickAnother={handlePickIconImage}
      onApply={handleApplyIconCrop}
    />
    </>,
    document.body,
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'h-8 px-3 rounded-lg text-[12.5px] font-semibold transition-colors',
        active ? 'bg-white/[0.08] text-strong' : 'text-muted hover:text-strong hover:bg-white/[0.04]',
      ].join(' ')}
    >
      {children}
    </button>
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
