import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Monitor, Shield, Sparkles, Trash2, Users } from 'lucide-react'
import { SpaceCoverFitControls, SpaceCoverLayer } from '../../spaces/components/SpaceCoverLayer'
import { DEFAULT_COVER_FIT, readFileAsDataUrl } from '../../spaces'
import { PersonAvatar } from '../../people'
import {
  PROFILE_CARD_THEMES,
  resolveCardTheme,
} from '../model/profileCardThemes'
import { CardThemeFx } from '../components/CardThemeFx'

export function ProfileAppearance({ profile, saving, onSave, onCover }) {
  const fileRef = useRef(null)
  const fitTimer = useRef(null)
  const hues = [340, 12, 32, 48, 168, 210, 262, 300]
  const [cover, setCover] = useState(profile.cover || '')
  const [fit, setFit] = useState(profile.coverFit)
  const [themeId, setThemeId] = useState(profile.cardThemeId || 'default')
  const [bannerHue, setBannerHue] = useState(profile.bannerHue || 340)
  const [error, setError] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setCover(profile.cover || '')
    setFit(profile.coverFit)
    setThemeId(profile.cardThemeId || 'default')
    setBannerHue(profile.bannerHue || 340)
    setDirty(false)
  }, [profile.cover, profile.coverFit, profile.cardThemeId, profile.bannerHue])

  useEffect(() => () => clearTimeout(fitTimer.current), [])

  const hasCover = typeof cover === 'string' && (cover.startsWith('http') || cover.startsWith('data:image/'))
  const theme = resolveCardTheme(themeId)

  const commitFit = (next) => {
    setFit(next)
    setDirty(true)
    if (!hasCover) return
    clearTimeout(fitTimer.current)
    fitTimer.current = setTimeout(() => {
      if (String(cover).startsWith('http')) {
        onSave?.({ coverFit: next }).then(() => setDirty(false)).catch(() => {})
      } else {
        onCover?.(cover, next)
      }
    }, 400)
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCover(dataUrl)
      setFit(DEFAULT_COVER_FIT)
      setDirty(true)
      await onCover?.(dataUrl, DEFAULT_COVER_FIT)
      setDirty(false)
    } catch (err) {
      setError(err.message || 'Não foi possível carregar a imagem.')
    }
  }

  const removeCover = async () => {
    setCover('')
    setFit(DEFAULT_COVER_FIT)
    setDirty(true)
    await onCover?.(null, DEFAULT_COVER_FIT)
    setDirty(false)
  }

  const selectTheme = (id) => {
    setThemeId(id)
    setDirty(true)
  }

  const selectHue = (hue) => {
    setBannerHue(hue)
    setDirty(true)
  }

  const saveAppearance = async () => {
    setError('')
    try {
      const next = await onSave?.({
        cardThemeId: themeId,
        bannerHue,
        coverFit: hasCover ? fit : profile.coverFit,
      })
      if (!next) {
        setError('Não foi possível salvar a aparência.')
        return
      }
      setDirty(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1800)
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a aparência.')
    }
  }

  return (
    <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-6 space-y-6 pb-24">
      <Header
        title="Aparência"
        hint="Escolha o tema, a capa e a cor — depois toque em Salvar para aplicar no card."
      />

      <section>
        <p className="text-[12px] font-medium text-ink mb-1.5">Preview</p>
        <p className="text-[12px] text-muted mb-3">Como seu card aparece para outras pessoas.</p>
        <div className="rounded-2xl border border-white/[0.08] bg-[#0b0c10] p-4 space-y-3">
          <CardPreview
            name={profile.displayName}
            handle={profile.handle}
            photoURL={profile.photoURL}
            userId={profile.uid}
            cover={cover}
            coverFit={fit}
            hasCover={hasCover}
            theme={theme}
          />
          <NameplatePreview
            name={profile.displayName}
            photoURL={profile.photoURL}
            userId={profile.uid}
            cover={hasCover ? cover : ''}
            theme={theme}
          />
        </div>
      </section>

      <section>
        <p className="text-[12px] font-medium text-ink mb-1.5">Tema do card</p>
        <p className="text-[12px] text-muted mb-3">
          Temas Premium com animações e efeitos — escolha um e salve.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {PROFILE_CARD_THEMES.map((t) => {
            const active = themeId === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTheme(t.id)}
                disabled={saving}
                className={[
                  'relative overflow-hidden rounded-xl border text-left transition-all',
                  active
                    ? 'ring-2 ring-white/80 border-transparent scale-[1.02]'
                    : 'border-white/[0.08] hover:border-white/20 hover:scale-[1.01]',
                ].join(' ')}
                style={{ boxShadow: active ? `0 0 24px ${t.popoverGlow}` : undefined }}
              >
                <div
                  className="relative h-14 w-full overflow-hidden vc-theme-thumb-bg"
                  style={{ background: t.bannerGradient }}
                >
                  <CardThemeFx themeId={t.id} variant="thumb" />
                </div>
                <div className="px-2.5 py-2 bg-[#12141a]">
                  <p className="text-[12px] font-semibold text-strong truncate flex items-center gap-1">
                    {t.label}
                    {t.premium && (
                      <Sparkles size={10} className="text-warning shrink-0" strokeWidth={2.2} />
                    )}
                  </p>
                  {t.premium && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-warning/90">
                      Premium
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <p className="text-[12px] font-medium text-ink mb-1.5">Imagem de capa</p>
        <p className="text-[12px] text-muted mb-3">
          Aparece no topo do card e como fundo suave na lista. JPG, PNG, WebP ou GIF.
        </p>
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0d0e12] h-[168px]">
          {hasCover ? (
            <SpaceCoverLayer
              src={cover}
              fit={fit}
              interactive
              showControls={false}
              onFitChange={commitFit}
            />
          ) : (
            <div className="w-full h-full" style={{ background: theme.bannerGradient }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10 pointer-events-none" />
          {hasCover && (
            <SpaceCoverFitControls
              fit={fit}
              onFitChange={commitFit}
              className="absolute top-2.5 right-2.5 z-20"
            />
          )}
          <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-black/45 hover:bg-black/60 text-white border border-white/15 backdrop-blur-sm"
            >
              <ImagePlus size={13} />
              {hasCover ? 'Trocar' : 'Escolher imagem'}
            </button>
            {hasCover && (
              <button
                type="button"
                onClick={removeCover}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-medium text-white/80 hover:text-danger bg-black/35 hover:bg-danger/20 border border-white/10 backdrop-blur-sm"
              >
                <Trash2 size={13} />
                Remover
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          className="hidden"
        />
      </section>

      <section>
        <p className="text-[12px] font-medium text-ink mb-1.5">Cor de identidade</p>
        <p className="text-[12px] text-muted mb-3">Usada no tema Clássico quando não há capa, e no brilho da foto.</p>
        <div className="flex flex-wrap gap-2">
          {hues.map((hue) => (
            <button
              key={hue}
              type="button"
              onClick={() => selectHue(hue)}
              className={[
                'w-10 h-10 rounded-full transition-transform',
                bannerHue === hue ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0b0c10]' : 'hover:scale-105',
              ].join(' ')}
              style={{ background: `hsl(${hue} 72% 52%)` }}
              aria-label={`Matiz ${hue}`}
            />
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-5 sm:-mx-8 px-5 sm:px-8 py-3 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/80% to-transparent flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={saveAppearance}
          disabled={saving || !dirty}
          className={[
            'h-11 px-5 rounded-xl text-[13px] font-semibold inline-flex items-center gap-2 transition-all',
            dirty && !saving
              ? 'text-strong hover:opacity-90 active:scale-[0.99]'
              : 'bg-white/[0.06] text-muted cursor-not-allowed',
          ].join(' ')}
          style={dirty && !saving ? {
            background: `linear-gradient(90deg, ${theme.accent}, color-mix(in srgb, ${theme.accent} 70%, #fff))`,
            boxShadow: `0 8px 24px -10px ${theme.popoverGlow}`,
          } : undefined}
        >
          {savedFlash ? <Check size={15} strokeWidth={2.4} /> : null}
          {saving ? 'Salvando…' : savedFlash ? 'Salvo!' : 'Salvar aparência'}
        </button>
        {dirty && !saving && (
          <span className="text-[12px] text-muted">Alterações não salvas</span>
        )}
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </div>
    </div>
  )
}

function CardPreview({ name, handle, photoURL, userId, cover, coverFit, hasCover, theme }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden max-w-[280px]"
      style={{
        background: theme.bodyBg || '#0e1016',
        border: `1.5px solid ${theme.popoverBorder}`,
        boxShadow: `0 12px 36px -10px ${theme.popoverGlow}, 0 0 28px -8px ${theme.popoverGlow}`,
      }}
    >
      <CardThemeFx themeId={theme.id} variant="card" className="opacity-80" />
      <div className="relative h-16 overflow-hidden z-[1]" style={{ background: theme.bannerGradient }}>
        {hasCover && <SpaceCoverLayer src={cover} fit={coverFit} />}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{ background: theme.coverTint }}
        />
        <div
          className="absolute inset-0 z-[1]"
          style={{ background: `linear-gradient(to bottom, transparent, ${theme.bodyBg || '#0e1016'})` }}
        />
      </div>
      <div className="relative z-[2] px-3 -mt-5 pb-3">
        <div
          className="inline-block rounded-full p-[2px] vc-card-avatar-ring"
          style={{
            background: `linear-gradient(145deg, ${theme.accent}, transparent)`,
            boxShadow: `0 0 0 3px #0e1016, 0 6px 18px ${theme.popoverGlow}`,
            ['--vc-avatar-glow']: theme.popoverGlow,
          }}
        >
          <PersonAvatar src={photoURL} name={name} userId={userId} size={40} className="relative z-[1]" />
        </div>
        <p className="text-[13px] font-bold text-strong mt-1.5 truncate">{name || 'Você'}</p>
        {handle ? <p className="text-[11px] text-muted truncate">@{handle}</p> : null}
      </div>
    </div>
  )
}

function NameplatePreview({ name, photoURL, userId, cover, theme }) {
  return (
    <div
      className="relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl overflow-hidden max-w-[280px]"
      style={{
        background: theme.bodyBg || undefined,
        border: `1.5px solid ${theme.popoverBorder}`,
        boxShadow: `0 0 18px -6px ${theme.popoverGlow}`,
      }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      ) : null}
      <div className="absolute inset-0" style={{ background: theme.nameplate }} />
      <CardThemeFx themeId={theme.id} variant="nameplate" className="opacity-75" />
      <div className="relative z-[1] flex items-center gap-2.5 min-w-0 w-full">
        <span
          className="rounded-full p-[2px] shrink-0"
          style={{
            background: `linear-gradient(135deg, ${theme.accent}, transparent)`,
            boxShadow: `0 0 12px ${theme.popoverGlow}`,
          }}
        >
          <PersonAvatar src={photoURL} name={name} userId={userId} size={28} className="ring-2 ring-[#0B0E11]" />
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-strong truncate">{name || 'Você'} <span className="text-muted font-normal">(você)</span></p>
          <p className="text-[10px] text-muted">Na lista de Pessoas</p>
        </div>
      </div>
    </div>
  )
}

export function ProfileConnections({ profile }) {
  return (
    <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-6">
      <Header title="Conexões" hint="Pessoas que você segue e que te acompanham." />
      {profile.connections.length === 0 ? (
        <Empty icon={Users} text="Você ainda não tem conexões. Elas aparecem quando você segue alguém nos Spaces." />
      ) : (
        <ul className="space-y-2">
          {profile.connections.map((c) => (
            <li key={c.id || c} className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[13px] text-strong">
              {c.name || c}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ProfilePrivacy({ profile, onSave }) {
  const p = profile.privacy
  const toggle = (key) => onSave({ privacy: { ...p, [key]: !p[key] } })
  return (
    <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-6 space-y-3">
      <Header title="Privacidade" hint="Controle o que o perfil público mostra." />
      <ToggleRow icon={Shield} title="Mostrar localização" on={p.showLocation} onChange={() => toggle('showLocation')} />
      <ToggleRow icon={Shield} title="Mostrar atividade recente" on={p.showActivity} onChange={() => toggle('showActivity')} />
      <ToggleRow icon={Shield} title="Mostrar Spaces em destaque" on={p.showSpaces} onChange={() => toggle('showSpaces')} />
    </div>
  )
}

export function ProfileSecurity({ profile, onResetPassword, onSignOut, info }) {
  return (
    <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-6 space-y-4">
      <Header title="Segurança" hint="Sua conta Lunar neste aparelho." />
      <div className="rounded-2xl border border-white/[0.06] bg-[#12141a] px-4 py-3">
        <p className="text-[12px] text-muted">E-mail</p>
        <p className="text-[14px] text-strong mt-0.5">{profile.email || 'Sem e-mail nesta sessão'}</p>
      </div>
      {info && <p className="text-[12.5px] text-positive">{info}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onResetPassword}
          disabled={!profile.email}
          className="h-10 px-4 rounded-xl border border-white/[0.08] text-[13px] font-medium text-strong hover:bg-white/[0.05] disabled:opacity-40"
        >
          Enviar e-mail de senha
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="h-10 px-4 rounded-xl bg-danger/15 text-danger text-[13px] font-medium hover:bg-danger/20"
        >
          Sair da conta
        </button>
      </div>
    </div>
  )
}

export function ProfileDevices({ settings = {}, onChange, onOpenSettings }) {
  return (
    <div className="max-w-[640px] mx-auto px-5 sm:px-8 py-6 space-y-4">
      <Header title="Dispositivos" hint="Preferências usadas na próxima chamada." />
      <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-white/[0.06] bg-[#12141a]">
        <span className="text-[13px] text-strong">Iniciar minimizado</span>
        <input
          type="checkbox"
          checked={!!settings.startMinimized}
          onChange={(e) => onChange({ startMinimized: e.target.checked })}
        />
      </label>
      <p className="text-[12.5px] text-muted inline-flex items-center gap-2">
        <Monitor size={14} /> Microfone e GPU ficam em Configurações.
      </p>
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="h-10 px-4 rounded-xl border border-white/[0.08] text-[13px] font-medium text-strong hover:bg-white/[0.05]"
        >
          Abrir configurações
        </button>
      )}
    </div>
  )
}

function Header({ title, hint }) {
  return (
    <div className="mb-5">
      <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>
      <p className="text-[13px] text-muted mt-1">{hint}</p>
    </div>
  )
}

function Empty({ icon: Icon, text }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[#12141a] px-5 py-10 text-center">
      <Icon size={22} className="mx-auto text-muted mb-2" />
      <p className="text-[13px] text-muted">{text}</p>
    </div>
  )
}

function ToggleRow({ icon: Icon, title, on, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-white/[0.06] bg-[#12141a] text-left"
    >
      <span className="inline-flex items-center gap-2 text-[13px] text-strong">
        <Icon size={15} className="text-muted" />
        {title}
      </span>
      <span className={`w-9 h-5 rounded-full relative ${on ? 'bg-accent' : 'bg-white/10'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  )
}
