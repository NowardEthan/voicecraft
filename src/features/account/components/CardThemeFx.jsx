/**
 * Theme FX — dramatic per-theme overlays for profile cards & nameplates.
 * Particles/motions only; never blur parent content (that hid avatars).
 */
export function CardThemeFx({ themeId = 'default', variant = 'card', className = '' }) {
  const id = themeId || 'default'
  const compact = variant === 'nameplate' || variant === 'thumb'
  const n = compact
    ? { star: 4, spark: 4, dust: 5, petal: 4, bit: 3 }
    : { star: 14, spark: 12, dust: 14, petal: 12, bit: 8 }

  return (
    <div
      className={`vc-card-fx vc-card-fx--${id} vc-card-fx--${variant} pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div className="vc-card-fx__base" />
      <div className="vc-card-fx__wash" />

      {id === 'default' && (
        <>
          <span className="vc-card-fx__pulse-ring" />
          <span className="vc-card-fx__pulse-ring vc-card-fx__pulse-ring--2" />
          <div className="vc-card-fx__sheen" />
        </>
      )}

      {id === 'lunar' && (
        <>
          <span className="vc-card-fx__moon" />
          <span className="vc-card-fx__orb vc-card-fx__orb--moon" />
          {stars(n.star)}
          {!compact && <span className="vc-card-fx__beam" />}
        </>
      )}

      {id === 'nebula' && (
        <>
          <span className="vc-card-fx__orb vc-card-fx__orb--a" />
          <span className="vc-card-fx__orb vc-card-fx__orb--b" />
          <span className="vc-card-fx__orb vc-card-fx__orb--c" />
          {stars(n.star)}
          <div className="vc-card-fx__sheen vc-card-fx__sheen--magenta" />
        </>
      )}

      {id === 'ember' && (
        <>
          <span className="vc-card-fx__heat" />
          <span className="vc-card-fx__heat vc-card-fx__heat--top" />
          {sparks(n.spark)}
          {!compact && sparks(5, true)}
        </>
      )}

      {id === 'aurora' && (
        <>
          <span className="vc-card-fx__wave vc-card-fx__wave--1" />
          <span className="vc-card-fx__wave vc-card-fx__wave--2" />
          <span className="vc-card-fx__wave vc-card-fx__wave--3" />
          {!compact && <span className="vc-card-fx__wave vc-card-fx__wave--4" />}
        </>
      )}

      {id === 'void' && (
        <>
          <span className="vc-card-fx__vignette" />
          {dust(n.dust)}
          {!compact && <span className="vc-card-fx__void-rift" />}
        </>
      )}

      {id === 'sakura' && (
        <>
          <span className="vc-card-fx__mist" />
          {petals(n.petal)}
        </>
      )}

      {id === 'cyber' && (
        <>
          <span className="vc-card-fx__grid" />
          <span className="vc-card-fx__scan" />
          <span className="vc-card-fx__corner vc-card-fx__corner--tl" />
          <span className="vc-card-fx__corner vc-card-fx__corner--br" />
          {bits(n.bit)}
          {!compact && <span className="vc-card-fx__glitch" />}
        </>
      )}
    </div>
  )
}

function stars(n) {
  return Array.from({ length: n }, (_, i) => (
    <span
      key={`s${i}`}
      className={`vc-card-fx__star ${i % 4 === 0 ? 'vc-card-fx__star--lg' : ''}`}
      style={{
        left: `${6 + ((i * 37) % 88)}%`,
        top: `${8 + ((i * 53) % 78)}%`,
        animationDelay: `${(i * 0.28) % 2.8}s`,
      }}
    />
  ))
}

function sparks(n, big = false) {
  return Array.from({ length: n }, (_, i) => (
    <span
      key={`${big ? 'eb' : 'e'}${i}`}
      className={`vc-card-fx__spark ${big ? 'vc-card-fx__spark--big' : ''}`}
      style={{
        left: `${8 + ((i * 11) % 84)}%`,
        animationDelay: `${(i * 0.32) % 2.6}s`,
        animationDuration: `${1.6 + (i % 4) * 0.35}s`,
      }}
    />
  ))
}

function dust(n) {
  return Array.from({ length: n }, (_, i) => (
    <span
      key={`d${i}`}
      className="vc-card-fx__dust"
      style={{
        left: `${4 + ((i * 29) % 92)}%`,
        top: `${6 + ((i * 41) % 84)}%`,
        animationDelay: `${(i * 0.4) % 5}s`,
        animationDuration: `${4 + (i % 5)}s`,
      }}
    />
  ))
}

function petals(n) {
  return Array.from({ length: n }, (_, i) => (
    <span
      key={`p${i}`}
      className={`vc-card-fx__petal ${i % 3 === 0 ? 'vc-card-fx__petal--lg' : ''}`}
      style={{
        left: `${4 + ((i * 17) % 90)}%`,
        animationDelay: `${(i * 0.4) % 3.8}s`,
        animationDuration: `${3.2 + (i % 4) * 0.9}s`,
        '--petal-rot': `${(-50 + i * 22) % 90}deg`,
      }}
    />
  ))
}

function bits(n) {
  return Array.from({ length: n }, (_, i) => (
    <span
      key={`b${i}`}
      className="vc-card-fx__bit"
      style={{
        left: `${10 + ((i * 23) % 80)}%`,
        top: `${15 + ((i * 31) % 70)}%`,
        animationDelay: `${(i * 0.35) % 2}s`,
      }}
    >
      {i % 2 === 0 ? '01' : '10'}
    </span>
  ))
}
