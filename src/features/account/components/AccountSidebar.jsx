import {
  UserRound, Pencil, Palette, Users, Shield, Lock, Monitor,
  Settings, LogOut, Mic2,
} from 'lucide-react'

const PRIMARY = [
  { id: 'profile', label: 'Meu perfil', icon: UserRound },
  { id: 'edit', label: 'Editar perfil', icon: Pencil },
  { id: 'look', label: 'Aparência', icon: Palette },
  { id: 'people', label: 'Conexões', icon: Users },
]

const SECONDARY = [
  { id: 'privacy', label: 'Privacidade', icon: Shield },
  { id: 'security', label: 'Segurança', icon: Lock },
  { id: 'devices', label: 'Dispositivos', icon: Monitor },
]

function NavButton({ item, active, onClick }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onClick(item.id)}
      className={[
        'h-10 px-3 rounded-xl flex items-center gap-2.5 text-[13px] font-medium transition-colors shrink-0',
        'w-auto md:w-full',
        active ? 'bg-accent text-on-accent' : 'text-ink hover:bg-white/[0.04] hover:text-strong',
      ].join(' ')}
    >
      <Icon size={16} strokeWidth={1.8} className={active ? 'text-on-accent' : 'text-muted'} />
      {item.label}
    </button>
  )
}

export function AccountSidebar({ profile, page, onChangePage, onOpenSettings, onSignOut }) {
  return (
    <aside className="w-full md:w-[min(260px,32vw)] md:min-w-[220px] shrink-0 md:h-full flex flex-col bg-[#101216] border-b md:border-b-0 md:border-r border-white/[0.06] px-3 py-3 md:px-4 md:py-5">
      <div className="hidden md:flex items-center gap-2.5 px-1 mb-5">
        <span className="w-9 h-9 rounded-xl bg-accent text-on-accent flex items-center justify-center shadow-[0_8px_20px_-10px_var(--space-accent-glow-24)]">
          <Mic2 size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-strong tracking-tight">Conta Lunar</p>
          <p className="text-[11px] text-muted truncate">Sua voz. Seu espaço. Sua conta.</p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2.5 px-2 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] mb-5">
        <AvatarCircle src={profile.photoURL} name={profile.displayName} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-strong truncate">{profile.displayName}</p>
          <p className="text-[11px] text-muted truncate">@{profile.handle}</p>
        </div>
        <span className="flex items-center gap-1 shrink-0" title="Online">
          <span className="w-2 h-2 rounded-full bg-positive" />
          <span className="text-[10px] text-positive hidden xl:inline">Online</span>
        </span>
      </div>

      <div className="flex md:flex-col gap-1 md:gap-0 overflow-x-auto md:overflow-visible -mx-1 px-1">
        <nav className="flex md:flex-col gap-1 md:gap-0.5">
          {PRIMARY.map((item) => (
            <NavButton key={item.id} item={item} active={page === item.id} onClick={onChangePage} />
          ))}
        </nav>
        <div className="hidden md:block h-px bg-white/[0.06] my-3" />
        <nav className="flex md:flex-col gap-1 md:gap-0.5">
          {SECONDARY.map((item) => (
            <NavButton key={item.id} item={item} active={page === item.id} onClick={onChangePage} />
          ))}
        </nav>
        <div className="hidden md:block mt-auto space-y-0.5 pt-4" />
        <div className="flex md:flex-col gap-1 md:mt-auto md:pt-4">
          <NavButton item={{ id: 'settings', label: 'Configurações', icon: Settings }} active={false} onClick={onOpenSettings} />
          <button
            type="button"
            onClick={onSignOut}
            className="h-10 px-3 rounded-xl flex items-center gap-2.5 text-[13px] font-medium text-danger/90 hover:bg-danger/10 transition-colors shrink-0 w-auto md:w-full"
          >
            <LogOut size={16} strokeWidth={1.8} />
            Sair da conta
          </button>
        </div>
      </div>
    </aside>
  )
}

export function AvatarCircle({ src, name, size = 40, className = '' }) {
  const letter = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded-full bg-accent/20 text-accent flex items-center justify-center font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : letter}
    </span>
  )
}
