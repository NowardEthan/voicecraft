import Markdown from './markdown'
import { normalizeAnnounce, sanitizeAnnounceHtml, ANNOUNCE_COVER_HEIGHT } from './announceSchema.js'
import { SpaceCoverLayer } from '../spaces/components/SpaceCoverLayer'
import { SpaceIcon } from '../spaces/model/spaceIcons'
import EmojiReactions, { EngagementTray } from '../../components/ui/EmojiReactions'
import { actionIdOf } from './messageIdentity.js'
import ChatFeatureCardFrame from './cards/ChatFeatureCardFrame.jsx'
import { createAnnouncementCardViewModel } from './cards/featureCardViewModels.js'

const SIZE_STYLE = {
  sm: { fontSize: 12, lineHeight: 1.45 },
  md: { fontSize: 13, lineHeight: 1.5 },
  lg: { fontSize: 14.5, lineHeight: 1.5 },
}

function FeatureIcon({ config, accent, fallback }) {
  if (config.iconImage) return <img src={config.iconImage} alt="" className="vc-feature-card-avatar-image" />
  if (config.iconValue) return <SpaceIcon value={config.iconValue} size={16} />
  return <span aria-hidden>{config.icon || fallback}</span>
}

function IdentityAvatar({ config, accent }) {
  if (config.authorPhoto) return <img src={config.authorPhoto} alt="" className="vc-feature-card-identity__avatar" />
  return (
    <span className="vc-feature-card-identity__avatar is-fallback" style={{ '--vc-feature-card-avatar-accent': accent }} aria-hidden>
      {config.authorIconValue
        ? <SpaceIcon value={config.authorIconValue} size={12} />
        : (config.authorIcon || String(config.authorName || 'E').slice(0, 1).toUpperCase())}
    </span>
  )
}

/** Rich announcement renderer with explicit editorial and publisher identity. */
export default function AnnouncementCard({
  msg,
  resolveRoom,
  currentUserId = null,
  onToggleLike = null,
  onToggleReaction = null,
  quickReactions = ['👍', '❤️', '🔥'],
  preview = false,
}) {
  const a = normalizeAnnounce(msg?.announce || { body: msg?.text || '', title: msg?.title || '' })
  const vm = createAnnouncementCardViewModel(msg || {}, {
    preview,
    scheduled: msg?.status === 'scheduled' || Boolean(msg?.publishAt),
  })
  const accent = vm.accent || a.accent || '#f5b942'
  const safeHtml = a.bodyHtml ? sanitizeAnnounceHtml(a.bodyHtml) : ''
  const canEngage = !preview && !msg?.deleted && (!!onToggleLike || !!onToggleReaction)
  const actionId = actionIdOf(msg)
  const status = preview ? { id: 'preview', label: 'Prévia' } : vm.status
  const publisherLabel = vm.publisher.verifiable
    ? `Publicado por ${vm.publisher.name} · identidade verificável`
    : `Publicado por ${vm.publisher.name}`

  const media = vm.media ? (
    <div className="vc-announcement-card__cover" style={{ height: ANNOUNCE_COVER_HEIGHT }}>
      <SpaceCoverLayer src={vm.media.src} fit={vm.media.fit} />
    </div>
  ) : null

  const identity = (
    <div className="vc-feature-card-identity">
      <IdentityAvatar config={a} accent={accent} />
      <span className="vc-feature-card-identity__copy">
        <strong>{vm.author.name}</strong>
        <small>Identidade editorial</small>
        <small className="vc-feature-card-publisher">
          {publisherLabel}{vm.publisher.verifiable ? <span aria-label="verificado"> ✓</span> : null}
        </small>
      </span>
    </div>
  )

  const actions = canEngage ? (
    <div className="vc-announcement-engagement">
      <EngagementTray
        className="vc-announcement-engagement__tray"
        label="Ações rápidas do anúncio"
        reactions={msg.reactions || {}}
        likes={msg.likes || []}
        currentUserId={currentUserId}
        quickReactions={quickReactions}
        onToggleReaction={onToggleReaction ? (emoji) => onToggleReaction(actionId, emoji) : null}
        onToggleLike={onToggleLike ? () => onToggleLike(actionId) : null}
      />
      <EmojiReactions
        reactions={msg.reactions || {}}
        likes={msg.likes || []}
        currentUserId={currentUserId}
        hideAdd
        onToggle={onToggleReaction ? (emoji) => onToggleReaction(actionId, emoji) : null}
        onToggleLike={onToggleLike ? () => onToggleLike(actionId) : null}
      />
    </div>
  ) : null

  return (
    <div className="w-full px-3 sm:px-6 my-2">
      <ChatFeatureCardFrame
        accent={accent}
        className={`vc-announcement-card ${vm.media ? 'is-immersive' : 'is-flat'}`}
        media={media}
        badge={<span className="vc-feature-card-pill" style={{ '--vc-feature-card-pill': a.badgeColor || accent }}>{a.badge || 'Anúncio'}</span>}
        status={status ? <span className={`vc-feature-card-state is-${status.id}`}>{status.label}</span> : null}
        icon={<FeatureIcon config={a} accent={accent} fallback="📣" />}
        title={<h3>{vm.title || 'Aviso da equipe'}</h3>}
        body={(safeHtml || a.body) ? (
          <div className="vc-announcement-card__body" style={SIZE_STYLE[a.bodySize] || SIZE_STYLE.md}>
            {safeHtml
              ? <div className="announce-html" dangerouslySetInnerHTML={{ __html: safeHtml }} />
              : <Markdown text={a.body} resolveRoom={resolveRoom} />}
          </div>
        ) : null}
        identity={identity}
        actions={actions}
        aria-label={`Anúncio: ${vm.title}`}
      />
    </div>
  )
}
