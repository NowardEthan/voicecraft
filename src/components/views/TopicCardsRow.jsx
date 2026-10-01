/**
 * TopicCardsRow — explicit announcement highlights under the chat header.
 * Ordinary pinned messages stay in the dedicated pins panel.
 */
import { useMemo } from 'react'
import { Megaphone } from 'lucide-react'
import ChatFeatureCardFrame from '../../features/chat/cards/ChatFeatureCardFrame.jsx'
import { createAnnouncementCardViewModel } from '../../features/chat/cards/featureCardViewModels.js'

function topicCount(msg) {
  const likes = typeof msg?.likeCount === 'number' ? msg.likeCount : (msg?.likes?.length || 0)
  const reactions = msg?.reactions
    ? Object.values(msg.reactions).reduce((total, value) => {
      if (Array.isArray(value)) return total + value.length
      if (value && typeof value === 'object') {
        if (Number.isFinite(Number(value.count))) return total + Number(value.count)
        if (Array.isArray(value.users)) return total + value.users.length
      }
      return total + (Number(value) || 0)
    }, 0)
    : 0
  const total = likes + reactions
  return total > 0 ? total : null
}

export default function TopicCardsRow({ messages = [], accent = 'var(--space-accent)', onJump }) {
  const topics = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const message of Array.isArray(messages) ? messages : []) {
      const id = message?.id || message?.firestoreId
      const explicitAnnouncement = message?.kind === 'announce' || !!message?.announce
      if (!id || message.deleted || !explicitAnnouncement || seen.has(String(id))) continue
      seen.add(String(id))
      result.push({
        id,
        vm: createAnnouncementCardViewModel(message, { variant: 'highlight', maxLength: 80, accent }),
        count: topicCount(message),
        ts: message.createdAt || message.ts || 0,
      })
    }
    return result.sort((left, right) => (right.ts || 0) - (left.ts || 0)).slice(0, 6)
  }, [messages, accent])

  if (topics.length === 0) return null

  return (
    <section className="vc-topic-strip shrink-0 px-3 sm:px-5 pb-3 pt-1.5" aria-label="Destaques da conversa">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted mb-2 px-0.5">Destaques</p>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 -mx-0.5 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {topics.map(({ id, vm, count }) => (
          <ChatFeatureCardFrame
            key={id}
            as="button"
            type="button"
            compact
            interactive
            accent={vm.accent || accent}
            className="vc-topic-card"
            onClick={() => onJump?.(id)}
            badge={<span>Destaque</span>}
            icon={<Megaphone size={14} strokeWidth={2.1} aria-hidden />}
            title={<span>{vm.title}</span>}
            body={vm.snippet && vm.snippet !== vm.title ? <span>{vm.snippet}</span> : null}
            status={count != null ? <span>{count} {count === 1 ? 'interação' : 'interações'}</span> : null}
            aria-label={`Ir para destaque: ${vm.title}`}
          />
        ))}
      </div>
    </section>
  )
}
