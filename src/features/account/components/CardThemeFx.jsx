/**
 * Theme FX — particle/detail-first overlays (same approach as Sakura).
 * Soft static base only; each theme = unique particles that fade in/out inside the card.
 */
export function CardThemeFx({ themeId = 'default', variant = 'card', className = '' }) {
  const id = themeId || 'default'
  const compact = variant === 'nameplate' || variant === 'thumb'
  const n = compact
    ? { p: 7, shoot: 1, mote: 5, ember: 8, bit: 4, glint: 4 }
    : { p: 16, shoot: 3, mote: 14, ember: 16, bit: 10, glint: 8 }

  return (
    <div
      className={`vc-card-fx vc-card-fx--${id} vc-card-fx--${variant} pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div className="vc-card-fx__base" />
      {id === 'default' && <ClassicFx n={n} />}
      {id === 'lunar' && <LunarFx n={n} compact={compact} />}
      {id === 'nebula' && <NebulaFx n={n} />}
      {id === 'ember' && <EmberFx n={n} />}
      {id === 'aurora' && <AuroraFx n={n} />}
      {id === 'void' && <VoidFx n={n} compact={compact} />}
      {id === 'sakura' && <SakuraFx n={n} />}
      {id === 'cyber' && <CyberFx n={n} compact={compact} />}
    </div>
  )
}

function ClassicFx({ n }) {
  return (
    <>
      {Array.from({ length: n.p }, (_, i) => (
        <span
          key={`sp${i}`}
          className={`vc-fx-spark ${i % 4 === 0 ? 'vc-fx-spark--lg' : ''} ${i % 3 === 0 ? 'vc-fx-spark--coral' : ''}`}
          style={{
            left: `${4 + ((i * 19) % 90)}%`,
            animationDelay: `${(i * 0.35) % 4.8}s`,
            animationDuration: `${4.2 + (i % 5) * 0.55}s`,
            '--drift': `${-10 + (i % 6) * 5}px`,
          }}
        />
      ))}
      {Array.from({ length: Math.max(3, Math.floor(n.p / 4)) }, (_, i) => (
        <span
          key={`fl${i}`}
          className="vc-fx-flare"
          style={{
            left: `${12 + ((i * 31) % 72)}%`,
            top: `${15 + ((i * 27) % 55)}%`,
            animationDelay: `${(i * 1.1) % 3.5}s`,
          }}
        />
      ))}
    </>
  )
}

function LunarFx({ n, compact }) {
  return (
    <>
      <span className="vc-fx-moon">
        <span className="vc-fx-moon__shade" />
        <span className="vc-fx-moon__crater vc-fx-moon__crater--a" />
        <span className="vc-fx-moon__crater vc-fx-moon__crater--b" />
      </span>
      {Array.from({ length: n.p }, (_, i) => (
        <span
          key={`st${i}`}
          className={`vc-fx-star ${i % 5 === 0 ? 'vc-fx-star--cross' : ''} ${i % 4 === 0 ? 'vc-fx-star--lg' : ''}`}
          style={{
            left: `${5 + ((i * 37) % 88)}%`,
            top: `${8 + ((i * 53) % 78)}%`,
            animationDelay: `${(i * 0.28) % 3}s`,
          }}
        />
      ))}
      {Array.from({ length: n.shoot }, (_, i) => (
        <span
          key={`sh${i}`}
          className="vc-fx-shoot"
          style={{
            top: `${8 + i * 22}%`,
            animationDelay: `${1.2 + i * 2.4}s`,
            animationDuration: `${2.8 + i * 0.4}s`,
          }}
        />
      ))}
      {!compact && (
        <svg className="vc-fx-constellation" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline className="vc-fx-constellation__line" points="16,30 32,18 50,34 70,20" fill="none" />
          <polyline className="vc-fx-constellation__line vc-fx-constellation__line--2" points="20,74 42,58 62,70" fill="none" />
        </svg>
      )}
    </>
  )
}

function NebulaFx({ n }) {
  const hue = ['pink', 'violet', 'cyan']
  return (
    <>
      {Array.from({ length: n.p + 4 }, (_, i) => (
        <span
          key={`nd${i}`}
          className={`vc-fx-speck vc-fx-speck--${hue[i % 3]} ${i % 5 === 0 ? 'vc-fx-speck--lg' : ''}`}
          style={{
            left: `${3 + ((i * 23) % 92)}%`,
            animationDelay: `${(i * 0.4) % 5.5}s`,
            animationDuration: `${5.5 + (i % 4) * 0.8}s`,
            '--drift': `${8 + (i % 5) * 6}px`,
          }}
        />
      ))}
      {Array.from({ length: Math.max(2, Math.floor(n.p / 5)) }, (_, i) => (
        <span
          key={`orb${i}`}
          className={`vc-fx-orb vc-fx-orb--${hue[i % 3]}`}
          style={{
            left: `${18 + ((i * 29) % 60)}%`,
            top: `${20 + ((i * 33) % 50)}%`,
            animationDelay: `${(i * 1.3) % 4}s`,
            animationDuration: `${6 + i}s`,
          }}
        />
      ))}
    </>
  )
}

function EmberFx({ n }) {
  return (
    <>
      {Array.from({ length: n.ember }, (_, i) => (
        <span
          key={`em${i}`}
          className={`vc-fx-ember ${i % 4 === 0 ? 'vc-fx-ember--big' : ''} ${i % 3 === 0 ? 'vc-fx-ember--trail' : ''}`}
          style={{
            left: `${5 + ((i * 11) % 88)}%`,
            animationDelay: `${(i * 0.32 + (i % 4) * 0.15) % 4}s`,
            animationDuration: `${2.6 + (i % 5) * 0.4}s`,
            '--drift': `${-14 + (i % 7) * 4}px`,
          }}
        />
      ))}
      {Array.from({ length: Math.max(2, Math.floor(n.ember / 6)) }, (_, i) => (
        <span
          key={`ash${i}`}
          className="vc-fx-ash"
          style={{
            left: `${10 + ((i * 37) % 75)}%`,
            animationDelay: `${(i * 0.9) % 3.5}s`,
            animationDuration: `${3.8 + i * 0.5}s`,
          }}
        />
      ))}
    </>
  )
}

function AuroraFx({ n }) {
  const tone = ['green', 'teal', 'blue']
  return (
    <>
      {Array.from({ length: n.mote }, (_, i) => (
        <span
          key={`am${i}`}
          className={`vc-fx-mote vc-fx-mote--${tone[i % 3]} ${i % 4 === 0 ? 'vc-fx-mote--tall' : ''}`}
          style={{
            left: `${4 + ((i * 17) % 90)}%`,
            animationDelay: `${(i * 0.36) % 5}s`,
            animationDuration: `${4.8 + (i % 5) * 0.65}s`,
            '--drift': `${12 + (i % 5) * 7}px`,
          }}
        />
      ))}
      {Array.from({ length: Math.max(3, Math.floor(n.mote / 4)) }, (_, i) => (
        <span
          key={`ribbon${i}`}
          className={`vc-fx-streak vc-fx-streak--${tone[i % 3]}`}
          style={{
            left: `${10 + i * 28}%`,
            animationDelay: `${0.6 + i * 1.1}s`,
            animationDuration: `${5.5 + i * 0.4}s`,
          }}
        />
      ))}
    </>
  )
}

function VoidFx({ n, compact }) {
  return (
    <>
      <span className="vc-fx-rift" />
      {!compact && <span className="vc-fx-rift vc-fx-rift--soft" />}
      {Array.from({ length: n.p }, (_, i) => (
        <span
          key={`vd${i}`}
          className={`vc-fx-ash vc-fx-ash--cold ${i % 3 === 0 ? 'vc-fx-ash--lg' : ''}`}
          style={{
            left: `${3 + ((i * 19) % 92)}%`,
            animationDelay: `${(i * 0.38) % 5.2}s`,
            animationDuration: `${5 + (i % 4) * 0.7}s`,
            '--drift': `${-8 + (i % 6) * 4}px`,
          }}
        />
      ))}
      {Array.from({ length: n.glint }, (_, i) => (
        <span
          key={`vg${i}`}
          className="vc-fx-glint"
          style={{
            left: `${10 + ((i * 29) % 78)}%`,
            top: `${12 + ((i * 37) % 70)}%`,
            animationDelay: `${(i * 0.75) % 4.2}s`,
          }}
        />
      ))}
    </>
  )
}

function SakuraFx({ n }) {
  return (
    <>
      {Array.from({ length: n.p + 2 }, (_, i) => (
        <span
          key={`pt${i}`}
          className={`vc-fx-petal ${i % 3 === 0 ? 'vc-fx-petal--lg' : ''} ${i % 2 === 0 ? 'vc-fx-petal--soft' : ''}`}
          style={{
            left: `${2 + ((i * 17) % 94)}%`,
            animationDelay: `${(i * 0.38) % 5.5}s`,
            animationDuration: `${5.2 + (i % 5) * 0.7}s`,
            '--drift': `${14 + (i % 6) * 8}px`,
            '--rot': `${(-35 + i * 17) % 70}deg`,
          }}
        />
      ))}
    </>
  )
}

function CyberFx({ n, compact }) {
  return (
    <>
      {!compact && <span className="vc-fx-hud-grid" />}
      <span className="vc-fx-hud-corner vc-fx-hud-corner--tl" />
      <span className="vc-fx-hud-corner vc-fx-hud-corner--br" />
      {!compact && (
        <>
          <span className="vc-fx-hud-corner vc-fx-hud-corner--tr" />
          <span className="vc-fx-hud-corner vc-fx-hud-corner--bl" />
        </>
      )}
      {Array.from({ length: n.bit }, (_, i) => (
        <span
          key={`bt${i}`}
          className="vc-fx-bit"
          style={{
            left: `${6 + ((i * 21) % 86)}%`,
            animationDelay: `${(i * 0.45) % 4}s`,
            animationDuration: `${3.6 + (i % 4) * 0.5}s`,
          }}
        >
          {i % 3 === 0 ? '01' : i % 3 === 1 ? '10' : '11'}
        </span>
      ))}
      {Array.from({ length: Math.max(4, Math.floor(n.bit / 2)) }, (_, i) => (
        <span
          key={`dot${i}`}
          className="vc-fx-pixel"
          style={{
            left: `${8 + ((i * 27) % 82)}%`,
            top: `${12 + ((i * 31) % 70)}%`,
            animationDelay: `${(i * 0.5) % 2.8}s`,
          }}
        />
      ))}
      {!compact && (
        <span className="vc-fx-scanline" />
      )}
    </>
  )
}
