/**
 * TopicCardsRow — horizontal “Tópicos de hoje” under the chat header.
 * Sourced from pinned + recent announce messages; hidden when empty.
 */
import { useMemo } from 'react'
import { Megaphone, Pin } from 'lucide-react'

function topicTitle(msg) {
  if (msg?.announce?.title) return String(msg.announce.title)
  if (msg?.lobby?.title) return String(msg.lobby.title)
  const text = String(msg?.text || '').trim()
  if (!text) return msg?.pinned ? 'Mensagem fixada' : 'Anúncio'
  const line = text.split(/\n/)[0]
  return line.length > 48 ? `${line.slice(0, 45)}…` : line
}

function topicSnippet(msg) {
  if (msg?.announce?.body) return String(msg.announce.body).slice(0, 80)
  if (msg?.lobby?.body) return String(msg.lobby.body).slice(0, 80)
  const text = String(msg?.text || '').trim()
  if (!text) return ''
  const rest = text.includes('\n') ? text.split(/\n/).slice(1).join(' ') : text
  return rest.length > 80 ? `${rest.slice(0, 77)}…` : rest
}

function topicCount(msg) {
  const likes = typeof msg?.likeCount === 'number' ? msg.likeCount : (msg?.likes?.length || 0)
  const reactions = msg?.reactions
    ? Object.values(msg.reactions).reduce((n, v) => n + (Array.isArray(v) ? v.length : Number(v) || 0), 0)
    : 0
  const total = likes + reactions
  return total > 0 ? total : null
}

export default function TopicCardsRow({
  messages = [],
  accent = 'var(--space-accent)',
  onJump,
}) {
  const topics = useMemo(() => {
    const list = Array.isArray(messages) ? messages : []
    const seen = new Set()
    const out = []
    for (const m of list) {
      if (!m?.id || m.deleted || seen.has(m.id)) continue
      const isAnnounce = m.kind === 'announce' || !!m.announce
      const isPinned = !!m.pinned
      if (!isAnnounce && !isPinned) continue
      seen.add(m.id)
      out.push({
        id: m.id,
        title: topicTitle(m),
        snippet: topicSnippet(m),
        count: topicCount(m),
        kind: isAnnounce ? 'announce' : 'pin',
        ts: m.createdAt || m.ts || 0,
      })
    }
    out.sort((a, b) => (b.ts || 0) - (a.ts || 0))
    return out.slice(0, 6)
  }, [messages])

  if (topics.length === 0) return null

  return (
    <div className="vc-topic-strip shrink-0 px-3 sm:px-5 pb-3 pt-1.5" aria-label="Tópicos de hoje">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2 px-0.5">
        Tópicos de hoje
      </p>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 -mx-0.5 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {topics.map((t) => {
          const Icon = t.kind === 'announce' ? Megaphone : Pin
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onJump?.(t.id)}
              className="vc-topic-card group shrink-0 w-[200px] text-left rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] px-3 py-2.5 transition-colors"
            >
              <div className="flex items-start gap-2 min-w-0">
                <span className="mt-0.5 shrink-0" style={{ color: accent }} aria-hidden>
                  <Icon size={14} strokeWidth={2.1} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-strong truncate leading-tight">
                    {t.title}
                  </p>
                  {t.snippet ? (
                    <p className="text-[11px] text-muted line-clamp-2 mt-0.5 leading-snug">
                      {t.snippet}
                    </p>
                  ) : null}
                  {t.count != null ? (
                    <p className="text-[10px] text-muted mt-1 tabular-nums">
                      {t.count} {t.count === 1 ? 'interação' : 'interações'}
                    </p>
                  ) : null}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
