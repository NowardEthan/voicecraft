/**
 * HomeAside — right social rail.
 * Renders different sections based on what data is passed:
 *   - Home tab (default):    search · Amigos online · Próximos eventos
 *   - Friends tab (mode='friends'): search · Atividade · Sugestões · (events optional)
 */
import { motion } from 'framer-motion'
import {
  ArrowRight,
  CalendarDays,
  Gamepad2,
  Headphones,
  Music2,
  Search,
  Users,
} from 'lucide-react'
import {
  formatEventBadge,
  formatEventTimeRange,
} from '../views/home/homeData'
import { sectionVariants, staggerContainer, staggerItem } from '../views/home/homeMotion'
import { PersonRichCard } from '../../features/people/components/PersonRichCard'
import { Appear } from '../../shared/motion/Appear'

export default function HomeAside({
  mode = 'home',
  friends = [],
  friendCount = null,
  activity = null,
  suggestions = null,
  events = [],
  nextEvent = null,
  rsvpCounts = null,
  rsvpAttendees = null,
  onOpenEvent,
  onOpenFriend,
  onAddSuggestion,
  onSeeAllFriends,
  onSeeAllEvents,
  onSeeAllActivity,
  onSeeAllSuggestions,
}) {
  const upcoming = (events?.length ? events : (nextEvent ? [nextEvent] : [])).slice(0, 3)
  const totalFriends = friendCount != null ? friendCount : friends.length
  const hasActivity = Array.isArray(activity) && activity.length > 0
  const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0
  const isFriendsMode = mode === 'friends'

  return (
    <aside className="w-full h-full bg-[#12141a] border-l border-white/[0.06] flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 py-4 space-y-5">
        <Appear delay={0.02} y={6} className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Buscar amigos…"
            disabled
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/[0.04] border border-white/[0.07] text-[12.5px] text-strong placeholder:text-muted focus:outline-none opacity-70"
          />
        </Appear>

        {/* Amigos online OR Atividade dos amigos */}
        {isFriendsMode && hasActivity ? (
          <motion.section variants={sectionVariants} initial="initial" animate="animate">
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <h2 className="text-[13px] font-semibold text-strong">Atividade dos amigos</h2>
              {onSeeAllActivity ? (
                <button
                  type="button"
                  onClick={onSeeAllActivity}
                  className="text-[11.5px] font-medium text-[#60a5fa] hover:opacity-90 inline-flex items-center gap-0.5"
                >
                  Ver todas
                  <ArrowRight size={11} />
                </button>
              ) : null}
            </div>
            <ul className="space-y-1">
              {activity.slice(0, 6).map((a) => (
                <ActivityRow key={a.id} activity={a} />
              ))}
            </ul>
          </motion.section>
        ) : (
          <motion.section variants={sectionVariants} initial="initial" animate="animate">
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <h2 className="text-[13px] font-semibold text-strong">
                Amigos online {totalFriends > 0 && <span className="text-muted font-medium">({totalFriends})</span>}
              </h2>
              {totalFriends > 0 && onSeeAllFriends ? (
                <button
                  type="button"
                  onClick={onSeeAllFriends}
                  className="text-[11.5px] font-medium text-[#60a5fa] hover:opacity-90 inline-flex items-center gap-0.5"
                >
                  Ver todos
                  <ArrowRight size={11} />
                </button>
              ) : null}
            </div>
            {friends.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3.5 py-6 text-center">
                <div className="mx-auto w-10 h-10 rounded-full bg-white/[0.05] flex items-center justify-center text-muted mb-2">
                  <Users size={18} strokeWidth={1.75} />
                </div>
                <p className="text-[12.5px] font-semibold text-strong">Sem amigos online</p>
                <p className="text-[11.5px] text-muted mt-1 leading-snug">
                  Amizades chegam em breve. Enquanto isso, encontre gente nos Spaces.
                </p>
                <div className="mt-3 flex justify-center gap-2 text-muted/50">
                  <Gamepad2 size={14} />
                  <Headphones size={14} />
                  <Music2 size={14} />
                </div>
              </div>
            ) : (
              <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="space-y-1">
                {friends.slice(0, 7).map((f) => (
                  <FriendRow key={f.id || f.userId || f.name} friend={f} onOpen={onOpenFriend} />
                ))}
              </motion.ul>
            )}
          </motion.section>
        )}

        {/* Próximos eventos públicos */}
        <motion.section variants={sectionVariants} initial="initial" animate="animate">
          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <h2 className="text-[13px] font-semibold text-strong">Próximos eventos públicos</h2>
            {(events?.length || nextEvent) && onSeeAllEvents ? (
              <button
                type="button"
                onClick={onSeeAllEvents}
                className="text-[11.5px] font-medium text-[#60a5fa] hover:opacity-90 inline-flex items-center gap-0.5"
                disabled={isFriendsMode}
              >
                Ver todos
                <ArrowRight size={11} />
              </button>
            ) : null}
          </div>
          {upcoming.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3.5 py-5 text-center">
              <CalendarDays size={18} className="mx-auto text-muted mb-2" />
              <p className="text-[12.5px] font-semibold text-strong">Nenhum evento próximo</p>
              <p className="text-[11.5px] text-muted mt-1">Abra um Space pra marcar encontros.</p>
            </div>
          ) : (
            <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
              {upcoming.map((ev) => {
                const badge = formatEventBadge(ev.at)
                const key = `${ev.spaceId || ''}:${ev.id}`
                const count = rsvpCounts ? (rsvpCounts.get(key) || 0) : 0
                const attendees = rsvpAttendees ? (rsvpAttendees.get(key) || []) : []
                return (
                  <motion.li key={`${ev.spaceId}-${ev.at}-${ev.title}`} variants={staggerItem}>
                    <button
                      type="button"
                      onClick={() => onOpenEvent?.(ev)}
                      className="w-full flex gap-0 rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden text-left hover:border-[#3b82f6]/35 hover:bg-white/[0.05] transition-colors"
                    >
                      <div className="w-[64px] shrink-0 bg-gradient-to-b from-[#6366f1] to-[#2563eb] flex flex-col items-center justify-center py-3 text-white">
                        <span className="text-[9px] font-bold tracking-wide opacity-90">{badge.weekday}</span>
                        <span className="text-[20px] font-bold leading-none mt-0.5">{badge.day}</span>
                        <span className="text-[9px] font-semibold mt-0.5 opacity-90">{badge.month}</span>
                      </div>
                      <div className="min-w-0 flex-1 px-3 py-2.5">
                        <p className="text-[13px] font-semibold text-strong line-clamp-2 leading-snug">
                          {ev.title || 'Evento'}
                        </p>
                        <p className="text-[11px] text-muted mt-1">
                          {formatEventTimeRange(ev)}
                          {ev.spaceName ? ` · ${ev.spaceName}` : ''}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <AvatarStack attendees={attendees} total={count} />
                          <p className="text-[10.5px] text-positive font-semibold">
                            {count > 0
                              ? `${count} confirmado${count === 1 ? '' : 's'}`
                              : 'Seja o primeiro'}
                          </p>
                        </div>
                      </div>
                    </button>
                  </motion.li>
                )
              })}
            </motion.ul>
          )}
          {nextEvent && (
            <button
              type="button"
              onClick={() => onOpenEvent?.(nextEvent)}
              className="mt-2.5 w-full h-9 rounded-full text-[12px] font-semibold text-white bg-gradient-to-r from-[#6366f1] to-[#3b82f6] hover:opacity-95"
            >
              Quero participar
            </button>
          )}
        </motion.section>

        {/* Sugestões (friends mode) */}
        {isFriendsMode && hasSuggestions && (
          <motion.section variants={sectionVariants} initial="initial" animate="animate">
            <div className="flex items-center justify-between mb-2.5 px-0.5">
              <h2 className="text-[13px] font-semibold text-strong">Pessoas que talvez conheça</h2>
              {onSeeAllSuggestions ? (
                <button
                  type="button"
                  onClick={onSeeAllSuggestions}
                  className="text-[11.5px] font-medium text-[#60a5fa] hover:opacity-90 inline-flex items-center gap-0.5"
                >
                  Ver todas
                  <ArrowRight size={11} />
                </button>
              ) : null}
            </div>
            <ul className="space-y-1.5">
              {suggestions.slice(0, 4).map((s) => (
                <SuggestionRow key={s.id} person={s} onAdd={onAddSuggestion} />
              ))}
            </ul>
          </motion.section>
        )}
      </div>
    </aside>
  )
}

function FriendRow({ friend, onOpen }) {
  return (
    <motion.li variants={staggerItem}>
      <PersonRichCard
        person={friend}
        variant="row"
        avatarSize={32}
        showHandle={false}
        showStatus
        onClick={() => onOpen?.(friend)}
      />
    </motion.li>
  )
}

function ActivityRow({ activity }) {
  return (
    <li>
      <PersonRichCard
        person={{
          id: activity.id || activity.name,
          name: activity.name,
          cardThemeId: activity.cardThemeId,
        }}
        variant="row"
        avatarSize={28}
        showHandle={false}
        showStatus={false}
        trailing={
          <div className="text-right min-w-0 max-w-[150px]">
            <p className="text-[11px] text-strong leading-snug line-clamp-2">
              <span className="text-muted">{activity.text}</span>
              {activity.space ? (
                <>
                  {' '}
                  <span className="text-[#60a5fa] font-semibold">{activity.space}</span>
                </>
              ) : null}
            </p>
            <p className="text-[10px] text-muted mt-0.5">{activity.at}</p>
          </div>
        }
      />
    </li>
  )
}

function SuggestionRow({ person, onAdd }) {
  return (
    <li>
      <PersonRichCard
        person={person}
        variant="row"
        avatarSize={32}
        showStatus={false}
        showHandle
        onClick={() => onAdd?.(person)}
        trailing={
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAdd?.(person) }}
            className="shrink-0 h-7 px-2.5 rounded-pill text-[11px] font-semibold border border-[#3b82f6]/45 text-[#60a5fa] hover:bg-[#3b82f6]/10"
          >
            Adicionar
          </button>
        }
      />
    </li>
  )
}

function AvatarStack({ attendees = [], total = 0 }) {
  if (!attendees.length && total === 0) {
    return (
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-dashed border-white/[0.18] text-muted text-[10px]"
        title="Ninguém confirmou ainda"
      >
        +
      </span>
    )
  }
  const shown = attendees.slice(0, 4)
  const extra = Math.max(0, total - shown.length)
  return (
    <div className="flex -space-x-1.5">
      {shown.map((a) => (
        <AvatarChip key={a.id || a.userId} attendee={a} />
      ))}
      {extra > 0 && (
        <span
          className="w-5 h-5 rounded-full bg-white/[0.08] border border-[#12141a] text-[9.5px] font-semibold text-strong flex items-center justify-center"
          title={`+${extra} confirmados`}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

function AvatarChip({ attendee }) {
  const name = attendee.displayName || '?'
  if (attendee.photoURL) {
    return (
      <img
        src={attendee.photoURL}
        alt={name}
        title={name}
        className="w-5 h-5 rounded-full object-cover border border-[#12141a]"
        loading="lazy"
      />
    )
  }
  const letter = name.trim().slice(0, 1).toUpperCase() || '?'
  return (
    <span
      title={name}
      className="w-5 h-5 rounded-full text-[9.5px] font-semibold text-white flex items-center justify-center border border-[#12141a]"
      style={{ background: avatarGradient(name) }}
    >
      {letter}
    </span>
  )
}

function avatarGradient(name) {
  const palette = [
    'linear-gradient(135deg, #6366f1, #a78bfa)',
    'linear-gradient(135deg, #3b82f6, #60a5fa)',
    'linear-gradient(135deg, #ec4899, #f472b6)',
    'linear-gradient(135deg, #14b8a6, #5eead4)',
    'linear-gradient(135deg, #f59e0b, #fbbf24)',
    'linear-gradient(135deg, #8b5cf6, #c4b5fd)',
    'linear-gradient(135deg, #06b6d4, #67e8f9)',
  ]
  const idx = (name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % palette.length
  return palette[idx]
}
