/**
 * HomeNavPanel — left sidebar on personal Início.
 * Layout aligned to product mockups (Início / Explorar / …).
 */
import { motion } from 'framer-motion'
import {
  Calendar,
  Headphones,
  Home,
  MessageSquare,
  Mic,
  Plus,
  Settings,
  Users,
} from 'lucide-react'
import SpaceAvatar from '../SpaceAvatar'
import { PersonAvatar } from '../../features/people'
import { useNotifications } from '../../features/notifications'
import { Appear, AppearList, AppearItem } from '../../shared/motion/Appear'

const NAV = [
  { id: 'para-voce', label: 'Início', icon: Home },
  { id: 'amigos', label: 'Amigos', icon: Users },
  { id: 'mensagens', label: 'Mensagens', icon: MessageSquare },
  { id: 'eventos', label: 'Eventos', icon: Calendar },
]

export default function HomeNavPanel({
  activeTab = 'para-voce',
  onChangeTab,
  spaces = [],
  accountName = '',
  accountPhoto = '',
  currentUserId = null,
  connected = true,
  onSelectSpace,
  onOpenAccount,
  onOpenHub,
  onOpenSettings,
}) {
  const { bellCount } = useNotifications()
  const name = accountName || 'você'

  return (
    <aside className="w-full h-full bg-[#12141a] border-r border-white/[0.06] flex flex-col overflow-hidden">
      <Appear className="shrink-0 px-4 pt-4 pb-3" delay={0.02} y={6}>
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] font-black text-white"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
            aria-hidden
          >
            V
          </span>
          <h2 className="text-[15px] font-bold text-strong tracking-tight">Voice</h2>
        </div>
      </Appear>

      <nav className="shrink-0 px-2 pb-2">
        <AppearList className="space-y-0.5 relative" stagger={0.035} delayChildren={0.05}>
          {NAV.map((item) => {
            const Icon = item.icon
            const active = activeTab === item.id
              || (item.id === 'para-voce' && activeTab === 'para-voce')
            const badge = item.id === 'mensagens' ? bellCount : 0
            return (
              <AppearItem key={item.id} className="relative">
                {active && (
                  <motion.span
                    layoutId="home-nav-pill"
                    className="absolute inset-0 rounded-[10px] bg-[#3b82f6]/18 border border-[#3b82f6]/25"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                {active && (
                  <motion.span
                    layoutId="home-nav-bar"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-[#60a5fa]"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onChangeTab?.(item.id)}
                  className={
                    'relative z-[1] w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-left ' +
                    (active ? 'text-strong' : 'text-ink/80 hover:text-strong hover:bg-white/[0.04]')
                  }
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon
                    size={16}
                    strokeWidth={1.85}
                    className={active ? 'text-[#60a5fa]' : 'text-muted'}
                  />
                  <span className="text-[13px] font-medium flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="min-w-[8px] h-2 w-2 rounded-full bg-[#3b82f6] shadow-[0_0_8px_#3b82f6]" />
                  )}
                </button>
              </AppearItem>
            )
          })}
        </AppearList>
      </nav>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-2">
        <Appear delay={0.1} y={6} className="flex items-center justify-between px-2.5 pt-4 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted/80">
            Seus Spaces
          </p>
          {onSelectSpace ? (
            <button
              type="button"
              onClick={() => onOpenHub?.()}
              title="Criar ou entrar em um Space"
              aria-label="Adicionar Space"
              className="w-5 h-5 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
            >
              <Plus size={12} strokeWidth={2.2} />
            </button>
          ) : null}
        </Appear>
        <AppearList className="space-y-0.5" stagger={0.04} delayChildren={0.12}>
          {spaces.length === 0 ? (
            <AppearItem className="px-2.5 py-3 text-[12px] text-muted">Nenhum Space ainda</AppearItem>
          ) : (
            spaces.map((s) => (
              <AppearItem key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectSpace?.(s.id)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-[10px] hover:bg-white/[0.05] text-left transition-colors group"
                >
                  <SpaceAvatar space={s} size={28} rounded="lg" />
                  <span className="text-[12.5px] font-medium text-strong/90 truncate flex-1 group-hover:text-strong">
                    {s.name}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-positive shrink-0 shadow-[0_0_6px_rgba(50,196,141,0.7)]" aria-hidden />
                </button>
              </AppearItem>
            ))
          )}
        </AppearList>
      </div>

      <Appear delay={0.16} y={8} className="shrink-0 border-t border-white/[0.06] px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenAccount}
            className="relative shrink-0 rounded-full"
            title="Conta"
            aria-label="Abrir conta"
          >
            <PersonAvatar src={accountPhoto} name={name} userId={currentUserId} size={34} />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-positive border-2 border-[#12141a]" />
          </button>
          <button
            type="button"
            onClick={onOpenAccount}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-[12.5px] font-semibold text-strong truncate">{name}</p>
            <p className={'text-[11px] font-medium ' + (connected ? 'text-positive/90' : 'text-warning')}>
              {connected ? 'Online' : 'Reconectando…'}
            </p>
          </button>
          <div className="flex items-center gap-0.5">
            <IconTiny label="Microfone" disabled>
              <Mic size={14} />
            </IconTiny>
            <IconTiny label="Áudio" disabled>
              <Headphones size={14} />
            </IconTiny>
            <IconTiny label="Configurações" onClick={onOpenSettings}>
              <Settings size={14} />
            </IconTiny>
          </div>
        </div>
      </Appear>
    </aside>
  )
}

function IconTiny({ children, label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
