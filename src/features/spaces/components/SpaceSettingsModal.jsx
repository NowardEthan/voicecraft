/**
 * SpaceSettingsModal — full-screen identity and preferences editor for a Space.
 * Keeps each concern in a focused section and mirrors visual changes in a live preview.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  BellOff,
  Eye,
  EyeOff,
  Image as CoverIcon,
  ImagePlus,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import { SpaceIconPicker } from './SpaceIconPicker'
import { SpaceIconCropModal } from './SpaceIconCropModal'
import { ColorIdentityPicker, paletteColorFor, PALETTE } from './ColorIdentityPicker'
import {
  SpaceIcon,
  normalizeSpaceIcon,
  serializeSpaceIcon,
  getRecentIcons,
  pushRecentIcon,
  isSpaceIconImage,
} from '../model/spaceIcons'
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
import { getVisibility, setVisibility, getNotify, setNotify } from '../model/spacePreferences'
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

const NAV_GROUPS = [
  {
    label: 'Personalização',
    items: [
      { id: 'identity', label: 'Visão geral', icon: LayoutDashboard },
      { id: 'cover', label: 'Capa', icon: CoverIcon },
      { id: 'content', label: 'Conteúdo e tipografia', icon: Type },
    ],
  },
  {
    label: 'Administração',
    items: [
      { id: 'access', label: 'Acesso e notificações', icon: SlidersHorizontal },
      { id: 'roles', label: 'Cargos e permissões', icon: ShieldCheck },
    ],
  },
]

const SECTION_COPY = {
  identity: {
    eyebrow: 'Personalização',
    title: 'Visão geral e identidade',
    description: 'Defina o símbolo e a cor que identificam este Space em toda a experiência.',
  },
  cover: {
    eyebrow: 'Personalização',
    title: 'Imagem de capa',
    description: 'Crie o cenário do Space e ajuste o enquadramento diretamente na imagem.',
  },
  content: {
    eyebrow: 'Personalização',
    title: 'Conteúdo e tipografia',
    description: 'Ajuste os textos do hero e escolha uma voz tipográfica para cada elemento.',
  },
  access: {
    eyebrow: 'Administração',
    title: 'Acesso e notificações',
    description: 'Controle como as pessoas encontram o Space e como você recebe novidades.',
  },
  roles: {
    eyebrow: 'Administração',
    title: 'Cargos e permissões',
    description: 'Organize a hierarquia e determine o que cada grupo pode fazer.',
  },
}

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
    fonts: normalizeSpaceFonts(fonts).map((font) => font.id),
  })
}

export default function SpaceSettingsModal({ open, space, onSave, onClose, isCreator = false }) {
  const [section, setSection] = useState('identity')
  const [icon, setIcon] = useState(() => normalizeSpaceIcon(null))
  const [recents, setRecents] = useState(() => getRecentIcons())
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
  const [iconCrop, setIconCrop] = useState(null)
  const iconButtonRef = useRef(null)
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
    setSection('identity')
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
      icon,
      name,
      description,
      slogan,
      color,
      cover: coverDataUrl,
      coverFit,
      visibility,
      notify,
      typography,
      fonts,
    }) !== baselineRef.current
  }, [open, icon, name, description, slogan, color, coverDataUrl, coverFit, visibility, notify, typography, fonts])

  if (!open || !space) return null

  const hasCover = isCoverSrc(coverDataUrl)
  const draftSpace = { typography, fonts }
  const nameFont = fieldFontStyle(draftSpace, 'name')
  const descFont = fieldFontStyle(draftSpace, 'description')
  const sloganFont = fieldFontStyle(draftSpace, 'slogan')
  const showPreview = section === 'identity' || section === 'cover' || section === 'content'
  const currentCopy = SECTION_COPY[section]

  const setFieldFont = (field, fontId) => {
    setTypography((previous) => ({
      ...normalizeTypography(previous),
      [field]: { fontId },
    }))
  }

  const handleFontUpload = async (file) => {
    if (!space?.id || fontUploading) return
    setFontUploading(true)
    try {
      const created = await uploadSpaceFont(space.id, file)
      setFonts((previous) => [...normalizeSpaceFonts(previous), created])
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

  const handleIconFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
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

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setCoverDataUrl(await readFileAsDataUrl(file))
      setCoverFit(DEFAULT_COVER_FIT)
    } catch (err) {
      flashToast(err.message || 'Falha ao carregar imagem')
    }
  }

  const handleSubmit = async (event) => {
    event?.preventDefault?.()
    if (section === 'roles') return
    if (!name.trim()) {
      setError('O nome do Space é obrigatório.')
      setSection('content')
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
      if (space.id && typeof coverDataUrl === 'string' && coverDataUrl.startsWith('data:image/')) {
        setSpaceCover(space.id, coverDataUrl)
      } else if (space.id && !coverDataUrl) {
        clearSpaceCover(space.id)
      }
      const maybePromise = onSave?.(payload)
      if (maybePromise && typeof maybePromise.then === 'function') await maybePromise
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
        maxWidth="4xl"
        closeOnEscape={!iconOpen && !colorOpen && !iconCrop}
        panelClassName="vc-space-modal vc-space-settings-modal min-h-0 overflow-hidden"
        contentClassName="h-full min-h-0"
      >
        <form
          onSubmit={handleSubmit}
          className="vc-space-settings-surface"
          style={{
            ...spaceTokens({ color }),
            background: '#111318',
            border: '1px solid rgba(255, 255, 255, 0.09)',
          }}
        >
          <aside className="vc-space-settings-sidebar">
            <div className="vc-space-settings-brand">
              <span className="vc-space-settings-brand__icon" style={identitySurfaceStyle(color)} aria-hidden>
                <SpaceIcon value={icon} size={22} style={{ color: 'inherit' }} />
              </span>
              <div className="min-w-0">
                <p className="vc-space-settings-brand__kicker">Configurações do Space</p>
                <h2 id="space-settings-title">{name.trim() || space.name || 'Seu Space'}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="vc-space-settings-close">
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            <nav className="vc-space-settings-nav" aria-label="Configurações do Space">
              {NAV_GROUPS.map((group) => (
                <div className="vc-space-settings-nav__group" key={group.label}>
                  <p>{group.label}</p>
                  <div className="vc-space-settings-nav__items">
                    {group.items.map((item) => (
                      <SettingsNavButton
                        key={item.id}
                        active={section === item.id}
                        icon={item.icon}
                        onClick={() => {
                          setSection(item.id)
                          setIconOpen(false)
                          setColorOpen(false)
                        }}
                      >
                        {item.label}
                      </SettingsNavButton>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="vc-space-settings-sidebar__note">
              <span style={identitySurfaceStyle(color)} aria-hidden />
              <p>As mudanças visuais aparecem no preview antes de serem salvas.</p>
            </div>
          </aside>

          <main className="vc-space-settings-main">
            <div className={`vc-space-settings-workspace${showPreview ? ' has-preview' : ' is-wide'}`}>
              <div className="vc-space-settings-editor">
                <div className={`vc-space-settings-editor__inner${section === 'roles' ? ' is-roles' : ''}`}>
                  <header className="vc-space-settings-section-header">
                    <p>{currentCopy.eyebrow}</p>
                    <h3>{currentCopy.title}</h3>
                    <span>{currentCopy.description}</span>
                  </header>

                  {section === 'identity' && (
                    <IdentitySection
                      icon={icon}
                      color={color}
                      iconButtonRef={iconButtonRef}
                      colorOpen={colorOpen}
                      setColor={setColor}
                      setColorOpen={setColorOpen}
                      setIconOpen={setIconOpen}
                      handlePickIconImage={handlePickIconImage}
                      onAdjustIcon={() => {
                        const src = icon?.rawSrc || icon?.src
                        if (!src) return
                        setIconCrop({ src, fit: icon?.fit || DEFAULT_COVER_FIT })
                      }}
                    />
                  )}

                  {section === 'cover' && (
                    <CoverSection
                      hasCover={hasCover}
                      coverDataUrl={coverDataUrl}
                      coverFit={coverFit}
                      color={color}
                      setCoverFit={setCoverFit}
                      handlePickCover={handlePickCover}
                      onRemove={() => {
                        setCoverDataUrl(null)
                        setCoverFit(DEFAULT_COVER_FIT)
                      }}
                    />
                  )}

                  {section === 'content' && (
                    <ContentSection
                      name={name}
                      setName={setName}
                      description={description}
                      setDescription={setDescription}
                      slogan={slogan}
                      setSlogan={setSlogan}
                      typography={typography}
                      fonts={fonts}
                      setFieldFont={setFieldFont}
                      nameFont={nameFont}
                      descFont={descFont}
                      sloganFont={sloganFont}
                      handleFontUpload={handleFontUpload}
                      fontUploading={fontUploading}
                    />
                  )}

                  {section === 'access' && (
                    <AccessSection
                      visibility={visibility}
                      setVisibility={setVisibilityState}
                      notify={notify}
                      setNotify={setNotifyState}
                    />
                  )}

                  {section === 'roles' && (
                    <div className="vc-space-settings-roles">
                      <SpaceRolesPanel spaceId={space.id} enabled={!!isCreator} />
                    </div>
                  )}

                  {error && <p className="vc-space-settings-error" role="alert">{error}</p>}
                </div>
              </div>

              {showPreview && (
                <SpaceLivePreview
                  icon={icon}
                  name={name}
                  description={description}
                  slogan={slogan}
                  color={color}
                  coverDataUrl={coverDataUrl}
                  coverFit={coverFit}
                  hasCover={hasCover}
                  nameFont={nameFont}
                  descFont={descFont}
                  sloganFont={sloganFont}
                />
              )}
            </div>

            <footer className="vc-space-settings-footer">
              <div className="vc-space-settings-save-state" aria-live="polite">
                {section === 'roles' ? (
                  <span>Cargos são salvos individualmente.</span>
                ) : dirty ? (
                  <span className="is-dirty"><i aria-hidden /> Alterações não salvas</span>
                ) : (
                  <span>Tudo atualizado</span>
                )}
              </div>
              <div className="vc-space-settings-footer__actions">
                <button type="button" onClick={onClose} disabled={submitting} className="vc-space-settings-button is-secondary">
                  {section === 'roles' ? 'Fechar' : 'Cancelar'}
                </button>
                {section !== 'roles' && (
                  <button type="submit" disabled={submitting} className="vc-space-settings-button is-primary">
                    {submitting ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                )}
              </div>
            </footer>
          </main>

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

function SettingsNavButton({ active, icon: Icon, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={active ? 'is-active' : ''} aria-current={active ? 'page' : undefined}>
      <Icon size={17} strokeWidth={1.8} aria-hidden />
      <span>{children}</span>
    </button>
  )
}

function IdentitySection({
  icon,
  color,
  iconButtonRef,
  colorOpen,
  setColor,
  setColorOpen,
  setIconOpen,
  handlePickIconImage,
  onAdjustIcon,
}) {
  return (
    <div className="vc-space-settings-stack">
      <section className="vc-space-settings-card">
        <div className="vc-space-settings-card__heading">
          <div>
            <h4>Ícone do Space</h4>
            <p>Use um símbolo pronto ou envie uma imagem com crop e zoom.</p>
          </div>
        </div>
        <div className="vc-space-settings-icon-editor">
          <span className="vc-space-settings-icon-editor__preview" style={identitySurfaceStyle(color)} aria-hidden>
            <SpaceIcon
              value={icon}
              size={isSpaceIconImage(icon) ? 76 : 34}
              className={isSpaceIconImage(icon) ? 'rounded-2xl' : undefined}
              style={{ color: 'inherit' }}
            />
          </span>
          <div className="vc-space-settings-control-actions">
            <button
              ref={iconButtonRef}
              type="button"
              onClick={() => setIconOpen((value) => !value)}
              className="vc-space-settings-button is-secondary"
            >
              <ImagePlus size={15} /> Escolher ícone
            </button>
            <button type="button" onClick={handlePickIconImage} className="vc-space-settings-button is-secondary">
              Enviar imagem
            </button>
            {isSpaceIconImage(icon) && (
              <button type="button" onClick={onAdjustIcon} className="vc-space-settings-button is-quiet">
                Ajustar recorte
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="vc-space-settings-card">
        <div className="vc-space-settings-card__heading">
          <div>
            <h4>Cor de identidade</h4>
            <p>Aplicada em destaques, botões e superfícies do Space.</p>
          </div>
          <span className="vc-space-settings-color-chip"><i style={{ background: color }} />{color}</span>
        </div>
        <ColorIdentityPicker
          value={color}
          heading=""
          onChange={setColor}
          open={colorOpen}
          onOpenChange={(next) => {
            if (next) setIconOpen(false)
            setColorOpen(next)
          }}
        />
      </section>
    </div>
  )
}

function CoverSection({ hasCover, coverDataUrl, coverFit, color, setCoverFit, handlePickCover, onRemove }) {
  return (
    <section className="vc-space-settings-card vc-space-settings-cover-card">
      <div className="vc-space-settings-card__heading">
        <div>
          <h4>Capa do hero</h4>
          <p>Arraste para reposicionar e use a roda do mouse para ajustar o zoom.</p>
        </div>
        {hasCover && <span className="vc-space-settings-badge">Preview interativo</span>}
      </div>
      <div className="vc-space-settings-cover-editor">
        {hasCover ? (
          <SpaceCoverLayer
            src={coverDataUrl}
            fit={coverFit}
            interactive
            showControls={false}
            onFitChange={setCoverFit}
          />
        ) : (
          <div className="vc-space-settings-cover-editor__fallback" style={{ background: bannerGradient(color) }} />
        )}
        <div className="vc-space-settings-cover-editor__shade" aria-hidden />
        {hasCover && (
          <SpaceCoverFitControls fit={coverFit} onFitChange={setCoverFit} className="vc-space-settings-cover-editor__fit" />
        )}
        <div className="vc-space-settings-cover-editor__actions">
          <button type="button" onClick={handlePickCover} className="vc-space-settings-button is-glass">
            <ImagePlus size={15} /> {hasCover ? 'Trocar imagem' : 'Escolher imagem'}
          </button>
          {hasCover && (
            <button type="button" onClick={onRemove} className="vc-space-settings-button is-danger-glass">
              <Trash2 size={15} /> Remover
            </button>
          )}
        </div>
      </div>
      <p className="vc-space-settings-help">JPG, PNG, WebP ou GIF. Imagens amplas funcionam melhor.</p>
    </section>
  )
}

function ContentSection({
  name,
  setName,
  description,
  setDescription,
  slogan,
  setSlogan,
  typography,
  fonts,
  setFieldFont,
  nameFont,
  descFont,
  sloganFont,
  handleFontUpload,
  fontUploading,
}) {
  return (
    <div className="vc-space-settings-stack">
      <section className="vc-space-settings-card vc-space-settings-fields">
        <FieldLabel label="Nome do Space" count={`${name.length}/64`}>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
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
        </FieldLabel>

        <FieldLabel label="Descrição" count={`${description.length}/256`}>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={256}
            rows={4}
            spellCheck
            lang="pt-BR"
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
        </FieldLabel>

        <FieldLabel label="Frase do banner" count={`${slogan.length}/80`} hint="Use Enter para quebrar a linha.">
          <textarea
            value={slogan}
            onChange={(event) => setSlogan(event.target.value)}
            maxLength={80}
            rows={3}
            spellCheck
            lang="pt-BR"
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
        </FieldLabel>
      </section>

      <section className="vc-space-settings-card">
        <div className="vc-space-settings-card__heading">
          <div>
            <h4>Fontes do Space</h4>
            <p>Fontes enviadas ficam disponíveis para todos e mantêm o visual consistente.</p>
          </div>
        </div>
        <FontUploadRow onUpload={handleFontUpload} busy={fontUploading} />
      </section>
    </div>
  )
}

function FieldLabel({ label, count, hint, children }) {
  return (
    <label className="vc-space-settings-field">
      <span className="vc-space-settings-field__label">
        <span>{label}</span>
        <i>{count}</i>
      </span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

function AccessSection({ visibility, setVisibility, notify, setNotify }) {
  return (
    <div className="vc-space-settings-stack">
      <section className="vc-space-settings-card vc-space-settings-preferences">
        <PrefRow
          icon={visibility === 'public' ? Eye : EyeOff}
          title="Visibilidade do Space"
          hint={visibility === 'public' ? 'Aparece na lista e aceita convites.' : 'Oculto da lista; só entra por link direto.'}
        >
          <Segmented
            value={visibility}
            onChange={setVisibility}
            options={[{ value: 'public', label: 'Público' }, { value: 'private', label: 'Privado' }]}
          />
        </PrefRow>
        <PrefRow
          icon={notify === 'on' ? Bell : BellOff}
          title="Notificações"
          hint={notify === 'on' ? 'Você recebe alertas deste Space.' : 'Silenciado; você vê novidades quando entrar.'}
        >
          <Segmented
            value={notify}
            onChange={setNotify}
            options={[{ value: 'on', label: 'Ativas' }, { value: 'off', label: 'Silenciadas' }]}
          />
        </PrefRow>
      </section>
    </div>
  )
}

function SpaceLivePreview({
  icon,
  name,
  description,
  slogan,
  color,
  coverDataUrl,
  coverFit,
  hasCover,
  nameFont,
  descFont,
  sloganFont,
}) {
  const displayName = name.trim() || 'Sem nome'
  return (
    <aside className="vc-space-settings-preview-pane" aria-label="Preview em tempo real">
      <div className="vc-space-settings-preview-sticky">
        <div className="vc-space-settings-preview-label">
          <div><Eye size={14} aria-hidden /><span>Preview em tempo real</span></div>
          <span>Página do Space</span>
        </div>
        <article className="vc-space-live-preview">
          <div className="vc-space-live-preview__hero">
            {hasCover ? (
              <SpaceCoverLayer src={coverDataUrl} fit={coverFit} />
            ) : (
              <div className="vc-space-live-preview__cover" style={{ background: bannerGradient(color) }} />
            )}
            <div className="vc-space-live-preview__overlay" style={{ background: bannerOverlay(color, hasCover) }} />
            <div className="vc-space-live-preview__gradient" aria-hidden />
            <div className="vc-space-live-preview__hero-content">
              <span className="vc-space-live-preview__icon" style={{ boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 55%, transparent)` }}>
                <SpaceIcon value={icon} size={isSpaceIconImage(icon) ? 60 : 29} />
              </span>
              <div className="vc-space-live-preview__copy">
                <h4 style={nameFont}>{displayName}</h4>
                <p style={descFont}>{description.trim() || 'Um lugar para jogar, conversar e criar junto.'}</p>
              </div>
              <p className="vc-space-live-preview__slogan" style={sloganFont}>
                {slogan.trim() || 'Good Games\nBetter People.'}
              </p>
            </div>
          </div>
          <div className="vc-space-live-preview__body">
            <div className="vc-space-live-preview__welcome">
              <span style={identitySurfaceStyle(color)}><SpaceIcon value={icon} size={18} /></span>
              <div>
                <small>BOAS-VINDAS</small>
                <p>Comece por aqui, conheça o {displayName} e encontre sua próxima conversa.</p>
              </div>
            </div>
            <div className="vc-space-live-preview__grid">
              <div className="vc-space-live-preview__room">
                <div><i style={{ background: color }} /><span>Conversa geral</span></div>
                <small>8 pessoas participando</small>
              </div>
              <div className="vc-space-live-preview__activity">
                <small>AGORA NO SPACE</small>
                <div className="vc-space-live-preview__avatars" aria-hidden>
                  <i /><i /><i /><b>+5</b>
                </div>
              </div>
            </div>
          </div>
        </article>
        <p className="vc-space-settings-preview-hint">Nome, textos, ícone, cor, capa e fontes são atualizados instantaneamente.</p>
      </div>
    </aside>
  )
}

function PrefRow({ icon: Icon, title, hint, children }) {
  return (
    <div className="vc-space-settings-pref-row">
      <div className="vc-space-settings-pref-row__copy">
        <span><Icon size={18} aria-hidden /></span>
        <div>
          <p>{title}</p>
          <small>{hint}</small>
        </div>
      </div>
      {children}
    </div>
  )
}

function Segmented({ value, onChange, options }) {
  return (
    <div role="radiogroup" className="vc-space-settings-segmented">
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(option.value)}
            className={selected ? 'is-selected' : ''}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
