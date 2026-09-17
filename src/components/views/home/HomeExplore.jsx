/**
 * HomeExplore — “Encontre seu próximo Space” (2nd mockup).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Code2,
  Gamepad2,
  MessageCircle,
  Music2,
  Palette,
  Search,
  Users,
} from 'lucide-react'
import SpaceAvatar from '../../SpaceAvatar'
import { resolveSpaceCover } from '../../../features/spaces/model/spaceCover'
import { SoftCover } from '../../../shared/media/SoftImage'
import { matchesHomeChip, pickBestConversation, pickVoiceRoomFromMap } from './homeData'
import { cardHover, pageVariants, sectionVariants, staggerContainer, staggerItem } from './homeMotion'

const EXPLORE_CHIPS = [
  { id: 'games', label: 'Games', icon: Gamepad2, keywords: ['game', 'jogo', 'jogos', 'gaming', 'indie'] },
  { id: 'art', label: 'Arte', icon: Palette, keywords: ['arte', 'art', 'design', 'criativ', 'ilustr'] },
  { id: 'tech', label: 'Tecnologia', icon: Code2, keywords: ['tech', 'tecnologia', 'dev', 'program', 'código', 'codigo', 'code'] },
  { id: 'study', label: 'Estudos', icon: BookOpen, keywords: ['estudo', 'estudos', 'study', 'aula', 'escola'] },
  { id: 'music', label: 'Música', icon: Music2, keywords: ['musica', 'música', 'music', 'som', 'beat'] },
  { id: 'chat', label: 'Conversas', icon: MessageCircle, keywords: ['chat', 'conversa', 'social', 'hang'] },
]

const AUTO_MS = 5600

export default function HomeExplore({
  spaces = [],
  publicSpaces = [],
  sampleSpaces = [],
  publicLoading = false,
  roomsBySpace = {},
  memberIds,
  joinBusy,
  onJoinPublic,
  onSelectSpace,
  onOpenContinueRoom,
  onOpenHub,
}) {
  const [query, setQuery] = useState('')
  const [chipId, setChipId] = useState('games')
  const [featuredIdx, setFeaturedIdx] = useState(0)
  const [autoPaused, setAutoPaused] = useState(false)

  // Merge real public spaces with sample fixtures so the home never looks
  // empty. Samples are tagged with `__sample: true` so we can filter them
  // out if needed.
  const allPublicSpaces = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const s of [...publicSpaces, ...sampleSpaces]) {
      if (!s?.id) continue
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push(s)
    }
    return out
  }, [publicSpaces, sampleSpaces])

  const chip = EXPLORE_CHIPS.find((c) => c.id === chipId) || EXPLORE_CHIPS[0]
  // Hero/featured respects the selected chip + search.
  const featuredList = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = allPublicSpaces.filter((s) => matchesHomeChip(s, chip))
    if (q) {
      list = list.filter((s) =>
        `${s.name || ''} ${s.description || ''}`.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
  }, [allPublicSpaces, chip, query])

  // Trending ("em alta") is INDEPENDENT of the chip — it's the global
  // trending list. The chip is just a hero filter, not a discovery gate.
  const trendingList = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...allPublicSpaces]
    if (q) {
      list = list.filter((s) =>
        `${s.name || ''} ${s.description || ''}`.toLowerCase().includes(q),
      )
    }
    return list.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
  }, [allPublicSpaces, query])

  const featured = featuredList.slice(0, 5)
  const trending = trendingList.slice(0, 4)
  const safeFeaturedIdx = featured.length ? featuredIdx % featured.length : 0
  const featuredSpace = featured[safeFeaturedIdx] || null

  useEffect(() => {
    setFeaturedIdx(0)
  }, [chipId, query])

  // Auto-rotate the featured carousel. Pauses on hover or right after
  // a manual navigation so users can read the current Space.
  useEffect(() => {
    if (autoPaused || featured.length < 2) return undefined
    const t = setInterval(() => {
      setFeaturedIdx((i) => (i + 1) % featured.length)
    }, AUTO_MS)
    return () => clearInterval(t)
  }, [autoPaused, featured.length])

  // After a manual nav (touch or click), re-arm the auto-rotation after a
  // short grace period so the rotation resumes even without a mouse-leave.
  const resumeTimerRef = useRef(null)
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    }
  }, [])
  const pauseThenResume = () => {
    setAutoPaused(true)
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => {
      setAutoPaused(false)
      resumeTimerRef.current = null
    }, AUTO_MS)
  }

  const { space: contSpace, room: contRoom } = useMemo(
    () => pickBestConversation(spaces, roomsBySpace),
    [spaces, roomsBySpace],
  )
  const { space: liveSpace, room: voiceRoom } = useMemo(
    () => pickVoiceRoomFromMap(spaces, roomsBySpace, contSpace?.id),
    [spaces, roomsBySpace, contSpace?.id],
  )

  return (
    <motion.div
      key="explorar"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas"
    >
      <div className="max-w-[980px] mx-auto w-full px-4 sm:px-6 lg:px-8 pt-7 sm:pt-9 pb-14 space-y-7">
        <motion.header variants={sectionVariants}>
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight text-strong">
            Encontre seu{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(90deg, #60a5fa, #a78bfa)' }}
            >
              próximo Space
            </span>
          </h1>

          <div className="mt-4 relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar comunidades…"
              className="w-full h-12 pl-11 pr-20 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-[14px] text-strong placeholder:text-muted focus:outline-none focus:border-[#3b82f6]/45"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-muted border border-white/[0.08] bg-black/30">
              Ctrl K
            </kbd>
          </div>

          <div className="mt-3.5 flex gap-1.5 overflow-x-auto no-scrollbar">
            {EXPLORE_CHIPS.map((c) => {
              const Icon = c.icon
              const active = chipId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChipId(c.id)}
                  className={
                    'shrink-0 h-9 px-3.5 rounded-full text-[12.5px] font-semibold inline-flex items-center gap-1.5 border transition-all ' +
                    (active
                      ? 'bg-[#3b82f6] border-[#3b82f6] text-white shadow-[0_8px_24px_-8px_rgba(59,130,246,0.7)]'
                      : 'bg-transparent border-white/[0.1] text-muted hover:text-strong hover:border-white/25')
                  }
                >
                  <Icon size={14} strokeWidth={1.85} />
                  {c.label}
                </button>
              )
            })}
          </div>
        </motion.header>

        {/* Featured */}
        <motion.section variants={sectionVariants}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-2.5">
            Space em destaque
          </p>
          {publicLoading && !featuredSpace ? (
            <div className="h-[200px] rounded-[20px] bg-white/[0.04] border border-white/[0.06] animate-pulse" />
          ) : !featuredSpace ? (
            <div className="rounded-[20px] border border-dashed border-white/[0.1] px-5 py-10 text-center text-[13px] text-muted">
              Nenhum Space público nesta categoria.
              <button type="button" onClick={onOpenHub} className="ml-2 text-[#60a5fa] font-semibold">
                Abrir Hub
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={featuredSpace.id}
                initial={{ opacity: 1, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 1, x: -8 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                onMouseEnter={() => setAutoPaused(true)}
                onMouseLeave={() => setAutoPaused(false)}
                className="relative overflow-hidden rounded-[20px] min-h-[200px] border border-white/[0.08] group"
              >
                <FeaturedCover space={featuredSpace} />
                <div className="relative z-10 p-5 sm:p-7 flex flex-col sm:flex-row sm:items-end gap-4 min-h-[200px]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <SpaceAvatar space={featuredSpace} size={44} rounded="xl" />
                      <h3 className="text-[22px] sm:text-[24px] font-bold text-white truncate">
                        {featuredSpace.name}
                      </h3>
                    </div>
                    <p className="text-[13.5px] text-white/75 line-clamp-2 max-w-xl leading-relaxed">
                      {featuredSpace.description || featuredSpace.slogan || 'Uma comunidade pública no Voice.'}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-white/70">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={13} />
                        {formatMembers(featuredSpace.memberCount)}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={joinBusy === featuredSpace.id}
                      onClick={() => onJoinPublic?.(featuredSpace)}
                      className="mt-4 h-10 px-5 rounded-full text-[13px] font-semibold text-white bg-[#3b82f6] hover:opacity-95 inline-flex items-center gap-2 shadow-[0_12px_28px_-10px_rgba(59,130,246,0.75)]"
                    >
                      {memberIds?.has(featuredSpace.id) ? 'Abrir Space' : 'Conhecer Space'}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {featured.length > 1 && (
                    <div className="flex items-center gap-2 self-end">
                      <button
                        type="button"
                        aria-label="Anterior"
                        onClick={() => {
                          pauseThenResume()
                          setFeaturedIdx((i) => (i - 1 + featured.length) % featured.length)
                        }}
                        className="w-9 h-9 rounded-full bg-black/40 border border-white/15 text-white flex items-center justify-center hover:bg-black/55"
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <div className="flex gap-1">
                        {featured.map((s, i) => (
                          <button
                            key={s.id}
                            type="button"
                            aria-label={`Destaque ${i + 1}`}
                            onClick={() => {
                              pauseThenResume()
                              setFeaturedIdx(i)
                            }}
                            className={
                              'w-1.5 h-1.5 rounded-full transition-all ' +
                              (i === safeFeaturedIdx ? 'bg-white w-4' : 'bg-white/35')
                            }
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        aria-label="Próximo"
                        onClick={() => {
                          pauseThenResume()
                          setFeaturedIdx((i) => (i + 1) % featured.length)
                        }}
                        className="w-9 h-9 rounded-full bg-black/40 border border-white/15 text-white flex items-center justify-center hover:bg-black/55"
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </motion.section>

        {/* Trending */}
        <motion.section variants={sectionVariants}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-strong">Spaces públicos em alta</h2>
            <button type="button" onClick={onOpenHub} className="text-[12px] font-medium text-[#60a5fa]">
              Ver mais
            </button>
          </div>
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"
          >
            {trending.map((s) => (
              <motion.div key={s.id} variants={staggerItem} initial="rest" whileHover="hover" animate="rest">
                <motion.div
                  variants={cardHover}
                  className="h-full rounded-[16px] border border-white/[0.07] bg-[#161922] overflow-hidden flex flex-col shadow-[0_8px_24px_-16px_rgba(0,0,0,0.6)] hover:border-[#3b82f6]/30 hover:shadow-[0_16px_40px_-16px_rgba(59,130,246,0.35)]"
                >
                  <div className="relative h-[84px]">
                    <FeaturedCover space={s} compact />
                    <div className="absolute left-3 -bottom-4">
                      <SpaceAvatar space={s} size={36} rounded="xl" className="ring-2 ring-[#161922]" />
                    </div>
                  </div>
                  <div className="px-3 pt-6 pb-3 flex-1 flex flex-col">
                    <p className="text-[13.5px] font-semibold text-strong truncate">{s.name}</p>
                    <p className="text-[11.5px] text-muted mt-1 line-clamp-2 flex-1 leading-snug">
                      {s.description || s.slogan || 'Space público'}
                    </p>
                    <p className="text-[11px] text-muted mt-2 inline-flex items-center gap-1">
                      <Users size={11} />
                      {formatMembers(s.memberCount)}
                    </p>
                    <button
                      type="button"
                      disabled={joinBusy === s.id}
                      onClick={() => onJoinPublic?.(s)}
                      className="mt-3 h-8 w-full rounded-full text-[12px] font-semibold text-white bg-[#3b82f6]/90 hover:bg-[#3b82f6]"
                    >
                      {memberIds?.has(s.id) ? 'Abrir' : 'Entrar no Space'}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* Continue strip */}
        {(contSpace || liveSpace) && (
          <motion.section variants={sectionVariants}>
            <h2 className="text-[15px] font-semibold text-strong mb-3">Continue de onde parou</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {contSpace && (
                <ContinueChip
                  space={contSpace}
                  label={contRoom ? `# ${contRoom.name}` : contSpace.name}
                  sub={contRoom?.lastMessagePreview || 'Continuar conversa'}
                  onClick={() => {
                    if (contRoom) onOpenContinueRoom?.(contSpace.id, contRoom)
                    else onSelectSpace?.(contSpace.id)
                  }}
                />
              )}
              {voiceRoom && liveSpace && (
                <ContinueChip
                  space={liveSpace}
                  label={voiceRoom.name}
                  sub="Sala de voz"
                  live
                  onClick={() => onOpenContinueRoom?.(liveSpace.id, voiceRoom)}
                />
              )}
            </div>
          </motion.section>
        )}
      </div>
    </motion.div>
  )
}

function formatMembers(n) {
  const count = Number(n) || 0
  if (count >= 1000) {
    const k = count / 1000
    return `${(k >= 10 ? Math.round(k) : Math.round(k * 10) / 10).toString().replace('.', ',')} mil membros`
  }
  return `${count} ${count === 1 ? 'membro' : 'membros'}`
}

function FeaturedCover({ space, compact = false }) {
  const cover = resolveSpaceCover(space)
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${space.color || '#3b82f6'}99, #0b1020 70%)`,
        }}
      />
      {cover ? (
        <SoftCover
          src={cover}
          className={compact ? '' : 'scale-105 group-hover:scale-110 transition-transform duration-700'}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{
          background: compact
            ? 'linear-gradient(180deg, transparent 20%, #161922 100%)'
            : 'linear-gradient(90deg, rgba(8,10,18,0.92) 0%, rgba(8,10,18,0.55) 55%, rgba(8,10,18,0.35) 100%)',
        }}
      />
    </>
  )
}

function ContinueChip({ space, label, sub, live, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.98 }}
      className={
        'shrink-0 w-[240px] flex items-center gap-3 px-3 py-3 rounded-2xl border text-left transition-colors ' +
        (live
          ? 'border-positive/40 bg-positive/10 shadow-[0_0_24px_-8px_rgba(50,196,141,0.55)]'
          : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]')
      }
    >
      <SpaceAvatar space={space} size={36} rounded="xl" />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-strong truncate">{label}</span>
        <span className={'block text-[11px] truncate ' + (live ? 'text-positive' : 'text-muted')}>
          {live ? `Em chamada · ${sub}` : sub}
        </span>
      </span>
    </motion.button>
  )
}
