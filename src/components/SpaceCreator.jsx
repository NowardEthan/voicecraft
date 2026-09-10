/**
 * SpaceCreator — multi-step modal (normativa do prompt operacional).
 *
 *   Step 1 — Identidade   : nome, descrição, tema, ícone + live preview
 *   Step 2 — Primeira sala : propósito (grid) + nome da sala
 *   Step 3 — Revisar      : card final + boas-vindas
 *
 * Step 1 (DESIGN_SYSTEM §7.1-aligned):
 *   - Title: "Criar Space"
 *   - Full-width preview card on top (avatar + name + subtitle)
 *   - Form below in a single column (name, description, theme, icon)
 *   - Theme picker: 8 solid color swatches (no premium, no gradients)
 *   - Icon picker: opens a separate overlay with category sidebar + 4×4 grid
 *
 * Contrato preservado: onCreate({ name, description, icon, color, themeId,
 * cover, coverFit, firstRoom }).
 */
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Check, X, RefreshCw, ImagePlus,
} from 'lucide-react'
import { CREATE_PURPOSES } from '../features/rooms'
import useFocusTrap from '../shared/hooks/useFocusTrap'
import { EASE_OUT } from '../shared/motion/presets.js'
import {
  SpaceIcon,
  DEFAULT_COVER_FIT,
  bannerGradient,
  bannerOverlay,
  coverImageStyle,
  getRecentIcons,
  identitySurfaceStyle,
  pushRecentIcon,
  readFileAsDataUrl,
  spaceTokens,
} from '../features/spaces'
import { SpaceIconPicker } from '../features/spaces/components/SpaceIconPicker'
import { ColorIdentityPicker, PALETTE, normalizeHex, paletteColorFor } from '../features/spaces/components/ColorIdentityPicker'
import { SpaceCoverFitControls, SpaceCoverLayer } from '../features/spaces/components/SpaceCoverLayer'
import { FirstRoomStep, DEFAULT_ROOM_NAMES } from './space-creator/FirstRoomStep.jsx'
import { ReviewStep } from './space-creator/review/ReviewStep.jsx'

// --------------------------------------------------------------------------
// Stepper — three bullets with connecting line.
// --------------------------------------------------------------------------
function Stepper({ step }) {
  const steps = [
    { id: 1, label: 'Identidade' },
    { id: 2, label: 'Primeira sala' },
    { id: 3, label: 'Revisar' },
  ]
  return (
    <div className="flex items-center gap-3 select-none">
      {steps.map((s, idx) => {
        const active = step === s.id
        const done = step > s.id
        return (
          <div key={s.id} className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-current={active ? 'step' : undefined}
                className={
                  'w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-all ' +
                  (active
                    ? 'bg-accent text-on-accent shadow-[0_0_0_3px_var(--space-accent-soft),0_0_16px_-2px_var(--space-accent-glow-24)]'
                    : done
                      ? 'bg-accent/80 text-on-accent'
                      : 'bg-[#0f1014] text-muted ring-1 ring-line')
                }
              >
                {done ? <Check size={12} strokeWidth={3} /> : s.id}
              </span>
              <span
                className={
                  'text-[13.5px] font-medium ' +
                  (active ? 'text-strong' : done ? 'text-ink' : 'text-muted')
                }
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <span
                className="w-20 h-px"
                style={{
                  background: done
                    ? 'linear-gradient(90deg, var(--space-accent) 0%, var(--space-accent) 100%)'
                    : 'var(--vc-border)',
                  opacity: done ? 0.85 : 1,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// --------------------------------------------------------------------------

export default function SpaceCreator({ onCreate, onClose }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // iconValue is the canonical {id, collection, name, style} shape that
  // gets saved with the Space. See spaceIcons.jsx for the contract.
  const [iconValue, setIconValue] = useState({
    id: 'users-three',
    collection: 'ph',
    name: 'users-three',
    style: 'outline',
  })
  const [color, setColor] = useState(PALETTE[0].css)
  const [colorOpen, setColorOpen] = useState(false)
  const [cover, setCover] = useState(null)
  const [coverFit, setCoverFit] = useState(DEFAULT_COVER_FIT)
  const [firstRoomPurpose, setFirstRoomPurpose] = useState('conversation')
  const [firstRoomName, setFirstRoomName] = useState(DEFAULT_ROOM_NAMES.conversation)
  // Tracks whether the user has typed into the name field. When false, we
  // auto-suggest a default name whenever the type changes. When true, we
  // preserve whatever the user typed (per spec §10).
  const [firstRoomManuallyRenamed, setFirstRoomManuallyRenamed] = useState(false)
  // When the user is in an edit step (1 or 2) but originally came from
  // Step 3 (Review) via an "Editar" button, this flag is set so the
  // Footer shows "Voltar à revisão" instead of "Continuar". Cleared when
  // the user explicitly returns to Step 3 or closes the wizard.
  const [reviewingFrom, setReviewingFrom] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [recents, setRecents] = useState(() => getRecentIcons())
  const nameRef = useRef(null)
  const iconButtonRef = useRef(null)

  useEffect(() => { nameRef.current?.focus() }, [])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  const trapRef = useFocusTrap({ active: true })
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return
      if (colorOpen) {
        setColorOpen(false)
        return
      }
      if (iconPickerOpen) return
      onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, colorOpen, iconPickerOpen])

  const theme = paletteColorFor(color)

  // Direction for step transition (1 = forward / right→left, -1 = back).
  const [stepDirection, setStepDirection] = useState(1)

  /**
   * Jump to a step. When leaving Step 3 via an "Editar" button, set
   * reviewingFrom so the footer knows to take the user back to Step 3
   * on a single "Continuar" press. When arriving at Step 3, clear it.
   */
  const goToStep = (target) => {
    if (target !== step) {
      setStepDirection(target > step ? 1 : -1)
    }
    if (step === 3 && (target === 1 || target === 2)) {
      setReviewingFrom(true)
    } else if (target === 3) {
      setReviewingFrom(false)
    }
    setStep(target)
  }

  const goBackFromEdit = () => {
    // Used by the Footer when reviewingFrom is true — single press
    // returns to the review screen.
    setStep(3)
    setReviewingFrom(false)
  }

  // Step 2 — type change. If the user hasn't manually renamed the room,
  // swap the name to the default for the new type. Otherwise keep theirs.
  const handleSelectFirstRoomType = (key) => {
    if (!key) return
    setFirstRoomPurpose(key)
    if (!firstRoomManuallyRenamed) {
      setFirstRoomName(DEFAULT_ROOM_NAMES[key] || '')
    }
  }

  // Step 2 — name change. First edit flips the manuallyRenamed flag so
  // subsequent type changes stop auto-overwriting the name.
  const handleChangeFirstRoomName = (value) => {
    setFirstRoomName(value)
    if (!firstRoomManuallyRenamed && value !== (DEFAULT_ROOM_NAMES[firstRoomPurpose] || '')) {
      setFirstRoomManuallyRenamed(true)
    }
  }

  const handlePickIcon = (next) => {
    setIconValue(next)
    setRecents(pushRecentIcon(next))
    setIconPickerOpen(false)
  }

  /**
   * Validate the wizard state before calling onCreate. Per spec §10.
   * Returns a { ok, field } result so the caller can highlight the
   * failing section and (if needed) jump to the appropriate step.
   */
  const validate = () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      return { ok: false, field: 'identity.name', message: 'Dê um nome ao Space.' }
    }
    if (trimmedName.length > 64) {
      return { ok: false, field: 'identity.name', message: 'Nome do Space muito longo (máx. 64).' }
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(normalizeHex(color))) {
      return { ok: false, field: 'identity.theme', message: 'Tema inválido.' }
    }
    if (!iconValue || !iconValue.id || !iconValue.collection) {
      return { ok: false, field: 'identity.icon', message: 'Escolha um ícone para o Space.' }
    }
    if (firstRoomPurpose) {
      const roomTrimmed = firstRoomName.trim()
      if (!roomTrimmed) {
        return { ok: false, field: 'firstRoom.name', message: 'Dê um nome à primeira sala.' }
      }
      if (roomTrimmed.length > 64) {
        return { ok: false, field: 'firstRoom.name', message: 'Nome da sala muito longo (máx. 64).' }
      }
      if (!CREATE_PURPOSES.find(p => p.key === firstRoomPurpose)) {
        return { ok: false, field: 'firstRoom.type', message: 'Tipo de sala inválido.' }
      }
    }
    return { ok: true }
  }

  const commit = async () => {
    if (creating) return  // hard guard against double-click
    const v = validate()
    if (!v.ok) {
      setError(v.message)
      // Send the user to the step that needs the fix.
      if (v.field.startsWith('identity.')) {
        setStep(1)
      } else if (v.field.startsWith('firstRoom.')) {
        setStep(2)
      }
      return
    }
    setError('')
    setCreating(true)
    try {
      const trimmedName = name.trim()
      const trimmedRoom = firstRoomName.trim()
      const firstRoom = firstRoomPurpose
        ? {
            name: trimmedRoom,
            type: firstRoomPurpose === 'voice' ? 'voice' : 'text',
            purpose: firstRoomPurpose,
          }
        : null
      await onCreate({
        name: trimmedName,
        description: description.trim(),
        icon: iconValue,
        color: theme.css,
        themeId: theme.id,
        cover: cover || undefined,
        coverFit: cover ? coverFit : undefined,
        firstRoom,
      })
      // On success: onCreate handles closing the modal in App.jsx.
    } catch (err) {
      setError(err.message || 'Erro ao criar o Space.')
      setCreating(false)
    }
  }

  const canNext1 = name.trim().length > 0
  // Step 2 → 3 needs both: a type selected AND a non-empty room name.
  const canNext2 = Boolean(firstRoomPurpose) && firstRoomName.trim().length > 0
  const canAdvance = step === 1 ? canNext1 : step === 2 ? canNext2 : true

  return (
    <motion.div
      key="space-creator-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      className="fixed inset-0 z-50 flex items-center justify-center p-8 sm:p-10"
      style={{ background: 'rgba(4, 5, 8, 0.68)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        ref={trapRef}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 2 }}
        transition={{ duration: 0.26, ease: EASE_OUT }}
        className="relative w-full max-w-[940px] bg-[#1a1a1e] rounded-2xl border border-accent/25 shadow-[0_24px_80px_-20px_var(--space-accent-glow-24),0_8px_24px_-8px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col max-h-[92vh]"
        style={spaceTokens({ color: theme.css })}
      >
        {/* Modal header — title left, stepper centered, close right */}
        <div className="relative flex items-center justify-between px-8 pt-6 pb-3">
          <h1 className="text-[24px] font-bold text-strong tracking-tight">
            Criar Space
          </h1>
          <div className="absolute left-1/2 -translate-x-1/2 top-6">
            <Stepper step={step} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink hover:text-strong hover:bg-white/5 transition-colors"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-8 pb-4">
          <AnimatePresence mode="wait" custom={stepDirection}>
            <motion.div
              key={step}
              custom={stepDirection}
              initial={(dir) => ({ opacity: 0, x: dir * 24 })}
              animate={{ opacity: 1, x: 0 }}
              exit={(dir) => ({ opacity: 0, x: dir * -24 })}
              transition={{ duration: 0.26, ease: EASE_OUT }}
            >
              {step === 1 && (
                <Step1Identity
                  name={name} setName={(v) => { setName(v); if (error) setError('') }}
                  description={description} setDescription={setDescription}
                  iconValue={iconValue} setIconValue={setIconValue}
                  color={color}
                  setColor={setColor}
                  colorOpen={colorOpen}
                  setColorOpen={(next) => {
                    if (next) setIconPickerOpen(false)
                    setColorOpen(next)
                  }}
                  nameRef={nameRef}
                  onOpenIconPicker={() => {
                    setColorOpen(false)
                    setIconPickerOpen(true)
                  }}
                  iconButtonRef={iconButtonRef}
                  cover={cover}
                  setCover={(next) => {
                    setCover(next)
                    setCoverFit(DEFAULT_COVER_FIT)
                  }}
                  coverFit={coverFit}
                  setCoverFit={setCoverFit}
                />
              )}
              {step === 2 && (
                <FirstRoomStep
                  types={CREATE_PURPOSES}
                  typeKey={firstRoomPurpose}
                  roomName={firstRoomName}
                  manuallyRenamed={firstRoomManuallyRenamed}
                  onSelectType={handleSelectFirstRoomType}
                  onChangeName={handleChangeFirstRoomName}
                  onUserEditName={() => setFirstRoomManuallyRenamed(true)}
                />
              )}
              {step === 3 && (
                <ReviewStep
                  name={name}
                  description={description}
                  iconValue={iconValue}
                  theme={theme}
                  themeList={PALETTE}
                  cover={cover}
                  coverFit={coverFit}
                  firstRoomPurpose={firstRoomPurpose}
                  firstRoomName={firstRoomName}
                  onEditIdentity={() => goToStep(1)}
                  onEditFirstRoom={() => goToStep(2)}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {error && (
            <motion.div
              role="alert"
              aria-live="assertive"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-[10px] border border-danger/30 bg-danger/10"
            >
              <span
                aria-hidden
                className="w-1.5 h-1.5 rounded-full bg-danger shrink-0 mt-[7px]"
              />
              <p className="text-[12px] text-danger leading-snug">{error}</p>
            </motion.div>
          )}
        </div>

        <Footer
          step={step}
          setStep={setStep}
          creating={creating}
          canNext1={canAdvance}
          onCommit={commit}
          onClose={onClose}
          reviewingFrom={reviewingFrom && step !== 3}
          onReturnToReview={goBackFromEdit}
        />
      </motion.div>

      <SpaceIconPicker
        open={iconPickerOpen}
        current={iconValue}
        recents={recents}
        onPick={handlePickIcon}
        onClose={() => setIconPickerOpen(false)}
        anchorRef={iconButtonRef}
      />
    </motion.div>
  )
}

// --------------------------------------------------------------------------
// Step 1 — Identidade. Preview full-width on top, form in two columns.
// --------------------------------------------------------------------------
function Step1Identity({
  name, setName, description, setDescription,
  iconValue, color, setColor, colorOpen, setColorOpen, nameRef,
  onOpenIconPicker, iconButtonRef,
  cover, setCover,
  coverFit, setCoverFit,
}) {
  const theme = paletteColorFor(color)

  return (
    <div className="pt-4 pb-1">
      {/* Preview — full width, with wave layers */}
      <PreviewCardWide
        name={name || 'Nome do Space'}
        subtitle="Space de grupo"
        iconValue={iconValue}
        theme={theme}
        cover={cover}
        coverFit={coverFit}
        onCoverFitChange={setCoverFit}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5 mt-5">
        <div className="space-y-5 min-w-0">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-semibold text-ink tracking-wide">
                Nome do Space
              </label>
              <span className="text-[11.5px] text-muted tabular-nums">{name.length}/64</span>
            </div>
            <input
              ref={nameRef}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={64}
              placeholder="ex: Trabalho, Família, Gamers…"
              className="w-full h-[46px] px-3.5 bg-[#0f1014] border border-line rounded-[10px] text-[14px] text-strong placeholder:text-muted focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-semibold text-ink tracking-wide">
                Descrição <span className="text-muted font-normal">(opcional)</span>
              </label>
              <span className="text-[11.5px] text-muted tabular-nums">{description.length}/256</span>
            </div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={256}
              rows={3}
              placeholder="do que se trata este Space?"
              className="w-full px-3.5 py-3 bg-[#0f1014] border border-line rounded-[10px] text-[14px] text-strong placeholder:text-muted resize-none focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 transition-colors"
              style={{ height: '76px' }}
            />
          </div>

          <div>
            <label className="text-[13px] font-semibold text-ink tracking-wide">Imagem de capa</label>
            <p className="text-[11px] text-muted mt-0.5 mb-2">Wallpaper do Space. Arraste no preview para encaixar. Qualquer tamanho · JPG, PNG, WebP ou GIF.</p>
            <div className="relative w-full h-[88px] rounded-[10px] overflow-hidden border border-line bg-[#0f1014]">
              {cover ? (
                <img src={cover} alt="" className="w-full h-full object-cover" style={coverImageStyle(coverFit)} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">Sem imagem</div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2.5">
              <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[10px] text-[12px] font-medium bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] cursor-pointer">
                <ImagePlus size={13} />
                {cover ? 'Trocar' : 'Escolher'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    try {
                      setCover(await readFileAsDataUrl(file))
                    } catch (err) {
                      setCover(null)
                      console.warn(err)
                    }
                  }}
                />
              </label>
              {cover && (
                <button type="button" onClick={() => setCover(null)} className="text-[11px] text-muted hover:text-danger">
                  Remover
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5 min-w-0">
          <div>
            <label className="text-[13px] font-semibold text-ink tracking-wide">Tema</label>
            <div className="mt-2.5">
              <ColorIdentityPicker
                heading={null}
                value={color}
                onChange={setColor}
                open={colorOpen}
                onOpenChange={setColorOpen}
              />
            </div>
          </div>

          <div>
            <label className="text-[13px] font-semibold text-ink tracking-wide">Ícone</label>
            <div className="flex items-center gap-3 mt-2.5">
              <div
                className="w-[68px] h-[68px] rounded-[14px] flex items-center justify-center shrink-0 shadow-md"
                style={identitySurfaceStyle(theme.css)}
              >
                <SpaceIcon value={iconValue} size={28} />
              </div>
              <button
                ref={iconButtonRef}
                type="button"
                onClick={onOpenIconPicker}
                className="
                  h-[50px] px-4 rounded-[10px]
                  bg-[#0f1014] border border-line
                  text-ink hover:text-strong hover:bg-surface1
                  text-[13px] font-medium transition-colors
                  inline-flex items-center gap-2
                "
              >
                <RefreshCw size={13} strokeWidth={2} />
                Trocar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// PreviewCardWide — full-width preview shown on top of Step 1. Avatar on the
// left, name + subtitle on the right, gradient background tied to the theme.
// --------------------------------------------------------------------------
// ----------------------------------------------------------------------
// PreviewCardWide — full-width preview with layered wave graphics.
// Uses inline SVG paths for the wave shapes so they scale crisply and
// follow the theme color family. Mirrors the "abstract waves" feel in
// the v1 reference.
// ----------------------------------------------------------------------
function PreviewCardWide({ name, subtitle, iconValue, theme, cover, coverFit, onCoverFitChange }) {
  const base = theme.css
  return (
    <div className="relative overflow-hidden h-[150px] flex items-end px-5 rounded-[12px]">
      {cover ? (
        <SpaceCoverLayer
          src={cover}
          fit={coverFit}
          interactive
          showControls={false}
          onFitChange={onCoverFitChange}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: bannerGradient(base) }}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: bannerOverlay(base, !!cover) }}
      />
      {/* Layered waves — three SVG paths at different opacities */}
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 800 150"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="waveA" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="waveB" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.30" />
          </linearGradient>
        </defs>
        {/* Back wave — soft white curve */}
        <path
          d="M 0 90 C 120 60, 260 110, 400 80 S 660 40, 800 90 L 800 150 L 0 150 Z"
          fill="url(#waveA)"
        />
        {/* Middle wave — slight darker curve */}
        <path
          d="M 0 110 C 160 80, 300 130, 460 100 S 720 70, 800 110 L 800 150 L 0 150 Z"
          fill="rgba(255,255,255,0.10)"
        />
        {/* Front wave — darker for legibility at the bottom */}
        <path
          d="M 0 125 C 200 100, 380 145, 540 120 S 760 95, 800 130 L 800 150 L 0 150 Z"
          fill="url(#waveB)"
        />
      </svg>

      {cover && (
        <>
          <SpaceCoverFitControls
            fit={coverFit}
            onFitChange={onCoverFitChange}
            className="absolute top-2.5 right-2.5 z-20"
          />
          <p className="absolute left-3 top-3 z-20 text-[10.5px] text-white/75 pointer-events-none drop-shadow">
            Arraste para encaixar · scroll para zoom
          </p>
        </>
      )}

      {/* Content row — avatar + name, near the bottom */}
      <div className="relative pointer-events-none flex items-center gap-3.5 pb-4">
        <div
          className="w-[68px] h-[68px] rounded-full flex items-center justify-center shrink-0 ring-2 ring-white/35 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.3)]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.18) 100%)',
            color: '#ffffff',
          }}
        >
          <SpaceIcon value={iconValue} size={30} className="text-strong" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-bold text-strong tracking-tight truncate">
            {name}
          </p>
          <p className="text-[13px] text-strong/80 truncate">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  )
}

// Icon picker lives in features/spaces/components/SpaceIconPicker.jsx




// --------------------------------------------------------------------------
// Footer — back/next/close.
// --------------------------------------------------------------------------
function Footer({
  step,
  setStep,
  creating,
  canNext1,
  onCommit,
  onClose,
  reviewingFrom = false,
  onReturnToReview,
}) {
  const isLast = step === 3
  const isFirst = step === 1
  // When the user came from review, the "Voltar" button on edit steps
  // returns to the review screen instead of stepping backward.
  const goBack = () => {
    if (reviewingFrom && onReturnToReview) onReturnToReview()
    else setStep(s => Math.max(1, s - 1))
  }
  const goNext = () => {
    if (reviewingFrom && onReturnToReview) onReturnToReview()
    else setStep(s => Math.min(3, s + 1))
  }

  return (
    <div className="px-5 sm:px-8 py-4 border-t border-line flex items-center justify-between gap-3 shrink-0 bg-canvas">
      {!isFirst ? (
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input text-[12.5px] font-medium text-ink hover:text-strong hover:bg-surface2 transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          {reviewingFrom ? 'Voltar à revisão' : 'Voltar'}
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2.5 rounded-input bg-surface1 border border-line text-[12.5px] font-medium text-ink hover:text-strong hover:bg-surface2 transition-colors"
        >
          Cancelar
        </button>
      )}
      {!isLast ? (
        <button
          type="button"
          onClick={goNext}
          disabled={!canNext1}
          className="inline-flex items-center justify-center gap-2 w-[280px] h-[50px] rounded-[12px] bg-gradient-to-r from-accent to-accent text-on-accent text-[14px] font-semibold hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-[0_8px_24px_-8px_var(--space-accent-glow-24),0_0_0_1px_rgba(255,255,255,0.10)_inset]"
        >
          {reviewingFrom ? 'Voltar à revisão' : 'Continuar'}
          {reviewingFrom
            ? <ArrowLeft size={15} strokeWidth={2.25} />
            : <ArrowRight size={15} strokeWidth={2.25} />}
        </button>
      ) : (
        <button
          type="button"
          onClick={onCommit}
          disabled={creating}
          aria-busy={creating || undefined}
          aria-live="polite"
          className="inline-flex items-center justify-center gap-2 w-[280px] h-[50px] rounded-[12px] bg-gradient-to-r from-accent to-accent text-on-accent text-[14px] font-semibold hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] shadow-[0_8px_24px_-8px_var(--space-accent-glow-24),0_0_0_1px_rgba(255,255,255,0.10)_inset]"
        >
          {creating ? (
            <>
              <svg
                className="animate-spin"
                width={15}
                height={15}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              Criando Space…
            </>
          ) : (
            <>
              Criar Space
              <ArrowRight size={15} strokeWidth={2.25} />
            </>
          )}
        </button>
      )}
    </div>
  )
}
