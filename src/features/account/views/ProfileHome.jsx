import {
  MapPin, Calendar, Pencil, MoreHorizontal, Radio, UserPlus,
  MessageCircle, Sparkles, Headphones, Rocket, Heart, Mic2, Users, Moon,
} from 'lucide-react'
import SpaceAvatar from '../../../components/SpaceAvatar'
import { SpaceCoverLayer } from '../../spaces/components/SpaceCoverLayer'
import { AvatarCircle } from '../components/AccountSidebar'
import { deriveBadges, monthLabel, relativeTime } from '../model/profile'

const ACTIVITY_ICON = {
  voice: Radio,
  follow: UserPlus,
  message: MessageCircle,
  space: Sparkles,
  profile: Pencil,
}

const BADGE_ICON = {
  pioneer: Rocket,
  connecting: Users,
  voice: Mic2,
  vibe: Heart,
}

export function ProfileHome({ profile, spaces = [], onEdit, onEditCover }) {
  const badges = deriveBadges(profile, spaces.length)
  const featured = spaces.slice(0, 4)
  const activity = (profile.activity || []).slice(0, 6)
  const hasCover = typeof profile.cover === 'string' && (profile.cover.startsWith('http') || profile.cover.startsWith('data:image/'))

  return (
    <div className="max-w-[980px] mx-auto px-5 sm:px-8 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Perfil</p>
        <span className="text-[12px] text-muted px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06]">
          Perfil público
        </span>
      </div>

      <section className="relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#12141a]">
        <div
          className="relative h-[188px] overflow-hidden"
          style={hasCover ? undefined : {
            background: `radial-gradient(80% 120% at 20% 0%, hsl(${profile.bannerHue} 70% 42% / 0.55), transparent 60%), linear-gradient(135deg, #2a0d16 0%, #12080c 55%, #0d0e12 100%)`,
          }}
        >
          {hasCover ? (
            <SpaceCoverLayer src={profile.cover} fit={profile.coverFit} />
          ) : (
            <div className="absolute inset-0 opacity-30 pointer-events-none">
              <Moon className="absolute top-6 left-[18%] text-accent" size={28} />
              <MessageCircle className="absolute top-8 left-10 text-accent" size={22} />
              <Headphones className="absolute top-16 left-[38%] text-accent" size={20} />
              <Mic2 className="absolute bottom-8 left-[22%] text-accent" size={26} />
              <Heart className="absolute top-10 right-[28%] text-accent" size={16} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#12141a] via-transparent to-black/10 pointer-events-none" />
          <div className="absolute right-6 top-8 w-[88px] h-[88px] rounded-[28px] rotate-[-8deg] bg-accent/20 border border-accent/30 flex items-center justify-center text-center px-2 z-10">
            <p className="text-[9px] font-bold leading-tight tracking-wide text-accent">
              BOAS PESSOAS<br />MELHORES DIAS
            </p>
          </div>
          {onEditCover && (
            <button
              type="button"
              onClick={onEditCover}
              className="absolute bottom-3 right-4 z-10 h-8 px-2.5 rounded-lg text-[12px] font-medium bg-black/45 hover:bg-black/60 text-white border border-white/15 backdrop-blur-sm"
            >
              Editar capa
            </button>
          )}
        </div>

        <div className="px-6 pb-6">
          <div className="flex items-end justify-between gap-4">
            <div className="relative w-[120px] shrink-0 -mt-14">
              <div className="rounded-full p-[3px] bg-gradient-to-b from-accent to-[#ff7a93] shadow-[0_12px_40px_-12px_var(--space-accent-glow-24)]">
                <AvatarCircle src={profile.photoURL} name={profile.displayName} size={112} className="ring-4 ring-[#12141a]" />
              </div>
              <span className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-positive border-4 border-[#12141a]" />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <button
                type="button"
                onClick={onEdit}
                className="h-10 px-4 rounded-full bg-accent text-on-accent text-[13px] font-semibold inline-flex items-center gap-1.5"
              >
                <Pencil size={14} />
                Editar perfil
              </button>
              <button type="button" className="w-10 h-10 rounded-full border border-white/[0.08] text-muted hover:text-strong flex items-center justify-center" aria-label="Mais">
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>

          <div className="min-w-0 mt-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1 className="text-[28px] font-bold tracking-tight text-strong break-words">{profile.displayName}</h1>
              <span className="text-[14px] text-muted shrink-0">@{profile.handle}</span>
            </div>
            <p className="text-[14px] text-ink/90 mt-1">
              {profile.bio || 'Criando espaços, ideias e boas conversas.'}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12.5px] text-muted">
              {profile.privacy.showLocation && profile.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={13} /> {profile.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} /> Na Lunar desde {monthLabel(profile.createdAt)}
              </span>
            </div>
            {profile.statusText && (
              <p className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[12px] text-ink">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ea1ff]" />
                {profile.statusText}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-6 mt-5 text-[13px] text-ink">
            <Stat icon={Sparkles} value={spaces.length} label="Spaces" />
            <Stat icon={Users} value={profile.connections.length} label="conexões" />
            <Stat icon={Mic2} value={`${Math.round((profile.voiceMinutes || 0) / 60)} h`} label="em voz" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-5">
        <div className="space-y-5">
          <Card title="Sobre mim">
            <p className="text-[13.5px] text-ink/90 leading-relaxed whitespace-pre-wrap">
              {profile.about || 'Ainda sem uma apresentação. Conte quem você é, o que curte ouvir e como gosta de conversar.'}
            </p>
          </Card>

          {profile.privacy.showSpaces && (
            <Card title="Spaces em destaque">
              {featured.length === 0 ? (
                <p className="text-[13px] text-muted">Você ainda não tem Spaces para destacar.</p>
              ) : (
                <ul className="space-y-3">
                  {featured.map((space) => (
                    <li key={space.id} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.04]">
                      <SpaceAvatar space={space} size={44} rounded="xl" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold text-strong truncate">{space.name}</p>
                        <p className="text-[12px] text-muted truncate">
                          {space.description || 'Space de grupo'}
                        </p>
                      </div>
                      <span className="text-[12px] text-muted shrink-0">{space.memberCount || 1} membros</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {profile.privacy.showActivity && (
            <Card title="Atividade recente">
              {activity.length === 0 ? (
                <p className="text-[13px] text-muted">Sua atividade aparece aqui conforme você usa o Voice.</p>
              ) : (
                <ol className="space-y-3">
                  {activity.map((item) => {
                    const Icon = ACTIVITY_ICON[item.kind] || Sparkles
                    return (
                      <li key={item.id} className="flex items-start gap-2.5">
                        <span className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0">
                          <Icon size={14} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] text-strong">{item.label}</p>
                          <p className="text-[11.5px] text-muted">{relativeTime(item.at)}</p>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              )}
            </Card>
          )}

          <Card title="Badges">
            <div className="grid grid-cols-2 gap-3">
              {badges.map((badge) => {
                const Icon = BADGE_ICON[badge.id] || Sparkles
                return (
                  <div
                    key={badge.id}
                    className={`rounded-2xl border px-3 py-3 ${badge.unlocked ? 'border-white/[0.08] bg-white/[0.03]' : 'border-white/[0.04] opacity-45'}`}
                  >
                    <span className="w-9 h-9 rounded-full bg-accent/15 text-accent flex items-center justify-center mb-2">
                      <Icon size={16} />
                    </span>
                    <p className="text-[12.5px] font-semibold text-strong">{badge.label}</p>
                    <p className="text-[11px] text-muted">{badge.hint}</p>
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, value, label }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="w-8 h-8 rounded-full bg-white/[0.04] text-accent flex items-center justify-center">
        <Icon size={14} />
      </span>
      <span>
        <span className="font-semibold text-strong">{value}</span>
        {' '}
        <span className="text-muted">{label}</span>
      </span>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <section className="rounded-[20px] border border-white/[0.06] bg-[#12141a] px-5 py-4">
      <h2 className="text-[13px] font-semibold text-strong mb-3">{title}</h2>
      {children}
    </section>
  )
}
