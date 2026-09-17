/**
 * SpaceHubModal — join via invite link/code or browse public Spaces.
 * Layout aligned to the Hub mockup (invite card + public discovery grid).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  X, Search, Send, Compass, Users, Link2, Shield, ArrowRight,
} from 'lucide-react'
import { ModalShell } from '../../../shared/motion/ModalShell'
import SpaceAvatar from '../../../components/SpaceAvatar'
import { BrandLoader } from '../../../shared/ui/BrandMark'
import { getSharedSignaling } from '../../../shared/connection/useSignaling'
import { flashToast } from '../../../shared/utils/toast'
import { parseSpaceInvite } from '../model/spaceInvite'
import { resolveSpaceCover } from '../model/spaceCover'
import { SpaceCoverLayer } from './SpaceCoverLayer'
import { bannerGradient, bannerOverlay, hexToRgba, onColorHex, uiAccentHex } from '../model/spaceTokens'

const FILTER_CHIPS = [
  { id: 'featured', label: 'Em destaque' },
  { id: 'games', label: 'Games', keywords: ['game', 'jogo', 'jogos', 'gaming', 'indie'] },
  { id: 'music', label: 'Música', keywords: ['musica', 'música', 'music', 'som', 'beat'] },
  { id: 'study', label: 'Estudo', keywords: ['estudo', 'estudos', 'study', 'aula', 'escola', 'código', 'codigo'] },
  { id: 'tech', label: 'Tecnologia', keywords: ['tech', 'tecnologia', 'dev', 'program', 'código', 'codigo', 'code'] },
  { id: 'art', label: 'Arte', keywords: ['arte', 'art', 'design', 'criativ'] },
  { id: 'community', label: 'Comunidades', keywords: ['comunidade', 'community', 'social', 'hang', 'chat', 'conversa'] },
]

const TAG_CATALOG = FILTER_CHIPS.filter((c) => c.keywords?.length)

function matchesChip(space, chip) {
  if (!chip || chip.id === 'featured') return true
  if (!chip.keywords?.length) return true
  const hay = `${space.name || ''} ${space.description || ''}`.toLowerCase()
  return chip.keywords.some((k) => hay.includes(k))
}

function tagsForSpace(space) {
  const hay = `${space.name || ''} ${space.description || ''}`.toLowerCase()
  const tags = []
  for (const chip of TAG_CATALOG) {
    if (chip.keywords.some((k) => hay.includes(k))) tags.push(chip.label)
    if (tags.length >= 2) break
  }
  return tags
}

function formatMemberCount(n) {
  const count = Number(n) || 0
  if (count >= 1000) {
    const k = count / 1000
    const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10
    return `${String(rounded).replace('.', ',')} mil membros`
  }
  return `${count} ${count === 1 ? 'membro' : 'membros'}`
}

function HubSpaceCard({
  space,
  already,
  busy,
  busyAny,
  isFeatured,
  tags,
  onAction,
}) {
  const identity = space.color || '#ff3f6c'
  const accent = uiAccentHex(identity)
  const cover = resolveSpaceCover(space)
  const onAccent = onColorHex(accent)
  const solidCta = already || isFeatured
  const label = busy ? '…' : already ? 'Abrir' : solidCta ? 'Entrar' : 'Ver Space'

  return (
    <li
      className="
        relative overflow-hidden rounded-2xl
        border transition-[border-color,box-shadow] duration-200
        hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.7)]
      "
      style={{
        borderColor: hexToRgba(accent, 0.28),
        boxShadow: `inset 0 0 0 1px ${hexToRgba(accent, 0.06)}`,
      }}
    >
      {cover ? (
        <SpaceCoverLayer src={cover} fit={space.coverFit} className="opacity-90" />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: bannerGradient(identity) }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: bannerOverlay(identity, !!cover) }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(105deg, rgba(10,11,14,0.55) 0%, rgba(10,11,14,0.72) 48%, rgba(10,11,14,0.88) 100%)`,
        }}
      />

      <div className="relative flex items-center gap-3.5 p-3.5 min-h-[108px]">
        <SpaceAvatar
          space={space}
          size={56}
          rounded="xl"
          className="shadow-[0_10px_24px_-8px_rgba(0,0,0,0.55)] ring-2 ring-white/20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-white truncate max-w-full drop-shadow-sm">
              {space.name}
            </p>
            {isFeatured && (
              <span
                className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide uppercase"
                style={{
                  background: hexToRgba(accent, 0.22),
                  color: accent,
                }}
              >
                Em destaque
              </span>
            )}
          </div>
          <p className="text-[12px] text-white/70 line-clamp-2 mt-1 leading-snug">
            {space.description || 'Sem descrição'}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-white/65">
            <Users size={12} strokeWidth={1.75} className="opacity-90" />
            {formatMemberCount(space.memberCount)}
          </p>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md text-[10.5px] text-white/75 bg-black/25 border border-white/10 backdrop-blur-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={busyAny}
          onClick={onAction}
          className={
            'shrink-0 self-center px-3.5 py-2 rounded-xl text-[12.5px] font-semibold ' +
            'transition-[transform,opacity,filter] ' +
            'hover:scale-[1.02] active:scale-[0.97] ' +
            (busy ? ' opacity-60' : '')
          }
          style={
            solidCta || already
              ? {
                  background: accent,
                  color: onAccent,
                  boxShadow: `0 8px 20px -6px ${hexToRgba(accent, 0.55)}`,
                }
              : {
                  background: 'transparent',
                  color: '#fff',
                  border: `1px solid ${hexToRgba(accent, 0.55)}`,
                }
          }
        >
          {label}
        </button>
      </div>
    </li>
  )
}

export default function SpaceHubModal({
  open,
  onClose,
  memberSpaceIds = [],
  onJoined,
}) {
  const [inviteInput, setInviteInput] = useState('')
  const [inviteError, setInviteError] = useState(null)
  const [joiningInvite, setJoiningInvite] = useState(false)
  const [queryText, setQueryText] = useState('')
  const [chipId, setChipId] = useState('featured')
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [visibleCount, setVisibleCount] = useState(6)

  const memberSet = useMemo(() => new Set(memberSpaceIds), [memberSpaceIds])

  const loadPublic = useCallback(async (search = '') => {
    const sig = getSharedSignaling()
    if (!sig?.listPublicSpaces) return
    setLoading(true)
    setListError(null)
    try {
      const list = await sig.listPublicSpaces({ query: search, limit: 48 })
      setSpaces(list || [])
    } catch (err) {
      setListError(err?.message || 'Não foi possível carregar Spaces públicos.')
      setSpaces([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setInviteInput('')
    setInviteError(null)
    setJoiningInvite(false)
    setQueryText('')
    setChipId('featured')
    setBusyId(null)
    setVisibleCount(6)
    loadPublic('')
  }, [open, loadPublic])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => loadPublic(queryText), 220)
    return () => clearTimeout(t)
  }, [queryText, open, loadPublic])

  const activeChip = FILTER_CHIPS.find((c) => c.id === chipId) || FILTER_CHIPS[0]
  const filtered = useMemo(() => {
    let list = spaces.filter((s) => matchesChip(s, activeChip))
    if (chipId === 'featured') {
      list = [...list].sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
    }
    return list
  }, [spaces, activeChip, chipId])

  const visible = filtered.slice(0, visibleCount)
  const featuredId = filtered[0]?.id
  const canShowMore = filtered.length > visibleCount

  const finishJoin = async (spaceId, { alreadyMember } = {}) => {
    await onJoined?.(spaceId, { alreadyMember: !!alreadyMember })
    onClose?.()
  }

  const handleInviteJoin = async (e) => {
    e?.preventDefault?.()
    const parsed = parseSpaceInvite(inviteInput)
    if (!parsed?.spaceId) {
      setInviteError('Cole um link válido (?space=…) ou o código do Space.')
      return
    }
    setInviteError(null)
    setJoiningInvite(true)
    try {
      const already = memberSet.has(parsed.spaceId)
      // selectSpace / onJoined always runs joinSpace — don't double-call here.
      await finishJoin(parsed.spaceId, { alreadyMember: already })
    } catch (err) {
      setInviteError(err?.message || 'Não foi possível entrar neste Space.')
    } finally {
      setJoiningInvite(false)
    }
  }

  const handleCardAction = async (space) => {
    if (!space?.id || busyId) return
    setBusyId(space.id)
    try {
      const already = memberSet.has(space.id) || space.joined
      await finishJoin(space.id, { alreadyMember: already })
    } catch (err) {
      flashToast(err?.message || 'Falha ao entrar no Space')
    } finally {
      setBusyId(null)
    }
  }

  if (!open) return null

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy="space-hub-title"
      maxWidth="2xl"
      panelClassName="!max-w-[920px] rounded-[22px]"
      variant="coral"
    >
      <div
        className="
          rounded-[22px] overflow-hidden flex flex-col
          max-h-[min(90vh,780px)]
          bg-[#0b0c10] border border-[#ff3f6c]/25
          shadow-[0_0_0_1px_rgba(255,63,108,0.08),0_24px_64px_rgba(0,0,0,0.55)]
        "
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-5 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="w-8 h-8 rounded-xl bg-[#ff3f6c]/15 text-[#ff3f6c] flex items-center justify-center shrink-0">
                <Users size={16} strokeWidth={2} />
              </span>
              <h2 id="space-hub-title" className="text-[22px] font-bold text-white tracking-tight">
                Hub de Spaces
              </h2>
            </div>
            <p className="text-[13px] text-[#949ba2] leading-snug pl-[42px] -mt-0.5">
              Entre por convite ou encontre uma comunidade para chamar de sua.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-9 h-9 rounded-xl text-[#949ba2] hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition-colors shrink-0"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-7 pb-5 space-y-6">
          {/* Invite card */}
          <section className="rounded-2xl border border-[#ff3f6c]/20 bg-[#12141a]/80 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Link2 size={15} className="text-[#ff3f6c]" strokeWidth={2} />
              <h3 className="text-[14px] font-semibold text-white">Tem um convite?</h3>
            </div>
            <form onSubmit={handleInviteJoin} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1 min-w-0">
                <Link2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#949ba2]" />
                <input
                  value={inviteInput}
                  onChange={(e) => {
                    setInviteInput(e.target.value)
                    if (inviteError) setInviteError(null)
                  }}
                  placeholder="Cole um link ou código de convite"
                  className="
                    w-full pl-10 pr-3.5 py-3 rounded-xl
                    bg-[#161920] border border-white/[0.08] text-[13.5px] text-white
                    placeholder:text-[#6b7280]
                    focus:outline-none focus:border-[#ff3f6c]/45
                    transition-colors
                  "
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                disabled={joiningInvite || !inviteInput.trim()}
                className="
                  px-4 py-3 rounded-xl font-semibold text-[13px] whitespace-nowrap
                  inline-flex items-center justify-center gap-2
                  bg-[#ff3f6c] text-white hover:brightness-110
                  disabled:opacity-40 disabled:pointer-events-none
                  transition-[transform,filter] duration-200
                  hover:scale-[1.01] active:scale-[0.98]
                  shadow-[0_8px_24px_rgba(255,63,108,0.28)]
                "
              >
                <Send size={14} strokeWidth={2.2} />
                {joiningInvite ? 'Entrando…' : 'Entrar no Space'}
              </button>
            </form>
            {inviteError ? (
              <p className="mt-2.5 text-[12px] text-[#ff6b7a]" role="alert">{inviteError}</p>
            ) : (
              <p className="mt-2.5 text-[11.5px] text-[#6b7280]">
                Aceita links voice.app/invite/…, códigos e links ?space=.
              </p>
            )}
          </section>

          {/* Public discovery */}
          <section className="space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <Compass size={15} className="text-[#ff3f6c]" strokeWidth={2} />
                <h3 className="text-[14px] font-semibold text-white">Spaces públicos</h3>
              </div>
              <div className="relative flex-1 min-w-0 sm:max-w-md sm:ml-auto">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b7280]" />
                <input
                  value={queryText}
                  onChange={(e) => {
                    setQueryText(e.target.value)
                    setVisibleCount(6)
                  }}
                  placeholder="Buscar por nome, assunto ou comunidade..."
                  className="
                    w-full pl-9 pr-3 py-2.5 rounded-xl
                    bg-[#161920] border border-white/[0.08] text-[12.5px] text-white
                    placeholder:text-[#6b7280]
                    focus:outline-none focus:border-[#ff3f6c]/45
                  "
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTER_CHIPS.map((chip) => {
                const active = chip.id === chipId
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setChipId(chip.id)
                      setVisibleCount(6)
                    }}
                    className={
                      'px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-colors ' +
                      (active
                        ? 'bg-[#ff3f6c] text-white shadow-[0_4px_14px_rgba(255,63,108,0.35)]'
                        : 'bg-[#161920] text-[#c5cad3] border border-white/[0.08] hover:border-white/20 hover:text-white')
                    }
                  >
                    {chip.label}
                  </button>
                )
              })}
            </div>

            {listError && (
              <p className="text-[12px] text-[#ff6b7a]">{listError}</p>
            )}

            {loading && visible.length === 0 ? (
              <div className="py-12">
                <BrandLoader size={48} label="Carregando Spaces…" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center space-y-1 rounded-2xl border border-dashed border-white/[0.08] bg-[#12141a]/50">
                <p className="text-[14px] font-semibold text-white">Nenhum Space público por aqui</p>
                <p className="text-[12.5px] text-[#949ba2]">
                  Crie um Space público ou peça um convite para entrar.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {visible.map((space) => {
                  const already = memberSet.has(space.id) || space.joined
                  const busy = busyId === space.id
                  const isFeatured = space.id === featuredId && chipId === 'featured'
                  return (
                    <HubSpaceCard
                      key={space.id}
                      space={space}
                      already={already}
                      busy={busy}
                      busyAny={!!busyId}
                      isFeatured={isFeatured}
                      tags={tagsForSpace(space)}
                      onAction={() => handleCardAction(space)}
                    />
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-7 py-4 border-t border-white/[0.06] shrink-0 flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-[11.5px] text-[#6b7280] min-w-0">
            <Shield size={13} strokeWidth={1.75} className="shrink-0 text-[#6b7280]" />
            <span className="truncate">Spaces públicos seguem as diretrizes da comunidade.</span>
          </p>
          {canShowMore ? (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + 6)}
              className="shrink-0 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#ff3f6c] hover:brightness-125 transition-[filter]"
            >
              Ver mais Spaces
              <ArrowRight size={14} strokeWidth={2.2} />
            </button>
          ) : (
            <span className="shrink-0 text-[12px] text-[#4b5563]">&nbsp;</span>
          )}
        </div>
      </div>
    </ModalShell>
  )
}
