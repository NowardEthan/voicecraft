/**
 * HomeView — personal Início.
 * Tabs stay mounted after first visit (and warm in idle) so covers/data
 * are already there — only the tab transition animates, never a reload flick.
 */
import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Calendar,
  MessageSquare,
} from 'lucide-react'
import {
  aggregateUpcomingEvents,
} from './home/homeData'
import {
  pageVariants,
  staggerContainer,
  staggerItem,
} from './home/homeMotion'
import HomeExplore from './home/HomeExplore'
import AmigosView from './AmigosView'
import { useNotifications } from '../../features/notifications'
import { usePublicSpacesCache } from '../../shared/media/usePublicSpacesCache'

const ALL_TABS = ['para-voce', 'amigos', 'mensagens', 'eventos']

export default function HomeView({
  spaces = [],
  accountName = '',
  homeTab = 'para-voce',
  onSelectSpace,
  onCreateSpace,
  onOpenHub,
  onJoinPublic,
  onOpenSpaceEvents,
  onOpenNotifTarget,
  onOpenContinueRoom,
  connected = true,
}) {
  const { inbox, roomsBySpace } = useNotifications()
  const { publicSpaces, publicLoading } = usePublicSpacesCache()
  const allEvents = useMemo(() => aggregateUpcomingEvents(spaces), [spaces])
  const [joinBusy, setJoinBusy] = useState(null)

  // Keep all home tabs mounted from the first frame — boot already warmed
  // their chunks/data, so switching is animation-only.
  const [mountedTabs] = useState(() => new Set(ALL_TABS))

  const memberIds = useMemo(() => new Set(spaces.map((s) => s.id)), [spaces])

  const handleDiscover = useCallback(async (space) => {
    if (!space?.id || joinBusy) return
    setJoinBusy(space.id)
    try {
      const already = memberIds.has(space.id) || space.joined
      await onJoinPublic?.(space.id, { alreadyMember: !!already })
    } finally {
      setJoinBusy(null)
    }
  }, [joinBusy, memberIds, onJoinPublic])

  const active = homeTab === 'explorar' ? 'para-voce' : homeTab

  return (
    <div className="relative h-full min-h-0">
      {mountedTabs.has('para-voce') && (
        <TabPane active={active === 'para-voce'}>
          <HomeExplore
            spaces={spaces}
            publicSpaces={publicSpaces}
            publicLoading={publicLoading}
            roomsBySpace={roomsBySpace}
            memberIds={memberIds}
            joinBusy={joinBusy}
            onJoinPublic={handleDiscover}
            onSelectSpace={onSelectSpace}
            onOpenContinueRoom={onOpenContinueRoom}
            onOpenHub={onOpenHub}
          />
        </TabPane>
      )}

      {mountedTabs.has('amigos') && (
        <TabPane active={active === 'amigos'}>
          <AmigosView onOpenFriend={undefined} />
        </TabPane>
      )}

      {mountedTabs.has('mensagens') && (
        <TabPane active={active === 'mensagens'}>
          <TabShell title="Mensagens" subtitle="Conversas recentes nos seus Spaces">
            <MessagesTab
              spaces={spaces}
              inbox={inbox}
              onOpenNotif={onOpenNotifTarget}
              onSelectSpace={onSelectSpace}
            />
          </TabShell>
        </TabPane>
      )}

      {mountedTabs.has('eventos') && (
        <TabPane active={active === 'eventos'}>
          <TabShell title="Eventos" subtitle="Agenda dos Spaces em que você está">
            {allEvents.length === 0 ? (
              <EmptyPanel
                icon={Calendar}
                title="Nenhum evento próximo"
                body="Abra um Space e marque um encontro pra galera."
              />
            ) : (
              <motion.ul variants={staggerContainer} initial="initial" animate="animate" className="space-y-2 max-w-xl">
                {allEvents.slice(0, 20).map((ev) => (
                  <motion.li key={`${ev.spaceId}-${ev.at}-${ev.title}`} variants={staggerItem}>
                    <button
                      type="button"
                      onClick={() => onOpenSpaceEvents?.(ev.spaceId)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] text-left"
                    >
                      <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#3b82f6] flex items-center justify-center text-white text-[12px] font-bold">
                        {new Date(ev.at).getDate()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-strong truncate">
                          {ev.title || 'Evento'}
                        </span>
                        <span className="block text-[12px] text-muted truncate">{ev.spaceName}</span>
                      </span>
                      <ArrowRight size={14} className="text-muted shrink-0" />
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </TabShell>
        </TabPane>
      )}
    </div>
  )
}

function TabPane({ active, children }) {
  return (
    <div
      className="absolute inset-0 h-full min-h-0"
      style={{
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 1 : 0,
      }}
      aria-hidden={!active}
    >
      {active ? (
        <motion.div
          className="h-full min-h-0"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      ) : (
        children
      )}
    </div>
  )
}

function TabShell({ title, subtitle, children }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas">
      <div className="max-w-[720px] mx-auto w-full px-4 sm:px-6 pt-8 pb-12">
        <h1 className="text-[26px] font-bold text-strong tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-[14px] text-muted mb-6">{subtitle}</p> : <div className="mb-6" />}
        {children}
      </div>
    </div>
  )
}

function EmptyPanel({ icon: Icon, title, body, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-10 text-center">
      <div className="mx-auto w-11 h-11 rounded-full bg-white/[0.05] flex items-center justify-center text-muted mb-3">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <p className="text-[14px] font-semibold text-strong">{title}</p>
      <p className="text-[13px] text-muted mt-1 max-w-sm mx-auto leading-relaxed">{body}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 h-9 px-4 rounded-full text-[12.5px] font-semibold text-white bg-[#3b82f6] hover:opacity-95"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}

function MessagesTab({ spaces, inbox, onOpenNotif, onSelectSpace }) {
  const items = (inbox || []).slice(0, 12)
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <EmptyPanel
          icon={MessageSquare}
          title="Nenhuma mensagem recente"
          body="Quando houver atividade nos seus Spaces, aparece aqui."
        />
      ) : (
        <ul className="rounded-2xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onOpenNotif?.({ spaceId: n.spaceId, roomId: n.roomId })}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/[0.04]"
              >
                <MessageSquare size={16} className="text-muted mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13px] text-strong line-clamp-2">{n.preview}</span>
                  <span className="block text-[11px] text-muted mt-0.5">
                    {n.spaceName}{n.roomName ? ` · #${n.roomName}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {spaces.length > 0 && (
        <button
          type="button"
          onClick={() => onSelectSpace?.(spaces[0].id)}
          className="text-[13px] font-medium text-[#60a5fa]"
        >
          Abrir um Space
        </button>
      )}
    </div>
  )
}
