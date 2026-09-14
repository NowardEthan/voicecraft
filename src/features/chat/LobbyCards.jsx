import Markdown from './markdown'
import {
  applyLobbyTemplate,
  applyLobbyTemplateChips,
  normalizeLobby,
  sanitizeAnnounceHtml,
  LOBBY_BANNER_HEIGHT,
} from './lobbySchema'
import { SpaceCoverLayer } from '../spaces/components/SpaceCoverLayer'
import { SpaceIcon } from '../spaces/model/spaceIcons'
import { DoorClosed } from 'lucide-react'

function LobbyPill({ color, label }) {
  return (
    <span
      className="inline-flex items-center h-[16px] px-1.5 rounded-full text-[8.5px] font-bold uppercase tracking-wide"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 18%, #111)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}

function LobbyIconMark({ cfg, accent, size = 28 }) {
  const box = size
  return (
    <div
      className="rounded-md flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        width: box,
        height: box,
        background: `color-mix(in srgb, ${accent} 16%, #1a1e28)`,
        border: `1px solid color-mix(in srgb, ${accent} 32%, #2a303a)`,
        color: accent,
        fontSize: Math.round(box * 0.55),
      }}
    >
      {cfg.iconImage ? (
        <img src={cfg.iconImage} alt="" className="w-full h-full object-cover" />
      ) : cfg.iconValue ? (
        <SpaceIcon value={cfg.iconValue} size={Math.round(box * 0.55)} />
      ) : (
        <span aria-hidden>{cfg.icon || '👋'}</span>
      )}
    </div>
  )
}

function LobbyAuthor({ cfg, accent }) {
  const name = cfg.authorName || 'Lobby'
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {cfg.authorPhoto ? (
        <img
          src={cfg.authorPhoto}
          alt=""
          className="w-4.5 h-4.5 w-[18px] h-[18px] rounded-full object-cover"
          style={{ border: '1px solid rgba(255,255,255,0.12)' }}
        />
      ) : cfg.authorIconValue ? (
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
          style={{
            background: `color-mix(in srgb, ${accent} 28%, #222)`,
            color: accent,
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <SpaceIcon value={cfg.authorIconValue} size={10} />
        </div>
      ) : cfg.authorIcon ? (
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px]"
          style={{
            background: `color-mix(in srgb, ${accent} 28%, #222)`,
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {cfg.authorIcon}
        </div>
      ) : (
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-bold"
          style={{
            background: `color-mix(in srgb, ${accent} 28%, #222)`,
            color: '#fff',
          }}
        >
          {String(name).slice(0, 1).toUpperCase()}
        </div>
      )}
      <span className="text-[10px] text-muted truncate">{name}</span>
    </div>
  )
}

/**
 * Compact Discord-style welcome card (smaller than announcements).
 */
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
  const accent = ev.accent || msg?.lobbyAccent || cfg.accent || '#38bdf8'
  const badgeColor = ev.badgeColor || cfg.badgeColor || accent
  const name = ev.displayName || msg?.author || 'Alguém'
  const photo = ev.photoURL || msg?.authorPhoto || ''
  const ctx = {
    user: name,
    space: spaceName || ev.spaceName,
    count: memberCount ?? ev.memberCount,
  }

  // Prefer template (tokens) from config snapshot so chips resolve at render time.
  const titleTpl = cfg.title || ev.title || ''
  const bodyTpl = cfg.bodyHtml || cfg.body || ev.bodyHtml || ev.body || ''
  const captionTpl = cfg.bannerCaption != null
    ? cfg.bannerCaption
    : (ev.bannerCaption != null ? ev.bannerCaption : '')

  const titleHtml = sanitizeAnnounceHtml(applyLobbyTemplateChips(titleTpl, ctx))
  const titlePlain = applyLobbyTemplate(titleTpl, ctx)
  const titleHasChips = /\blobby-ph\b/.test(titleHtml)

  const bodyHtml = sanitizeAnnounceHtml(applyLobbyTemplateChips(bodyTpl, ctx))
  const bodyPlain = applyLobbyTemplate(
    (cfg.body || ev.body || '').replace(/<[^>]+>/g, ' '),
    ctx,
  )

  const captionHtml = sanitizeAnnounceHtml(applyLobbyTemplateChips(captionTpl, ctx))
  const captionHasChips = /\blobby-ph\b/.test(captionHtml)

  const banner = ev.banner || cfg.banner || null
  const bannerFit = ev.bannerFit || cfg.bannerFit
  const when = !preview && msg?.ts
    ? new Date(msg.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="w-full px-3 sm:px-6 my-1.5">
      <article
        className="relative overflow-hidden rounded-lg max-w-[400px]"
        style={{
          background: 'linear-gradient(165deg, #1c2029 0%, #151820 60%, #12151c 100%)',
          border: `1px solid color-mix(in srgb, ${accent} 34%, #2a303a)`,
          boxShadow: '0 3px 10px rgba(0,0,0,0.22)',
        }}
      >
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[2px] z-10"
          style={{
            background: `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 22%, transparent))`,
          }}
        />

        <div className="pl-3 pr-2.5 pt-2 pb-2 space-y-1.5">
          <div className="flex items-start gap-2">
            <LobbyIconMark cfg={{
              icon: ev.icon || cfg.icon,
              iconValue: ev.iconValue || cfg.iconValue,
              iconImage: ev.iconImage || cfg.iconImage,
            }} accent={accent} size={28} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <LobbyPill color={badgeColor} label={ev.badge || cfg.badge || 'Lobby'} />
                {when ? <span className="text-[9.5px] text-muted tabular-nums">{when}</span> : null}
              </div>
              <h3 className="text-[13px] font-semibold text-strong leading-snug mt-0.5">
                {titleHasChips ? (
                  <span
                    className="announce-html lobby-html"
                    dangerouslySetInnerHTML={{ __html: titleHtml }}
                  />
                ) : (
                  titlePlain
                )}
              </h3>
            </div>
          </div>

          {(bodyHtml || bodyPlain) ? (
            <div
              className="rounded-md px-2 py-1.5 text-[11.5px] leading-relaxed"
              style={{
                color: 'var(--vc-text)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {bodyHtml ? (
                <div
                  className="announce-html lobby-html"
                  dangerouslySetInnerHTML={{ __html: bodyHtml }}
                />
              ) : (
                <Markdown text={bodyPlain} resolveRoom={resolveRoom} />
              )}
            </div>
          ) : null}

          <div
            className="relative overflow-hidden rounded-md border"
            style={{
              height: LOBBY_BANNER_HEIGHT,
              borderColor: `color-mix(in srgb, ${accent} 24%, #2a303a)`,
              background: banner
                ? `linear-gradient(145deg, color-mix(in srgb, ${accent} 22%, #12151c), #0d0f14 72%)`
                : `linear-gradient(145deg, color-mix(in srgb, ${accent} 18%, #12151c), #0d0f14 72%)`,
            }}
          >
            {banner ? (
              <SpaceCoverLayer src={banner} fit={bannerFit} className="absolute inset-0" />
            ) : null}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.5) 58%, rgba(0,0,0,0.78) 100%)',
              }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
              {photo ? (
                <img
                  src={photo}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover shadow-md"
                  style={{ border: `2.5px solid color-mix(in srgb, ${accent} 65%, #fff)` }}
                />
              ) : (
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-bold shadow-md"
                  style={{
                    background: `color-mix(in srgb, ${accent} 32%, #222)`,
                    border: `2.5px solid color-mix(in srgb, ${accent} 65%, #fff)`,
                    color: '#fff',
                  }}
                >
                  {String(name).slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="mt-1.5 min-w-0 max-w-full">
                <div className="text-[12.5px] font-bold text-white truncate drop-shadow">
                  {name}
                </div>
                {captionHtml ? (
                  <div
                    className={[
                      'text-[10.5px] mt-0.5 leading-snug line-clamp-2',
                      captionHasChips ? 'text-white/95' : 'text-white/85',
                    ].join(' ')}
                  >
                    <span
                      className="announce-html lobby-html lobby-caption-html"
                      dangerouslySetInnerHTML={{ __html: captionHtml }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="flex items-center justify-between gap-2 pt-0.5"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
          >
            <LobbyAuthor
              cfg={{
                authorName: ev.authorName || cfg.authorName,
                authorPhoto: ev.authorPhoto || cfg.authorPhoto,
                authorIcon: ev.authorIcon || cfg.authorIcon,
                authorIconValue: ev.authorIconValue || cfg.authorIconValue,
              }}
              accent={accent}
            />
          </div>
        </div>
      </article>
    </div>
  )
}

/** @deprecated Prefer LobbyJoinCard */
export function LobbyWelcomeCard(props) {
  return (
    <LobbyJoinCard
      msg={{
        lobbyEvent: {
          displayName: props.previewUser?.displayName || 'você',
          photoURL: props.previewUser?.photoURL || '',
        },
      }}
      lobby={props.lobby}
      spaceName={props.spaceName || props.roomName}
      memberCount={props.memberCount}
      resolveRoom={props.resolveRoom}
      preview
    />
  )
}

/** Leave stays compact; join routes to LobbyJoinCard. */
export function LobbyEventCard({
  msg,
  accent = '#38bdf8',
  resolveRoom = null,
  spaceName = '',
  memberCount = null,
}) {
  const ev = msg?.lobbyEvent || {}
  const type = ev.type === 'leave' ? 'leave' : 'join'

  if (type === 'join') {
    return (
      <LobbyJoinCard
        msg={msg}
        resolveRoom={resolveRoom}
        spaceName={spaceName || ev.spaceName}
        memberCount={memberCount ?? ev.memberCount}
      />
    )
  }

  const name = ev.displayName || msg?.author || 'Alguém'
  const photo = ev.photoURL || msg?.authorPhoto || ''
  const when = msg?.ts
    ? new Date(msg.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="w-full px-3 sm:px-6 my-1">
      <div
        className="inline-flex items-center gap-2 max-w-[360px] rounded-lg border px-2 py-1.5"
        style={{
          background: `color-mix(in srgb, ${accent} 7%, #14171f)`,
          borderColor: `color-mix(in srgb, ${accent} 24%, #2a303a)`,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0"
            style={{ border: `1.5px solid color-mix(in srgb, ${accent} 40%, transparent)` }}
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
            style={{
              background: `color-mix(in srgb, ${accent} 22%, #222)`,
              color: 'var(--vc-text-strong)',
            }}
          >
            {String(name).slice(0, 1).toUpperCase()}
          </div>
        )}
        <p className="text-[11.5px] text-ink leading-snug min-w-0">
          <span className="font-semibold text-strong">{name}</span>
          {' '}
          <span className="text-muted">saiu do Space</span>
          {when ? <span className="text-muted"> · {when}</span> : null}
        </p>
        <DoorClosed size={12} className="shrink-0 opacity-70" style={{ color: accent }} />
      </div>
    </div>
  )
}
