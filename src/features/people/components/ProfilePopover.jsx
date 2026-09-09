/**
 * ProfilePopover — profile card matching the mockup (banner, avatar ring,
 * status, actions, shared spaces / badges).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  X, Copy, Check, UserPlus,   Crown, Gamepad2, MessageCircle,
  BookOpen, Music, Radio, Send, ExternalLink, MoreHorizontal,
  Calendar, Users, Moon, Mic, Quote,
} from 'lucide-react'
import { SpaceCoverLayer } from '../../spaces/components/SpaceCoverLayer'
import { PersonAvatar } from './PersonAvatar'
import { PURPOSE_BY_KEY } from '../../rooms'
import { ModalShell } from '../../../shared/motion/ModalShell.jsx'
import { flashToast } from '../../../shared/utils/toast'
import { monthLabel } from '../../account/model/profile'
import { resolveCardTheme } from '../../account/model/profileCardThemes'
import { CardThemeFx } from '../../account/components/CardThemeFx'

const PURPOSE_ICON = {
  voice: Radio,
  conversation: MessageCircle,
  study: BookOpen,
  games: Gamepad2,
  music: Music,
}

const PLACEHOLDER = () => {}

export default function ProfilePopover({
  open,
  member,
  space = null,
  isCreator = false,
  currentUserId = null,
  onClose = PLACEHOLDER,
  onInvite = PLACEHOLDER,
  onOpenAccount = null,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const [copied, setCopied] = useState(false)
  useEffect(() => { if (!open) setCopied(false) }, [open])

  const derived = useMemo(() => {
    if (!member) return null
    const inRoom = !!member.location?.roomId
    const purposeOfRoom = inRoom && space?.rooms
      ? space.rooms.find((r) => r.id === member.location.roomId)
      : null
    const purpose = purposeOfRoom
      ? PURPOSE_BY_KEY[purposeOfRoom.purpose || (purposeOfRoom.type === 'voice' ? 'voice' : 'conversation')]
      : null
    return { inRoom, purposeOfRoom, purpose }
  }, [member, space])

  if (!open || !member) return null

  const name = member.displayName || 'convidado'
  const hasCover = typeof member.cover === 'string' && (member.cover.startsWith('http') || member.cover.startsWith('data:image/'))
  const { inRoom, purposeOfRoom, purpose } = derived
  const PurposeIcon = purpose ? PURPOSE_ICON[purpose.key] || Radio : Gamepad2
  const subjectIsCreator = space?.createdBy === member.userId
  const theme = resolveCardTheme(member.cardThemeId, space?.color || null)
  const accent = theme.accent
  const isSelf = currentUserId && member.userId === currentUserId
  const since = member.createdAt ? monthLabel(member.createdAt) : null

  const bannerBg = hasCover
    ? undefined
    : (member.cardThemeId && member.cardThemeId !== 'default'
      ? theme.bannerGradient
      : (Number.isFinite(Number(member.bannerHue))
        ? `linear-gradient(135deg, hsl(${member.bannerHue} 70% 38%), #12080c)`
        : theme.bannerGradient))

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(member.userId || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy="profile-name"
      maxWidth="sm"
      panelClassName="rounded-[28px]"
    >
      <div
        className="relative w-full max-w-[380px] rounded-[28px] overflow-hidden shadow-2xl vc-card-shell"
        style={{
          background: theme.bodyBg || '#0e1016',
          border: `1.5px solid ${theme.popoverBorder}`,
          boxShadow: `0 24px 64px -16px ${theme.popoverGlow}, 0 0 48px -8px ${theme.popoverGlow}, 0 0 0 1px ${theme.popoverBorder}`,
        }}
      >
        <CardThemeFx themeId={theme.id || member.cardThemeId} variant="card" />

        {/* Banner */}
        <div
          className="relative h-[118px] shrink-0 overflow-hidden z-[2]"
          style={{ background: bannerBg }}
        >
          {hasCover && <SpaceCoverLayer src={member.cover} fit={member.coverFit} />}
          {!hasCover && <CosmicDecor accent={accent} />}
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{ background: theme.coverTint || `linear-gradient(135deg, ${hexAlpha(accent, 0.4)}, transparent 60%)` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-transparent z-[2]"
            style={{ background: `linear-gradient(to bottom, transparent 40%, ${theme.bodyBg || '#0e1016'})` }}
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-xl bg-black/45 hover:bg-black/65 backdrop-blur flex items-center justify-center text-strong/85 hover:text-strong transition-colors"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Avatar overlapping banner */}
        <div className="px-5 -mt-[42px] relative z-10 isolate">
          <div className="relative inline-block">
            <div
              className="rounded-full p-[3px] vc-card-avatar-ring"
              style={{
                background: `linear-gradient(145deg, ${accent}, ${hexAlpha(accent, 0.35)})`,
                boxShadow: `0 0 0 4px #0e1016, 0 10px 28px ${hexAlpha(accent, 0.55)}`,
                ['--vc-avatar-glow']: hexAlpha(accent, 0.55),
              }}
            >
              <PersonAvatar
                src={member.photoURL}
                name={name}
                userId={member.userId}
                size={84}
                className="relative z-[1] bg-[#1a1c22]"
              />
            </div>
            <span
              className={
                'absolute bottom-1 left-1 w-3.5 h-3.5 rounded-full border-[3px] border-[#0e1016] ' +
                (member.online ? 'bg-positive' : 'bg-line')
              }
              title={member.online ? 'online' : 'offline'}
            />
            <span
              className="absolute bottom-0.5 right-0.5 w-7 h-7 rounded-full bg-[#0e1016] border border-white/10 flex items-center justify-center"
              title="Conta Lunar"
            >
              <Moon size={12} strokeWidth={2} style={{ color: accent }} />
            </span>
          </div>
        </div>

        {/* Identity */}
        <div className="relative z-[2] px-5 pt-3 pb-5">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h2 id="profile-name" className="text-[20px] font-bold text-strong tracking-tight truncate">
              {name}
            </h2>
            {subjectIsCreator && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 border"
                style={{
                  color: '#e8b84a',
                  borderColor: 'rgba(232, 184, 74, 0.45)',
                  background: 'rgba(232, 184, 74, 0.08)',
                }}
                title="Criador do Space"
              >
                <Crown size={10} strokeWidth={2.5} />
                Criador
              </span>
            )}
          </div>

          {member.handle ? (
            <p className="text-[13px] text-muted mt-0.5">@{member.handle}</p>
          ) : null}

          {member.bio ? (
            <p className="text-[13.5px] text-strong/85 mt-2.5 leading-snug">{member.bio}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={12} strokeWidth={1.8} className="opacity-70" />
              {since ? `Membro desde ${since}` : 'Membro deste Space'}
            </span>
            {space && (
              <span className="inline-flex items-center gap-1.5">
                <Users size={12} strokeWidth={1.8} className="opacity-70" />
                1 Space em comum
              </span>
            )}
          </div>

          {/* Status card */}
          <div className="mt-4 flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-white/[0.03] border border-white/[0.07]">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-strong">
                <span className={'w-2 h-2 rounded-full ' + (member.online ? 'bg-positive' : 'bg-line')} />
                {member.online ? 'Online' : 'Offline'}
              </p>
              {inRoom && purposeOfRoom ? (
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted truncate">
                  <PurposeIcon size={12} strokeWidth={1.8} style={{ color: purpose?.color || accent }} />
                  <span>
                    {purposeOfRoom.type === 'voice' ? 'Jogando ' : ''}
                    <span className="font-semibold" style={{ color: accent }}>
                      em {purposeOfRoom.name}
                    </span>
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-[12px] text-muted">Por aqui no Space</p>
              )}
            </div>
            <Waveform accent={accent} />
          </div>

          {member.statusText ? (
            <p className="mt-3 flex items-start gap-2 text-[13px] text-muted italic leading-snug">
              <Quote size={13} className="shrink-0 mt-0.5 opacity-60" />
              <span>“ {member.statusText} ”</span>
            </p>
          ) : null}

          {/* Primary CTA */}
          <button
            type="button"
            onClick={() => {
              if (isSelf) {
                onOpenAccount?.()
                onClose()
                return
              }
              flashToast('mensagens privadas em breve')
            }}
            className="mt-4 w-full h-11 rounded-full inline-flex items-center justify-center gap-2 text-[14px] font-semibold text-strong transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{
              background: `linear-gradient(90deg, ${accent} 0%, ${mixAccent(accent)} 100%)`,
              boxShadow: `0 8px 24px -8px ${hexAlpha(accent, 0.55)}`,
            }}
          >
            <Send size={15} strokeWidth={2.2} />
            {isSelf ? 'Editar perfil' : 'Enviar mensagem'}
          </button>

          {/* Secondary row */}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onInvite(member)}
              className="flex-1 h-10 px-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] font-medium text-strong inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <UserPlus size={13} strokeWidth={1.9} />
              Convidar
            </button>
            <button
              type="button"
              onClick={() => {
                if (isSelf && onOpenAccount) {
                  onOpenAccount()
                  onClose()
                } else {
                  flashToast('perfil completo em breve')
                }
              }}
              className="flex-1 h-10 px-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] font-medium text-strong inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink size={13} strokeWidth={1.9} />
              Ver perfil
            </button>
            <button
              type="button"
              onClick={() => flashToast('mais opções em breve')}
              className="w-10 h-10 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-muted hover:text-strong inline-flex items-center justify-center transition-colors"
              aria-label="Mais"
              title="Mais"
            >
              <MoreHorizontal size={15} />
            </button>
          </div>

          {/* Spaces + Badges */}
          <div className="mt-5 pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-2.5">
                Spaces em comum
              </p>
              <div className="flex items-start gap-3">
                {space ? (
                  <SpaceChip
                    name={space.name}
                    accent={accent}
                    icon={space.icon}
                  />
                ) : (
                  <p className="text-[11px] text-muted">Nenhum ainda</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-2.5">
                Badges
              </p>
              <div className="flex items-start gap-2.5">
                {subjectIsCreator && (
                  <BadgeChip label="Criador" color="#e8b84a" icon={Crown} />
                )}
                <BadgeChip label="Lunar" color={accent} icon={Moon} />
                {(inRoom && purposeOfRoom?.type === 'voice') && (
                  <BadgeChip label="Voz" color={accent} icon={Mic} />
                )}
              </div>
            </div>
          </div>

          {/* Copy ID footer */}
          <button
            type="button"
            onClick={handleCopy}
            className="mt-4 inline-flex items-center gap-1.5 text-[11.5px] text-muted hover:text-strong transition-colors"
          >
            {copied ? <Check size={12} className="text-positive" /> : <Copy size={12} />}
            {copied ? 'ID copiado' : 'Copiar ID'}
          </button>

          {isCreator && !subjectIsCreator && (
            <p className="mt-2 text-[10.5px] text-warning/80">Você é o criador deste Space</p>
          )}
        </div>
      </div>
    </ModalShell>
  )
}

function CosmicDecor({ accent }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div
        className="absolute -top-8 -right-6 w-40 h-40 rounded-full blur-2xl opacity-50"
        style={{ background: accent }}
      />
      <div className="absolute top-5 left-8 w-10 h-10 rounded-full border border-white/25 opacity-40" />
      <div className="absolute top-4 left-10 w-6 h-6 rounded-full bg-white/10" />
      <span className="absolute top-8 right-16 w-1 h-1 rounded-full bg-white/70" />
      <span className="absolute top-14 right-24 w-1.5 h-1.5 rounded-full bg-white/50" />
      <span className="absolute bottom-10 left-1/3 w-1 h-1 rounded-full bg-white/60" />
      <svg className="absolute bottom-3 left-0 w-full h-10 opacity-30" viewBox="0 0 400 40" fill="none">
        <path d="M0 28 C60 8, 120 36, 180 20 S300 4, 400 24" stroke="white" strokeWidth="1.2" />
        <path d="M0 34 C80 18, 140 38, 220 26 S320 12, 400 30" stroke="white" strokeWidth="0.8" opacity="0.6" />
      </svg>
    </div>
  )
}

function Waveform({ accent }) {
  const bars = [4, 9, 6, 12, 7, 10, 5, 11, 6]
  return (
    <div className="flex items-end gap-[2px] h-7 shrink-0" aria-hidden>
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{ height: h, background: accent, opacity: 0.55 + (i % 3) * 0.15 }}
        />
      ))}
    </div>
  )
}

function SpaceChip({ name, accent }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[52px]">
      <span
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: hexAlpha(accent, 0.18), color: accent }}
      >
        <Gamepad2 size={16} strokeWidth={1.8} />
      </span>
      <span className="text-[9.5px] text-muted text-center leading-tight line-clamp-2 w-full">
        {name}
      </span>
    </div>
  )
}

function BadgeChip({ label, color, icon: Icon }) {
  return (
    <div className="flex flex-col items-center gap-1 w-[44px]">
      <span
        className="w-9 h-9 rounded-full flex items-center justify-center border"
        style={{
          color,
          borderColor: hexAlpha(color, 0.35),
          background: hexAlpha(color, 0.1),
        }}
      >
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className="text-[9px] text-muted text-center leading-tight">{label}</span>
    </div>
  )
}

function hexAlpha(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return `rgba(255, 63, 108, ${alpha})`
  if (hex.startsWith('var')) return hex
  const m = hex.match(/^#([0-9a-fA-F]{6})$/)
  if (!m) return `rgba(255, 63, 108, ${alpha})`
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function mixAccent(hex) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return '#ff5a82'
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + 30)
  const g = Math.min(255, ((n >> 8) & 255) + 10)
  const b = Math.min(255, (n & 255) + 20)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
