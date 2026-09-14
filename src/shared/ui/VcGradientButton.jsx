/**
 * VcGradientButton — primary CTA matching the Home mockup
 * (blue → white gradient, dark ink). Pass `accent` for Space-tinted CTAs.
 */
import { ctaStyle } from '../../features/spaces/model/spaceTokens'

export default function VcGradientButton({
  children,
  accent = null,
  className = '',
  style,
  disabled = false,
  busy = false,
  type = 'button',
  size = 'md', // sm | md | lg
  block = false,
  ...rest
}) {
  const paint = ctaStyle(accent)
  const sizeClass = size === 'sm'
    ? 'h-8 px-3.5 text-[12px]'
    : size === 'lg'
      ? 'h-11 px-6 text-[14px]'
      : 'h-10 px-5 text-[13px]'

  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={
        'vc-gradient-btn inline-flex items-center justify-center gap-2 ' +
        'rounded-full font-semibold transition-[filter,transform,opacity] duration-150 ' +
        'hover:brightness-105 active:scale-[0.98] ' +
        'disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 ' +
        (block ? 'w-full ' : '') +
        sizeClass + ' ' +
        className
      }
      style={{
        background: paint.background,
        color: paint.color,
        boxShadow: paint.boxShadow,
        ...style,
      }}
      {...rest}
    >
      {busy ? <span className="opacity-80">…</span> : null}
      {children}
    </button>
  )
}
