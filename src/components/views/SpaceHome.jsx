/**
 * SpaceHome — main-area landing page.
 *   1. No Space + has Spaces: personal HomeView (mockup)
 *   2. No Space + empty: welcome / first-run
 *   3. Space selected: live dashboard (SpaceOverview)
 */
import {
  Plus, Mic, Paintbrush, UserPlus, ArrowRight, Radio,
} from 'lucide-react'
import { spaceTokens } from '../../features/spaces'
import SpaceOverview from './SpaceOverview'
import HomeView from './HomeView'

export default function SpaceHome({
  space,
  members = [],
  spaces = [],
  accountName,
  accountPhoto,
  currentUserId,
  currentUserName,
  onSelectRoom,
  onSelectSpace,
  onCreateRoom,
  onCreateSpace,
  onOpenHub,
  onOpenAccount,
  onOpenNotifTarget,
  onInvite,
  onOpenEvents,
  onEditSpace,
  isCreator,
  canEditSpace = false,
  canManageRooms = false,
  connected,
  hostname,
  optimisticFirstRoom,
}) {
  if (!space) {
    if ((spaces || []).length > 0) {
      return (
        <HomeView
          spaces={spaces}
          accountName={accountName || currentUserName}
          accountPhoto={accountPhoto}
          onSelectSpace={onSelectSpace}
          onCreateSpace={onCreateSpace}
          onOpenHub={onOpenHub}
          onOpenAccount={onOpenAccount}
          onOpenNotifTarget={onOpenNotifTarget}
          connected={connected}
        />
      )
    }
    return (
      <WelcomeScreen
        onCreateSpace={onCreateSpace}
        connected={connected}
        hostname={hostname}
      />
    )
  }
  return (
    <OverviewMain
      space={space}
      members={members}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      onSelectRoom={onSelectRoom}
      onCreateRoom={onCreateRoom}
      onInvite={onInvite}
      onOpenEvents={onOpenEvents}
      onEditSpace={onEditSpace}
      isCreator={isCreator}
      canEditSpace={canEditSpace || isCreator}
      canManageRooms={canManageRooms || isCreator}
      optimisticFirstRoom={optimisticFirstRoom}
    />
  )
}

// ======================================================================
// WelcomeScreen — first-run / empty state. Matches the "Bem-vindo ao
// VoiceCraft" reference (DESIGN_SYSTEM §7.1).
// ======================================================================
function WelcomeScreen({ onCreateSpace, connected, hostname }) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas">
      <div className="relative min-h-full flex items-center justify-center p-5 sm:p-10 overflow-x-hidden">
      {/* Soft accent glow — uses tokens, never magic colors */}
      <div
        aria-hidden
        className="absolute w-[520px] h-[520px] rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: 'var(--space-accent)', top: '8%', left: '32%' }}
      />
      <div
        aria-hidden
        className="absolute w-[300px] h-[300px] rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ background: 'var(--space-accent)', bottom: '5%', right: '8%' }}
      />

      <div className="relative z-10 w-full max-w-2xl py-6">
        {/* Mic illustration */}
        <div className="flex justify-center mb-7">
          <MicIllustration />
        </div>

        {/* Heading block */}
        <div className="text-center mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent mb-3">
            Bem-vindo(a)
          </p>
          <h1 className="text-[34px] sm:text-[52px] font-bold text-strong tracking-tight leading-[1.05]">
            Bem-vindo ao{' '}
            <span className="bg-gradient-to-r from-accent to-[#ff8aa3] bg-clip-text text-transparent">
              VoiceCraft
            </span>
          </h1>
          <p className="mt-4 text-[15px] sm:text-[16px] text-muted leading-relaxed max-w-lg mx-auto">
            Crie um Space para reunir pessoas, conversas e voz em um só lugar.
          </p>
        </div>

        {/* CTA */}
        <div className="flex justify-center mb-12">
          <button
            type="button"
            onClick={onCreateSpace}
            disabled={!connected}
            className="
              group inline-flex items-center gap-2.5
              px-7 py-3.5 rounded-pill
              bg-accent text-strong
              text-[14.5px] font-semibold
              shadow-[0_8px_24px_-8px_var(--space-accent-glow-24)]
              hover:opacity-90 active:scale-[0.98]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all
            "
          >
            <Plus size={18} strokeWidth={2.25} />
            Criar meu primeiro Space
            <ArrowRight
              size={16}
              strokeWidth={2.25}
              className="opacity-70 group-hover:translate-x-0.5 transition-transform"
            />
          </button>
        </div>

        {/* "Como funciona" — 3 steps */}
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent mb-5 text-center">
            Como funciona
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <HowItWorksStep
              n={1}
              icon={Paintbrush}
              title="Personalize"
              body="Escolha um nome, tema e um ícone para o seu Space."
            />
            <HowItWorksStep
              n={2}
              icon={Radio}
              title="Crie uma sala"
              body="Defina o tipo de conversa: voz, texto ou ambos."
            />
            <HowItWorksStep
              n={3}
              icon={UserPlus}
              title="Convide pessoas"
              body="Chame seus amigos e comece a conversar, jogar ou colaborar."
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-10 sm:mt-14 pt-5 border-t border-line flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11.5px]">
          <p className="text-muted">
            Mais que um chat. Uma casa para a sua voz.
          </p>
          <p className="text-muted/60 font-semibold tracking-[0.18em] uppercase">
            VoiceCraft
          </p>
        </footer>

        {/* Connection status */}
        <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-muted">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-positive' : 'bg-line'}`}
            aria-hidden
          />
          {connected ? (hostname || 'Conectado') : 'Conectando ao servidor…'}
        </div>
      </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// MicIllustration — stylized mic with sound waves, accent-tinted.
// Pure SVG, no magic colors (uses currentColor + --space-accent tokens).
// ----------------------------------------------------------------------
function MicIllustration() {
  return (
    <div className="relative w-[180px] h-[180px] flex items-center justify-center">
      {/* Outer soft glow */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-full blur-2xl opacity-60"
        style={{ background: 'var(--space-accent-glow-24)' }}
      />

      {/* Sound waves — left */}
      <svg
        aria-hidden
        className="absolute"
        width="180"
        height="180"
        viewBox="0 0 180 180"
        fill="none"
      >
        <path
          d="M 28 70 Q 18 90 28 110"
          stroke="var(--space-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M 18 60 Q 4 90 18 120"
          stroke="var(--space-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.4"
        />
        {/* Sound waves — right */}
        <path
          d="M 152 70 Q 162 90 152 110"
          stroke="var(--space-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M 162 60 Q 176 90 162 120"
          stroke="var(--space-accent)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.4"
        />
        {/* Decorative orbs */}
        <circle cx="22" cy="36" r="3" fill="var(--space-accent)" opacity="0.8" />
        <circle cx="158" cy="148" r="2.5" fill="var(--space-accent)" opacity="0.6" />
        <circle cx="160" cy="40" r="2" fill="var(--space-accent)" opacity="0.5" />
      </svg>

      {/* Mic body — circular tile + Lucide mic icon */}
      <div
        className="
          relative w-[112px] h-[112px] rounded-[28px]
          flex items-center justify-center
          bg-accent text-strong
          shadow-[0_18px_48px_-12px_var(--space-accent-glow-24)]
        "
      >
        <Mic size={56} strokeWidth={1.5} aria-hidden />
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
// HowItWorksStep — one of the three numbered explanation cards.
// ----------------------------------------------------------------------
function HowItWorksStep({ n, icon: Icon, title, body }) {
  return (
    <div
      className="
        relative p-4 rounded-card
        bg-surface1 border border-line
        hover:bg-surface2 transition-colors
      "
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className="
            w-9 h-9 rounded-xl flex items-center justify-center shrink-0
            bg-accent-soft text-accent
          "
          aria-hidden
        >
          <Icon size={18} strokeWidth={1.75} />
        </div>
        <p className="text-[14px] font-semibold text-strong">
          {n}. {title}
        </p>
      </div>
      <p className="text-[12px] text-muted leading-relaxed">{body}</p>
    </div>
  )
}

// ======================================================================
// OverviewMain — main-area Visão geral for when a Space is selected but
// no room is open. Full-width cards (DESIGN_SYSTEM §7.1).
// ======================================================================
function OverviewMain({
  space,
  members = [],
  currentUserId,
  currentUserName,
  onSelectRoom,
  onCreateRoom,
  onInvite,
  onOpenEvents,
  onEditSpace,
  isCreator,
  canEditSpace = false,
  canManageRooms = false,
  optimisticFirstRoom,
}) {
  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas" style={spaceTokens(space)}>
      <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 md:px-10 pt-12 sm:pt-6 md:pt-8 pb-6 sm:pb-8">
        <SpaceOverview
          space={space}
          members={members}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onSelectRoom={onSelectRoom}
          onCreateRoom={onCreateRoom}
          onInvite={onInvite}
          onOpenEvents={onOpenEvents}
          onEditSpace={onEditSpace}
          isCreator={isCreator}
          canEditSpace={canEditSpace}
          canManageRooms={canManageRooms}
          optimisticFirstRoom={optimisticFirstRoom}
        />
      </div>
    </div>
  )
}
