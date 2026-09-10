/**
 * BrandMark — VoiceCraft logo from the official brand kit.
 * Transparent coral mark for dark UI surfaces.
 */
export function BrandMark({
  size = 28,
  className = '',
  alt = 'VoiceCraft',
  decorative = false,
}) {
  const px = typeof size === 'number' ? `${size}px` : size
  return (
    <img
      src={`${import.meta.env.BASE_URL}logo.png`}
      alt={decorative ? '' : alt}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      draggable={false}
      className={`shrink-0 object-contain select-none ${className}`}
      style={{ width: px, height: px }}
      aria-hidden={decorative || undefined}
    />
  )
}

/** App icon (tile + mark) — splash / large brand moments. */
export function BrandAppIcon({
  size = 48,
  className = '',
  alt = 'VoiceCraft',
  decorative = false,
}) {
  const px = typeof size === 'number' ? `${size}px` : size
  return (
    <img
      src={`${import.meta.env.BASE_URL}app-icon.png`}
      alt={decorative ? '' : alt}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      draggable={false}
      className={`shrink-0 object-contain select-none rounded-[22%] ${className}`}
      style={{ width: px, height: px }}
      aria-hidden={decorative || undefined}
    />
  )
}

/**
 * Discord-style brand loading — pulsing app avatar, no spinner ring.
 * Use for Suspense/auth/full-view waits.
 */
export function BrandLoader({
  size = 64,
  label = 'carregando…',
  showLabel = true,
  fill = false,
  className = '',
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex flex-col items-center justify-center gap-3',
        fill ? 'flex-1 h-full w-full min-h-0' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <BrandAppIcon size={size} decorative className="vc-brand-loader__icon" />
      {showLabel && label ? (
        <span className="text-[12px] text-muted">{label}</span>
      ) : (
        <span className="sr-only">{label || 'carregando'}</span>
      )}
    </div>
  )
}
