/**
 * ProfilePopover — profile card (banner fade, solid badges, cleaner hierarchy).
 */
import { useEffect, useMemo, useState } from 'react'
import {
  X, Copy, Check, UserPlus, Crown, Gamepad2, MessageCircle,
  BookOpen, Music, Radio, Send, ExternalLink, MoreHorizontal,
  Calendar, Users, Moon, Mic, Quote,
} from 'lucide-react'
import { SpaceCoverLayer } from '../../spaces/components/SpaceCoverLayer'
import { PersonAvatar } from './PersonAvatar'
import { UserTagChips } from './UserTagChips'
import { TagAssignPanel } from './TagAssignPanel'
import { RoleAssignPanel } from './RoleAssignPanel'
import { PURPOSE_BY_KEY } from '../../rooms'
import { ModalShell } from '../../../shared/motion/ModalShell.jsx'
import { flashToast } from '../../../shared/utils/toast'
import { monthLabel } from '../../account/model/profile'
import { resolveCardTheme } from '../../account/model/profileCardThemes'
import { CardThemeFx } from '../../account/components/CardThemeFx'
import { subscribeUserTags } from '../model/userTagsStore'
import {
  memberPresenceKind,
  presenceLabel,
  PRESENCE_DOT,
} from '../model/presenceKind'

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
  canAssignRoles = false,
  canKick = false,
  selfPerms = null,
  currentUserId = null,
  currentUserProfile = null,
  onClose = PLACEHOLDER,
  onInvite = PLACEHOLDER,
  onOpenAccount = null,
  onKick = null,
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const [copied, setCopied] = useState(false)
  const [liveTags, setLiveTags] = useState(() => member?.tags || [])
  useEffect(() => { if (!open) setCopied(false) }, [open])

  useEffect(() => {
    if (!open || !member?.userId) {
      setLiveTags(member?.tags || [])
      return undefined
    }
    return subscribeUserTags(member.userId, setLiveTags)
  }, [open, member?.userId, member?.tags])

  const derived = useMemo(() => {
    if (!member) return null
    const inRoom = !!member.location?.roomId
    const purposeOfRoom = inRoom && space?.rooms
      ? space.rooms.find((r) => r.id === member.location.roomId)
      : null
    const purpose = purposeOfRoom
      ? PURPOSE_BY_KEY[purposeOfRoom.purpose || (purposeOfRoom.type === 'voice' ? 'voice' : 'conversation')]
      : null
    const presence = memberPresenceKind(member)
    return { inRoom, purposeOfRoom, purpose, presence }
  }, [member, space])

  if (!open || !member) return null

  const name = member.displayName || 'convidado'
  const hasCover = typeof member.cover === 'string' && (member.cover.startsWith('http') || member.cover.startsWith('data:image/'))
  const { inRoom, purposeOfRoom, purpose, presence } = derived
  const PurposeIcon = purpose ? PURPOSE_ICON[purpose.key] || Radio : Gamepad2
  const subjectIsCreator = space?.createdBy === member.userId
  const theme = resolveCardTheme(member.cardThemeId, space?.color || null)
  const accent = theme.accent
  const bodyBg = theme.bodyBg || '#0e1016'
  const isSelf = currentUserId && member.userId === currentUserId
  const presenceDot = presence === 'in_room'
    ? (purpose?.color || accent)
    : (PRESENCE_DOT[presence] || PRESENCE_DOT.offline)
  const presenceTitle = presenceLabel(presence === 'in_room' ? 'online' : presence)
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
        className="relative w-full max-w-[380px] flex flex-col rounded-[28px] overflow-hidden shadow-2xl vc-card-shell"
        style={{
          maxHeight: 'min(720px, calc(100vh - 48px))',
          background: bodyBg,
          border: `1.5px solid ${theme.popoverBorder}`,
          boxShadow: `0 24px 64px -16px ${theme.popoverGlow}, 0 0 48px -8px ${theme.popoverGlow}, 0 0 0 1px ${theme.popoverBorder}`,
        }}
      >
        {/* FX sits on shell bodyBg; header/body stay transparent so motion shows through. */}
        <CardThemeFx themeId={theme.id || member.cardThemeId} variant="card" />

        {/* Cover dissolves via mask onto shell + FX (no opaque fill that would bury motion). */}
        <div className="relative shrink-0 z-[2]">
          <div className="relative" style={{ minHeight: 118 }}>
            <div
              className="absolute inset-x-0 top-0 h-[150px] overflow-hidden"
              style={{
                WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 32%, transparent 100%)',
                maskImage: 'linear-gradient(to bottom, #000 0%, #000 32%, transparent 100%)',
              }}
            >
              <div className="absolute inset-0" style={{ background: bannerBg || bodyBg }}>
                {hasCover && <SpaceCoverLayer src={member.cover} fit={member.coverFit} />}
                {!hasCover && <CosmicDecor accent={accent} />}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: theme.coverTint || `linear-gradient(135deg, ${hexAlpha(accent, 0.3)}, transparent 58%)` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              title="Fechar"
              className="absolute top-3 right-3 z-20 w-8 h-8 rounded-xl bg-black/45 hover:bg-black/65 backdrop-blur flex items-center justify-center text-strong/85 hover:text-strong transition-colors"
            >
              <X size={14} strokeWidth={2} />
            </button>

            <div className="relative z-10 px-5 pt-[66px]">
              <div className="relative inline-block">
                <div
                  className="rounded-full p-[3px] vc-card-avatar-ring"
                  style={{
                    background: `linear-gradient(145deg, ${accent}, ${hexAlpha(accent, 0.35)})`,
                    boxShadow: `0 0 0 4px ${bodyBg}, 0 10px 28px ${hexAlpha(accent, 0.55)}`,
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
                  className="absolute bottom-1 left-1 w-3.5 h-3.5 rounded-full border-[3px]"
                  style={{ borderColor: bodyBg, backgroundColor: presenceDot }}
                  title={presenceTitle}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-[2] flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-3 pb-5">
          {/* Identity */}
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h2 id="profile-name" className="text-[20px] font-bold text-strong tracking-tight truncate">
              {name}
            </h2>
            {subjectIsCreator && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wider shrink-0"
                style={{ color: '#1a1408', background: '#e8b84a', boxShadow: '0 1px 0 rgba(0,0,0,0.25)' }}
                title="Criador do Space"
              >
                <Crown size={10} strokeWidth={2.5} />
                Criador
              </span>
            )}
            <UserTagChips tags={liveTags} />
          </div>

          {member.handle ? (
            <p className="text-[13px] text-muted mt-0.5">@{member.handle}</p>
          ) : null}

          {member.bio ? (
            <p className="text-[13.5px] text-strong/85 mt-2 leading-snug">{member.bio}</p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Calendar size={12} strokeWidth={1.8} className="opacity-70" />
              {since ? `Desde ${since}` : 'Membro deste Space'}
            </span>
            {space && (
              <span className="inline-flex items-center gap-1.5">
                <Users size={12} strokeWidth={1.8} className="opacity-70" />
                1 Space em comum
              </span>
            )}
          </div>

          {/* Presence */}
          <div className="mt-3.5 flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-black/25 border border-white/[0.06]">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-strong">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: presenceDot }}
                />
                {presence === 'in_room' ? 'Online' : presenceLabel(presence)}
              </p>
              {inRoom && purposeOfRoom ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted truncate">
                  <PurposeIcon size={12} strokeWidth={1.8} style={{ color: purpose?.color || accent }} />
                  <span>
                    em{' '}
                    <span className="font-semibold" style={{ color: accent }}>
                      {purposeOfRoom.name}
                    </span>
                  </span>
                </p>
              ) : presence === 'away' ? (
                <p className="mt-0.5 text-[12px] text-muted">No app, fora deste Space</p>
              ) : presence === 'offline' ? (
                <p className="mt-0.5 text-[12px] text-muted">Fora do app</p>
              ) : (
                <p className="mt-0.5 text-[12px] text-muted">Por aqui no Space</p>
              )}
            </div>
            {inRoom && purposeOfRoom?.type === 'voice' ? <Waveform accent={accent} /> : null}
          </div>

          {member.statusText ? (
            <p className="mt-2.5 flex items-start gap-2 text-[13px] text-muted italic leading-snug">
              <Quote size={13} className="shrink-0 mt-0.5 opacity-60" />
              <span>“ {member.statusText} ”</span>
            </p>
          ) : null}

          {/* Actions */}
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

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onInvite(member)}
              className="flex-1 h-9 px-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] font-medium text-strong inline-flex items-center justify-center gap-1.5 transition-colors"
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
              className="flex-1 h-9 px-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-[12px] font-medium text-strong inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink size={13} strokeWidth={1.9} />
              Ver perfil
            </button>
            <button
              type="button"
              onClick={() => flashToast('mais opções em breve')}
              className="w-9 h-9 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-muted hover:text-strong inline-flex items-center justify-center transition-colors"
              aria-label="Mais"
              title="Mais"
            >
              <MoreHorizontal size={15} />
            </button>
          </div>

          {/* Single compact meta row — spaces + status badges (not duplicating tags) */}
          <div className="mt-5 pt-4 border-t border-white/[0.06] space-y-3.5">
            {space && (
              <div className="flex items-center gap-3">
                <SpaceChip name={space.name} accent={accent} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
                    Space em comum
                  </p>
                  <p className="text-[13px] font-medium text-strong truncate mt-0.5">{space.name}</p>
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80 mb-2">
                Distintivos
              </p>
              <div className="flex flex-wrap gap-1.5">
                {subjectIsCreator && (
                  <SolidBadge label="Criador" color="#e8b84a" icon={Crown} />
                )}
                <SolidBadge label="Lunar" color={accent} icon={Moon} />
                {(inRoom && purposeOfRoom?.type === 'voice') && (
                  <SolidBadge label="Em voz" color={accent} icon={Mic} />
                )}
              </div>
            </div>
          </div>

          <TagAssignPanel
            compact
            targetUserId={member.userId}
            currentUserId={currentUserId}
            selfProfile={currentUserProfile}
          />

          <RoleAssignPanel
            space={space}
            member={member}
            currentUserId={currentUserId}
            canAssign={canAssignRoles}
            actorPerms={selfPerms}
          />

          {canKick && !isSelf && !subjectIsCreator && (
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(`Expulsar ${name} deste Space?`)) return
                await onKick?.(member.userId)
              }}
              className="mt-3 w-full h-9 rounded-xl text-[12.5px] font-semibold text-danger bg-danger/10 border border-danger/25 hover:bg-danger/15"
            >
              Expulsar do Space
            </button>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 text-[11.5px] text-muted hover:text-strong transition-colors"
            >
              {copied ? <Check size={12} className="text-positive" /> : <Copy size={12} />}
              {copied ? 'ID copiado' : 'Copiar ID'}
            </button>
            {isCreator && !subjectIsCreator && (
              <p className="text-[10.5px] text-warning/80">Você é o criador</p>
            )}
          </div>
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
    <span
      className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
      style={{ background: accent, color: contrastOn(accent), boxShadow: '0 2px 0 rgba(0,0,0,0.25)' }}
      title={name}
    >
      <Gamepad2 size={18} strokeWidth={1.9} />
    </span>
  )
}

function SolidBadge({ label, color, icon: Icon }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[10.5px] font-bold uppercase tracking-wide"
      style={{
        background: color,
        color: contrastOn(color),
        boxShadow: '0 1px 0 rgba(0,0,0,0.25)',
      }}
    >
      <Icon size={12} strokeWidth={2.2} />
      {label}
    </span>
  )
}

function contrastOn(hex) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return '#ffffff'
  const n = parseInt(hex.slice(1), 16)
  if (!Number.isFinite(n)) return '#ffffff'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62 ? '#0b0b0f' : '#ffffff'
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
