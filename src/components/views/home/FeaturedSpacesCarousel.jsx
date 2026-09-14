/**
 * FeaturedSpacesCarousel — hero carousel of high-engagement Spaces.
 */
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Users } from 'lucide-react'
import SpaceAvatar from '../../SpaceAvatar'
import { resolveSpaceCover } from '../../../features/spaces/model/spaceCover'
import { SoftCover } from '../../../shared/media/SoftImage'
import { warmImage } from '../../../shared/media/imageWarm'

const AUTO_MS = 5600

/** Rank by members + room activity signals when available. */
export function rankFeaturedSpaces(publicSpaces = [], joinedSpaces = [], roomsBySpace = {}) {
  const byId = new Map()
  for (const s of [...publicSpaces, ...joinedSpaces]) {
    if (!s?.id) continue
    if (!byId.has(s.id)) byId.set(s.id, { ...s })
    else byId.set(s.id, { ...byId.get(s.id), ...s })
  }
  const list = [...byId.values()].map((s) => {
    const rooms = roomsBySpace[s.id] || []
    const msgScore = rooms.reduce((acc, r) => acc + (r.lastMessageAt ? 1 : 0), 0)
    const score = (Number(s.memberCount) || 0) * 10 + msgScore * 3 + (Number(s.roomCount) || rooms.length || 0)
    return { space: s, score }
  })
  list.sort((a, b) => b.score - a.score)
  return list.map((x) => x.space).slice(0, 6)
}

function formatMembers(n) {
  const count = Number(n) || 0
  if (count >= 1000) {
    const k = count / 1000
    return `${(k >= 10 ? Math.round(k) : Math.round(k * 10) / 10).toString().replace('.', ',')} mil`
  }
  return String(count)
}

export default function FeaturedSpacesCarousel({
  spaces = [],
  memberIds,
  joinBusy = null,
  loading = false,
  onOpen,
  onJoin,
}) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = spaces.length
  const safe = count ? ((index % count) + count) % count : 0
  const current = spaces[safe] || null

  useEffect(() => {
    setIndex(0)
  }, [spaces.map((s) => s.id).join('|')])

  useEffect(() => {
    if (paused || count < 2) return undefined
    const t = setInterval(() => setIndex((i) => i + 1), AUTO_MS)
    return () => clearInterval(t)
  }, [paused, count])

  const already = current && (memberIds?.has(current.id) || current.joined)

  if (loading && !current) {
    return (
      <div className="w-full h-[200px] sm:h-[220px] rounded-[20px] bg-white/[0.04] border border-white/[0.06] animate-pulse" />
    )
  }

  if (!current) {
    return (
      <div className="relative w-full h-[200px] sm:h-[220px] rounded-[20px] overflow-hidden border border-white/[0.08] bg-gradient-to-br from-[#1e1b4b] via-[#0f172a] to-[#0b1020]">
        <div
          aria-hidden
          className="absolute right-[-10%] top-[-20%] w-[55%] h-[140%] rounded-full opacity-70"
          style={{
            background: 'radial-gradient(circle, rgba(96,165,250,0.55) 0%, rgba(59,130,246,0.15) 40%, transparent 70%)',
          }}
        />
        <div className="relative z-10 h-full flex items-end justify-end p-6">
          <p className="text-[15px] sm:text-[16px] font-semibold text-white/90 max-w-[220px] text-right leading-snug">
            Gente boa cria coisas incríveis.
          </p>
        </div>
      </div>
    )
  }

  const cover = resolveSpaceCover(current)

  // Warm current + neighbors so carousel steps never paint cold bitmaps.
  useEffect(() => {
    if (!count) return undefined
    const idxs = [safe, (safe + 1) % count, (safe - 1 + count) % count]
    for (const i of idxs) {
      const url = resolveSpaceCover(spaces[i])
      if (url) warmImage(url)
    }
    return undefined
  }, [safe, count, spaces])

  return (
    <div
      className="relative w-full rounded-[20px] overflow-hidden border border-white/[0.08] shadow-[0_24px_60px_-28px_rgba(59,130,246,0.55)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.id}
          initial={{ opacity: 1, scale: 1.01 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 1, scale: 0.995 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative h-[200px] sm:h-[220px]"
        >
          {/* Stable underlay — SoftCover only mounts when decoded (no flick). */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(125deg, ${current.color || '#3b82f6'}55 0%, #0b1020 55%, #1e1b4b 100%)`,
            }}
          />
          {cover ? <SoftCover src={cover} /> : null}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(105deg, rgba(8,10,18,0.92) 0%, rgba(8,10,18,0.55) 48%, rgba(8,10,18,0.28) 100%)',
            }}
          />
          <div
            aria-hidden
            className="absolute right-[-8%] top-[-30%] w-[50%] h-[160%] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(147,197,253,0.35) 0%, rgba(59,130,246,0.12) 42%, transparent 68%)',
            }}
          />

          <div className="relative z-10 h-full flex flex-col justify-between p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-black/35 border border-white/15 text-white/90 backdrop-blur-sm">
                Em destaque
              </span>
              {count > 1 && (
                <div className="flex items-center gap-1.5">
                  <NavBtn ariaLabel="Anterior" onClick={() => setIndex((i) => i - 1)}>
                    <ArrowLeft size={15} />
                  </NavBtn>
                  <NavBtn ariaLabel="Próximo" onClick={() => setIndex((i) => i + 1)}>
                    <ArrowRight size={15} />
                  </NavBtn>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <SpaceAvatar space={current} size={42} rounded="xl" className="ring-2 ring-white/15 shadow-lg" />
                  <div className="min-w-0">
                    <h3 className="text-[20px] sm:text-[22px] font-bold text-white truncate leading-tight">
                      {current.name}
                    </h3>
                    <p className="text-[12px] text-white/70 inline-flex items-center gap-1.5 mt-0.5">
                      <Users size={12} />
                      {formatMembers(current.memberCount)} membros
                      {current.roomCount ? ` · ${current.roomCount} salas` : ''}
                    </p>
                  </div>
                </div>
                <p className="text-[13px] text-white/75 line-clamp-2 max-w-xl leading-relaxed">
                  {current.description || current.slogan || 'Uma comunidade ativa no VoiceCraft.'}
                </p>
              </div>

              <button
                type="button"
                disabled={joinBusy === current.id}
                onClick={() => {
                  if (already) onOpen?.(current.id)
                  else onJoin?.(current)
                }}
                className="shrink-0 h-10 px-5 rounded-full text-[13px] font-semibold text-white bg-[#3b82f6] hover:opacity-95 inline-flex items-center justify-center gap-2 shadow-[0_12px_28px_-8px_rgba(59,130,246,0.85)] disabled:opacity-50"
              >
                {already ? 'Abrir Space' : 'Conhecer Space'}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {count > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
          {spaces.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Space ${i + 1}`}
              onClick={() => setIndex(i)}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === safe ? 'w-5 bg-white' : 'w-1.5 bg-white/35 hover:bg-white/55')
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NavBtn({ children, onClick, ariaLabel }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className="w-8 h-8 rounded-full bg-black/45 border border-white/15 text-white flex items-center justify-center hover:bg-black/60 backdrop-blur-sm"
    >
      {children}
    </button>
  )
}
