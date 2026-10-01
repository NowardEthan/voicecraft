import Markdown from './markdown'
import {
  applyLobbyTemplate,
  applyLobbyTemplateChips,
  normalizeLobby,
  sanitizeAnnounceHtml,
} from './lobbySchema'
import { SpaceIcon } from '../spaces/model/spaceIcons'
import { DoorClosed } from 'lucide-react'
import ChatFeatureCardFrame from './cards/ChatFeatureCardFrame.jsx'
import { createLobbyCardViewModel } from './cards/featureCardViewModels.js'

function LobbyIcon({ cfg }) {
  if (cfg.iconImage) return <img src={cfg.iconImage} alt="" className="vc-feature-card-avatar-image" />
  if (cfg.iconValue) return <SpaceIcon value={cfg.iconValue} size={15} />
  return <span aria-hidden>{cfg.icon || '👋'}</span>
}

function PersonIdentity({ name, photo, vm }) {
  return (
    <div className="vc-feature-card-identity vc-lobby-card__person">
      {photo
        ? <img src={photo} alt="" className="vc-feature-card-identity__avatar" />
        : <span className="vc-feature-card-identity__avatar is-fallback" aria-hidden>{String(name).slice(0, 1).toUpperCase()}</span>}
      <span className="vc-feature-card-identity__copy">
        <strong>{name}</strong>
        <small>Recebido por {vm.author.name}</small>
      </span>
    </div>
  )
}

/** Compact social join card; intentionally avoids announcement treatment. */
export function LobbyJoinCard({
  msg,
  lobby,
  resolveRoom = null,
  spaceName = '',
  memberCount = null,
  preview = false,
}) {
  const ev = msg?.lobbyEvent || {}
  const cfg = normalizeLobby(lobby || ev.config || msg?.lobby || {})
  const name = ev.displayName || msg?.author || 'Alguém'
  const context = { user: name, space: spaceName || ev.spaceName || 'Space', count: memberCount ?? ev.memberCount ?? '' }
  const vm = createLobbyCardViewModel(msg || {}, { lobby: cfg, context, preview })
  const accent = ev.accent || msg?.lobbyAccent || vm.accent || cfg.accent || '#38bdf8'
  const titleTpl = cfg.title || ev.title || ''
  const bodyTpl = cfg.bodyHtml || cfg.body || ev.bodyHtml || ev.body || ''
  const titleHtml = sanitizeAnnounceHtml(applyLobbyTemplateChips(titleTpl, context))
  const bodyHtml = sanitizeAnnounceHtml(applyLobbyTemplateChips(bodyTpl, context))
  const titleHasChips = /\blobby-ph\b/.test(titleHtml)
  const bodyPlain = applyLobbyTemplate((cfg.body || ev.body || '').replace(/<[^>]+>/g, ' '), context)

  return (
    <div className="w-full px-3 sm:px-6 my-1.5">
      <ChatFeatureCardFrame
        accent={accent}
        compact
        className="vc-lobby-card vc-lobby-card--join"
        badge={<span className="vc-feature-card-pill" style={{ '--vc-feature-card-pill': ev.badgeColor || cfg.badgeColor || accent }}>{ev.badge || cfg.badge || 'Lobby'}</span>}
        status={vm.time && !preview ? <time dateTime={vm.time.iso}>{vm.time.label}</time> : null}
        icon={<LobbyIcon cfg={{ ...cfg, icon: ev.icon || cfg.icon, iconValue: ev.iconValue || cfg.iconValue, iconImage: ev.iconImage || cfg.iconImage }} />}
        title={<h3>{titleHasChips ? <span className="announce-html lobby-html" dangerouslySetInnerHTML={{ __html: titleHtml }} /> : applyLobbyTemplate(titleTpl, context)}</h3>}
        body={(bodyHtml || bodyPlain) ? (bodyHtml
          ? <div className="announce-html lobby-html" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          : <Markdown text={bodyPlain} resolveRoom={resolveRoom} />) : null}
        identity={<PersonIdentity name={name} photo={ev.photoURL || msg?.authorPhoto || ''} vm={vm} />}
        aria-label={`${name} entrou no Space`}
      />
    </div>
  )
}

/** @deprecated Prefer LobbyJoinCard. */
export function LobbyWelcomeCard(props) {
  return (
    <LobbyJoinCard
      msg={{ lobbyEvent: { displayName: props.previewUser?.displayName || 'você', photoURL: props.previewUser?.photoURL || '' } }}
      lobby={props.lobby}
      spaceName={props.spaceName || props.roomName}
      memberCount={props.memberCount}
      resolveRoom={props.resolveRoom}
      preview
    />
  )
}

export function LobbyEventCard({ msg, accent = '#38bdf8', resolveRoom = null, spaceName = '', memberCount = null }) {
  const ev = msg?.lobbyEvent || {}
  if (ev.type !== 'leave') {
    return <LobbyJoinCard msg={msg} resolveRoom={resolveRoom} spaceName={spaceName || ev.spaceName} memberCount={memberCount ?? ev.memberCount} />
  }

  const name = ev.displayName || msg?.author || 'Alguém'
  const vm = createLobbyCardViewModel(msg || {}, { context: { user: name, space: spaceName || ev.spaceName || 'Space', count: memberCount ?? ev.memberCount ?? '' } })
  return (
    <div className="w-full px-3 sm:px-6 my-1">
      <ChatFeatureCardFrame
        as="div"
        compact
        accent={ev.accent || accent}
        className="vc-lobby-card vc-lobby-card--leave"
        icon={ev.photoURL || msg?.authorPhoto
          ? <img src={ev.photoURL || msg.authorPhoto} alt="" className="vc-feature-card-avatar-image" />
          : <DoorClosed size={14} aria-hidden />}
        title={<p><strong>{name}</strong> <span>saiu do Space</span></p>}
        status={vm.time ? <time dateTime={vm.time.iso}>{vm.time.label}</time> : null}
        aria-label={`${name} saiu do Space`}
      />
    </div>
  )
}
