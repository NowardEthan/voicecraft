import Markdown from './markdown'
import {
  normalizeAnnounce,
  sanitizeAnnounceHtml,
  ANNOUNCE_COVER_HEIGHT,
} from './announceSchema.js'
import { SpaceCoverLayer } from '../spaces/components/SpaceCoverLayer'
import { SpaceIcon } from '../spaces/model/spaceIcons'
import EmojiReactions from '../../components/ui/EmojiReactions'
import { Star } from 'lucide-react'

const SIZE_STYLE = {
  sm: { fontSize: 12, lineHeight: 1.45 },
  md: { fontSize: 13, lineHeight: 1.5 },
  lg: { fontSize: 14.5, lineHeight: 1.5 },
}

/**
 * Rich announcement card in the chat feed — compact, message-scale.
 */
export default function AnnouncementCard({
  msg,
  resolveRoom,
  currentUserId = null,
  onToggleLike = null,
  onToggleReaction = null,
  quickReactions = ['👍', '❤️', '🔥'],
}) {
  const a = normalizeAnnounce(
    msg?.announce || { body: msg?.text || '', title: msg?.title || '' },
  )
  const accent = a.accent || '#f5b942'
  const badgeColor = a.badgeColor || accent
  const when = msg?.ts
    ? new Date(msg.ts).toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    : ''
  const bodyStyle = SIZE_STYLE[a.bodySize] || SIZE_STYLE.md
  const safeHtml = a.bodyHtml ? sanitizeAnnounceHtml(a.bodyHtml) : ''
  const canEngage = !msg?.deleted && (!!onToggleLike || !!onToggleReaction)

  return (
    <div className="w-full px-3 sm:px-6 my-2">
      <article
        className="relative overflow-hidden rounded-xl max-w-[560px]"
        style={{
          background: 'linear-gradient(165deg, #1c2029 0%, #151820 55%, #12151c 100%)',
          border: `1px solid color-mix(in srgb, ${accent} 38%, #2a303a)`,
          boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
        }}
      >
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[2.5px] z-10"
          style={{
            background: `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 35%, transparent))`,
          }}
        />

        {a.cover ? (
          <div
            className="relative w-full overflow-hidden"
            style={{
              height: ANNOUNCE_COVER_HEIGHT,
              background: `linear-gradient(145deg, color-mix(in srgb, ${accent} 20%, #151820), #12151c)`,
            }}
          >
            <SpaceCoverLayer src={a.cover} fit={a.coverFit} />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(to top, #151820 0%, rgba(21,24,32,0.35) 55%, transparent 100%)',
              }}
            />
            <div className="absolute top-2 left-3 right-3 flex items-center gap-2 z-[1]">
              <AnnouncePill color={badgeColor} label={a.badge || 'Anúncio'} />
            </div>
          </div>
        ) : null}

        <div className="pl-3.5 pr-3 pt-2.5 pb-2.5 space-y-2">
          {!a.cover && (
            <div className="flex items-center gap-2 flex-wrap">
              <AnnouncePill color={badgeColor} label={a.badge || 'Anúncio'} />
            </div>
          )}

          <div className="flex items-start gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] shrink-0 overflow-hidden"
              style={{
                background: `color-mix(in srgb, ${accent} 18%, #1a1e28)`,
                border: `1px solid color-mix(in srgb, ${accent} 40%, #2a303a)`,
                color: accent,
              }}
            >
              {a.iconImage ? (
                <img src={a.iconImage} alt="" className="w-full h-full object-cover" />
              ) : a.iconValue ? (
                <SpaceIcon value={a.iconValue} size={16} />
              ) : (
                <span aria-hidden>{a.icon || '📣'}</span>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <h3
                className="font-semibold leading-snug"
                style={{ color: 'var(--vc-text-strong)', fontSize: a.title ? 14 : 13 }}
              >
                {a.title || 'Aviso da equipe'}
              </h3>
              <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--vc-text-muted)' }}>
                Publicado no canal
                {when ? ` · ${when}` : ''}
              </p>
            </div>
          </div>

          {(safeHtml || a.body) ? (
            <div
              className="vc-announce-body rounded-lg px-2.5 py-2"
              style={{
                ...bodyStyle,
                color: 'var(--vc-text)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {safeHtml ? (
                <div
                  className="announce-html"
                  // Sanitized allowlist HTML from the announce editor.
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                />
              ) : (
                <Markdown text={a.body} resolveRoom={resolveRoom} />
              )}
            </div>
          ) : null}

          <div
            className="flex items-center gap-2 pt-1.5"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            {a.authorPhoto ? (
              <img
                src={a.authorPhoto}
                alt=""
                className="w-6 h-6 rounded-full object-cover"
                style={{ border: '1px solid rgba(255,255,255,0.12)' }}
              />
            ) : a.authorIconValue ? (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: `color-mix(in srgb, ${accent} 30%, #222)`,
                  color: accent,
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                <SpaceIcon value={a.authorIconValue} size={13} />
              </div>
            ) : a.authorIcon ? (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[12px]"
                style={{
                  background: `color-mix(in srgb, ${accent} 30%, #222)`,
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                {a.authorIcon}
              </div>
            ) : (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${accent} 30%, #222)`,
                  color: 'var(--vc-text-strong)',
                }}
              >
                {(a.authorName || 'A').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div
                className="text-[12px] font-semibold truncate"
                style={{ color: 'var(--vc-text-strong)' }}
              >
                {a.authorName || 'Equipe'}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--vc-text-muted)' }}>
                Autor do anúncio
              </div>
            </div>
          </div>

          {canEngage && (
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              {onToggleReaction && (
                <>
                  <div className="flex items-center gap-0.5">
                    {quickReactions.slice(0, 3).map((emoji) => {
                      const entry = msg.reactions?.[emoji]
                      const active = !!entry?.mine
                      return (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => onToggleReaction(msg.id, emoji)}
                          className={[
                            'h-7 min-w-7 px-1.5 rounded-full text-[13px] border transition-colors',
                            active
                              ? 'border-white/20 bg-white/[0.08]'
                              : 'border-transparent hover:bg-white/[0.05]',
                          ].join(' ')}
                          title={active ? 'Remover reação' : 'Reagir'}
                        >
                          {emoji}
                        </button>
                      )
                    })}
                  </div>
                  <EmojiReactions
                    reactions={msg.reactions || {}}
                    onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
                    onPick={(emoji) => onToggleReaction(msg.id, emoji)}
                  />
                </>
              )}
              {onToggleLike && (
                <AnnounceLikeButton
                  msg={msg}
                  currentUserId={currentUserId}
                  onToggleLike={onToggleLike}
                />
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

function AnnounceLikeButton({ msg, currentUserId, onToggleLike }) {
  const likes = Array.isArray(msg.likes) ? msg.likes : []
  const count = likes.length
  const mine = currentUserId ? likes.includes(currentUserId) : false
  const lit = mine || count > 0

  return (
    <button
      type="button"
      onClick={() => onToggleLike?.(msg.id)}
      aria-pressed={mine}
      aria-label={mine ? 'Remover curtida' : 'Curtir anúncio'}
      title={mine ? 'Remover curtida' : 'Curtir'}
      className={[
        'ml-auto inline-flex items-center gap-1 h-7 px-2 rounded-full border-2 transition-colors',
        lit
          ? 'text-like border-[var(--vc-like)] bg-[var(--vc-surface-1)]'
          : 'text-muted border-white/15 bg-[var(--vc-surface-1)] hover:text-like hover:border-[var(--vc-like)]',
      ].join(' ')}
    >
      <Star size={12} strokeWidth={mine ? 1.5 : 2} className={mine ? 'fill-like' : ''} />
      {count > 0 && (
        <span className="tabular-nums text-[11px] font-bold leading-none text-like">
          {count}
        </span>
      )}
    </button>
  )
}

function AnnouncePill({ color, label }) {
  return (
    <span
      className="inline-flex items-center h-[18px] px-1.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
      style={{
        background: `color-mix(in srgb, ${color} 22%, #111)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}
