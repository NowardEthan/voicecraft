export const CHAT_FEATURE_CARD_SLOTS = Object.freeze([
  'media',
  'badge',
  'icon',
  'content',
  'title',
  'body',
  'identity',
  'status',
  'actions',
])

/**
 * Shared structural frame for special chat content. It owns layout only;
 * feature-specific rendering and behavior stay in the supplied slots.
 */
export default function ChatFeatureCardFrame({
  as: Component = 'article',
  accent = 'var(--space-accent, var(--vc-positive))',
  media = null,
  badge = null,
  icon = null,
  title = null,
  body = null,
  identity = null,
  status = null,
  actions = null,
  size = 'default',
  compact = false,
  interactive = false,
  className = '',
  style,
  children = null,
  ...props
}) {
  const classes = [
    'vc-feature-card',
    compact || size === 'compact' ? 'vc-feature-card--compact' : '',
    interactive ? 'vc-feature-card--interactive' : '',
    className,
  ].filter(Boolean).join(' ')
  const frameStyle = { '--vc-feature-card-accent': accent, ...style }

  return (
    <Component className={classes} style={frameStyle} {...props}>
      {media ? <div className="vc-feature-card__media" data-slot="media">{media}</div> : null}
      <div className="vc-feature-card__content" data-slot="content">
        {(badge || status) ? (
          <div className="vc-feature-card__meta">
            {badge ? <div className="vc-feature-card__badge" data-slot="badge">{badge}</div> : null}
            {status ? <div className="vc-feature-card__status" data-slot="status">{status}</div> : null}
          </div>
        ) : null}
        {(icon || title) ? (
          <div className="vc-feature-card__heading">
            {icon ? <div className="vc-feature-card__icon" data-slot="icon">{icon}</div> : null}
            {title ? <div className="vc-feature-card__title" data-slot="title">{title}</div> : null}
          </div>
        ) : null}
        {body ? <div className="vc-feature-card__body" data-slot="body">{body}</div> : null}
        {children}
        {(identity || actions) ? (
          <footer className="vc-feature-card__footer">
            {identity ? <div className="vc-feature-card__identity" data-slot="identity">{identity}</div> : null}
            {actions ? <div className="vc-feature-card__actions" data-slot="actions">{actions}</div> : null}
          </footer>
        ) : null}
      </div>
    </Component>
  )
}
