/**
 * MessageBubble — bubble-style layout (Telegram/Discord hybrid).
 *
 *   - Todas as mensagens ficam à ESQUERDA (estilo Slack), com avatar.
 *   - "Minhas" mensagens (isMine=true) usam bolha filled com a cor do autor.
 *   - Mensagens dos outros (isMine=false) usam bolha mais sutil (surface-2).
 *   - Continuação do grupo: só o texto, grudado embaixo.
 *   - Action bar (Copy / Reply / Pin / Delete) no hover, alinhada ao
 *     header da mensagem (lado direito do timestamp).
 *
 * Estrutura:
 *   <MessageRow>
 *     <AvatarColumn />          — 36px (ou placeholder de hora, em continuação)
 *     <MessageBody>
 *       <MessageHeader />       — nome + pinned + timestamp + action bar
 *       <Bubble />              — a mensagem em si
 *     </MessageBody>
 *   </MessageRow>
 *
 * Mantém compatibilidade com o pipeline existente (MessageList passa
 * `isMine`, `showHeader`, `isLast`, `pinned`, callbacks etc.). A cor do
 * autor chega via `authorColor` (string HSL/hex) — opcional; cai num
 * fallback neutro se ausente.
 */
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Pin, PinOff, CornerUpLeft, Copy, Check, XCircle, Trash2, Star, SmilePlus,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PersonAvatar } from '../../features/people'
import Markdown from '../../features/chat/markdown'
import { resolveChatDensity } from './chatDensity'
import AnnouncementCard from '../../features/chat/AnnouncementCard'
import { LobbyWelcomeCard, LobbyEventCard } from '../../features/chat/LobbyCards'
import { isLobbyEventMessage, isLobbyWelcomeMessage } from '../../features/chat/lobbySchema'
import EmojiPicker from '../ui/EmojiPicker'
import EmojiReactions from '../ui/EmojiReactions'

const AVATAR = 36

function formatMessageTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatClock(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/* Converte qualquer cor (hex ou hsl(...)) num par (rgba, lum) para que a
 * bolha filled do autor possa usar opacidade sem virar rosa chapado.
 * Para hsl() simples, abreviamos a 12% via color-mix no CSS; para hex,
 * caímos em hexToRgba direto.                                          */
function bubbleFill(authorColor, isMine) {
  if (!isMine) {
    return 'var(--vc-surface-2)'
  }
  const c = authorColor || 'hsl(220, 14%, 52%)'
  /* Mantém a tonalidade do autor mas a 12% — flat, premium.
   * color-mix funciona com qualquer CSS color, incluindo hsl().        */
  return `color-mix(in srgb, ${c} 14%, transparent)`
}

function bubbleRing(authorColor, isMine) {
  if (!isMine) return '1px solid rgba(255,255,255,0.04)'
  const c = authorColor || 'hsl(220, 14%, 52%)'
  return `1px solid color-mix(in srgb, ${c} 22%, transparent)`
}

function bubbleShape(isMine, hasHeader) {
  /* Telegram-like: canto que aponta para o autor levemente menor.
   *  - mine + header : top-right menor (chat head)
   *  - mine + cont   : all four equal (compact wrap)
   *  - peer + header : top-left menor
   *  - peer + cont   : all four equal                                */
  if (hasHeader) {
    return isMine
      ? 'rounded-[18px] rounded-tr-md'
      : 'rounded-[18px] rounded-tl-md'
  }
  return 'rounded-[18px]'
}

/* === Sub-componentes ============================================== */

/** Coluna do avatar — tamanho segue a densidade do chat. */
function AvatarColumn({ showHeader, photoURL, label, userId, compactTime, size = AVATAR }) {
  const handleOpenProfile = () => {
    if (!userId) return
    if (typeof window !== 'undefined' && typeof window.__vcOpenProfile === 'function') {
      window.__vcOpenProfile(userId)
    }
  }

  const colW = Math.max(28, size + 2)

  return (
    <div
      className="shrink-0 flex justify-center self-start mr-2 pt-0.5"
      style={{ width: colW }}
    >
      {showHeader ? (
        <button
          type="button"
          onClick={handleOpenProfile}
          title={`Ver perfil de ${label}`}
          aria-label={`Abrir perfil de ${label}`}
          className={
            'group/avatar relative rounded-full ' +
            'transition-transform duration-150 ' +
            'hover:scale-110 hover:ring-2 hover:ring-accent/60 ' +
            'focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-accent ' +
            'focus-visible:outline-none cursor-pointer'
          }
        >
          <PersonAvatar
            src={photoURL}
            name={label}
            userId={userId}
            size={size}
          />
        </button>
      ) : (
        <span className="text-[10px] text-transparent hover:text-muted transition-colors tabular-nums leading-5 mb-1 select-none">
          {compactTime}
        </span>
      )}
    </div>
  )
}

/** Action bar — Copy / React / Reply / Pin / Delete. Shared by header
 *  rows and follow-up bubbles (grouped messages without a header).   */
function MessageActionBar({
  msg,
  copyState,
  onCopy,
  onReply,
  onTogglePin,
  onToggleReaction,
  quickReactions,
  onDelete,
  showPinButton,
  canDelete,
  pinned,
  className = '',
}) {
  if (msg.deleted) return null
  return (
    <div
      className={
        'inline-flex items-center gap-0.5 p-0.5 rounded-lg shrink-0 ' +
        'bg-surface1/95 border border-white/[0.08] shadow-md ' +
        'opacity-0 group-hover:opacity-100 focus-within:opacity-100 ' +
        'transition-opacity ' +
        className
      }
    >
      <button
        type="button"
        onClick={onCopy}
        className={
          'w-6 h-6 rounded-md flex items-center justify-center ' +
          'transition-all duration-200 ' +
          (copyState === 'copied'
            ? 'text-positive bg-positive/15 scale-110'
            : copyState === 'error'
              ? 'text-danger bg-danger/15'
              : 'text-muted hover:text-strong hover:bg-white/[0.06]')
        }
        title={
          copyState === 'copied'
            ? 'Copiado!'
            : copyState === 'error'
              ? 'Falha ao copiar'
              : 'Copiar texto'
        }
        aria-label={
          copyState === 'copied'
            ? 'Mensagem copiada'
            : copyState === 'error'
              ? 'Falha ao copiar'
              : 'Copiar texto'
        }
        aria-live="polite"
      >
        {copyState === 'copied' ? (
          <Check size={12} strokeWidth={2.4} className="animate-scale-in" />
        ) : copyState === 'error' ? (
          <XCircle size={12} strokeWidth={2.4} />
        ) : (
          <Copy size={12} strokeWidth={1.8} />
        )}
      </button>
      {onToggleReaction && quickReactions && quickReactions.map((emoji) => {
        const mine = !!msg.reactions?.[emoji]?.mine
        return (
          <button
            key={`qr-${emoji}`}
            type="button"
            onClick={() => onToggleReaction(msg.id, emoji)}
            aria-pressed={mine}
            aria-label={`Reagir ${emoji}`}
            title={mine ? `Remover ${emoji}` : `Reagir ${emoji}`}
            className={
              'w-6 h-6 rounded-md flex items-center justify-center text-[13px] leading-none transition-all duration-150 ' +
              (mine
                ? 'bg-warning/20 ring-1 ring-warning/40 scale-105 hover:bg-warning/25'
                : 'hover:bg-white/[0.06] hover:scale-110')
            }
          >
            {emoji}
          </button>
        )
      })}
      {onToggleReaction && (
        <ReactionPickerButton msg={msg} onToggleReaction={onToggleReaction} />
      )}
      {onReply && (
        <button
          type="button"
          onClick={() => onReply(msg)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06] transition-colors"
          title="Responder"
          aria-label="Responder"
        >
          <CornerUpLeft size={12} strokeWidth={1.8} />
        </button>
      )}
      {showPinButton && (
        <button
          type="button"
          onClick={() => onTogglePin(msg.id)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-warning hover:bg-white/[0.06] transition-colors"
          title={pinned ? 'Desafixar' : 'Fixar'}
          aria-label={pinned ? 'Desafixar mensagem' : 'Fixar mensagem'}
        >
          {pinned ? <PinOff size={12} strokeWidth={1.8} /> : <Pin size={12} strokeWidth={1.8} />}
        </button>
      )}
      {canDelete && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(msg.id)}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-white/[0.06] transition-colors"
          title="Excluir"
          aria-label="Excluir mensagem"
        >
          <Trash2 size={12} strokeWidth={1.8} />
        </button>
      )}
    </div>
  )
}

/** Header da mensagem — nome + (badge fixada) + timestamp à
 *  esquerda; action bar à direita. Some em mensagens apagadas.       */
function MessageHeader({
  label,
  pinned,
  time,
  msg,
  copyState,
  onCopy,
  onReply,
  onTogglePin,
  onToggleReaction,
  quickReactions,
  onDelete,
  canPin,
  showPinButton,
  canDelete,
  headerText = 'text-[13px]',
  timeText = 'text-[11px]',
}) {
  return (
    <div className="flex items-center gap-2 min-w-0 mb-1 leading-snug">
      <div className="flex items-baseline gap-2 min-w-0">
        <span className={`${headerText} font-semibold truncate ${msg.deleted ? 'text-strong/60' : 'text-strong'}`}>
          {label}
        </span>
        {pinned && !msg.deleted && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] text-warning font-semibold shrink-0"
            title="Mensagem fixada"
          >
            <Pin size={10} strokeWidth={2.4} className="fill-warning/30" />
            FIXADA
          </span>
        )}
        <span className={`${timeText} text-muted tabular-nums shrink-0`}>
          {time}
        </span>
      </div>

      <MessageActionBar
        className="ml-auto"
        msg={msg}
        copyState={copyState}
        onCopy={onCopy}
        onReply={onReply}
        onTogglePin={onTogglePin}
        onToggleReaction={onToggleReaction}
        quickReactions={quickReactions}
        onDelete={onDelete}
        showPinButton={showPinButton}
        canDelete={canDelete}
        pinned={pinned}
      />
    </div>
  )
}

/** Bolha — cresce com o texto (uma linha) até o max-width; só quebra
 *  em newline do usuário ou quando atinge o teto da coluna.         */
function Bubble({ shape, fill, ring, showHeader, children, interactive = false, likeContent = null }) {
  return (
    <div
      className={
        'relative align-top ' +
        shape + (interactive ? ' select-none' : '')
      }
      style={{
        backgroundColor: fill,
        boxShadow: ring,
        padding: showHeader ? '8px 12px' : '6px 12px',
        color: 'var(--vc-text-strong)',
        /* max-content prefers a single line; max-w-full caps at the column. */
        width: 'max-content',
        maxWidth: '100%',
        overflowWrap: 'break-word',
        wordBreak: 'normal',
      }}
    >
      {children}
      {likeContent}
    </div>
  )
}

/** ReactionPickerButton — "+" na action bar que abre o EmojiPicker
 *  ancorado a si mesmo. Portal pro body pra nunca ser cortado pelo
 *  scroller. Fecha em outside-click e Escape.                          */
function ReactionPickerButton({ msg, onToggleReaction }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const pickerRef = useRef(null)

  const place = () => {
    const rect = btnRef.current?.getBoundingClientRect?.()
    if (!rect) return
    const W = 300
    const H = 264
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceAbove > H + 12 || spaceAbove > spaceBelow
    const top = openUp ? rect.top - H - 8 : rect.bottom + 8
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8))
    setPos({ top, left })
  }

  const handleToggle = () => {
    if (open) { setOpen(false); return }
    place()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onReposition = () => place()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        title="Mais reações"
        aria-label="Abrir seletor de reações"
        aria-expanded={open}
        className="w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-warning hover:bg-white/[0.06] transition-colors"
      >
        <SmilePlus size={12} strokeWidth={1.8} />
      </button>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={pickerRef}
          className="fixed z-[80] animate-fade-in-up"
          style={{ top: pos.top, left: pos.left, width: 300 }}
          onWheel={(e) => e.stopPropagation()}
        >
          <EmojiPicker
            compact
            onPick={(em) => {
              onToggleReaction(msg.id, em)
              setOpen(false)
            }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

/** Render do texto — markdown ou placeholder de "apagada".          */
function MessageText({ msg, resolveRoom }) {
  if (msg.deleted) {
    return <span className="text-muted italic text-[14px]">mensagem apagada</span>
  }
  if (!msg.text) return null
  return <Markdown text={msg.text} resolveRoom={resolveRoom} />
}

/** LikeButton — Star com fundo = cor da bolha, abaixo da bolha,
 *  alinhado à esquerda. Ao curtir: "super like" animation com
 *  partículas voando, bounce + wobble + flash de luz.
 *
 *  Cor padrão do like = amarelo (--vc-like), sempre que houver
 *  curtidas (suas ou de outros). Só o estado vazio (0 likes) fica
 *  neutro e aparece no hover.
 *  Click → onToggleLike(msg.id).                                       */
function LikeButton({ msg, currentUserId, onToggleLike, bubbleFill = null }) {
  const likes = Array.isArray(msg.likes) ? msg.likes : []
  const count = likes.length
  const mine = currentUserId ? likes.includes(currentUserId) : false
  const lit = mine || count > 0

  /* Key pra remontar a árvore de partículas a cada curtida — força
   * o AnimatePresence a disparar a animação toda de novo.           */
  const [burstKey, setBurstKey] = useState(0)
  /* Flag que libera o "super like" animation. Só fica true no
   * instante da transição false→true. Em remounts (chat trocado,
   * message retornou já curtida), começa false e a animação não
   * dispara, mesmo com mine=true.                                   */
  const [animating, setAnimating] = useState(false)
  const wasMine = usePrevious(mine)
  useEffect(() => {
    if (mine && !wasMine) {
      setBurstKey((k) => k + 1)
      setAnimating(true)
      const t = setTimeout(() => setAnimating(false), 700)
      return () => clearTimeout(t)
    }
  }, [mine, wasMine])

  const handle = () => { onToggleLike?.(msg.id) }

  /* 8 partículas em direções aleatórias (determinísticas por key). */
  const particles = makeBurstParticles(burstKey)

  return (
    <motion.button
      type="button"
      onClick={handle}
      aria-pressed={mine}
      aria-label={mine ? 'Remover curtida' : 'Curtir mensagem'}
      title={mine ? 'Remover curtida' : 'Curtir'}
      animate={
        animating
          ? { scale: [1, 1.45, 0.9, 1.12, 1], rotate: [0, -10, 12, -6, 0] }
          : { scale: 1, rotate: 0 }
      }
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      /* Fundo sólido. Com likes = borda/ícone/contador dourados
       * (padrão do like). Sem likes = neutro, só no hover. */
      className={
        'absolute -bottom-2.5 -right-2.5 z-10 ' +
        'inline-flex items-center gap-1 px-2 h-7 rounded-full ' +
        'overflow-visible ' +
        'transition-all duration-200 border-2 ' +
        (lit
          ? 'text-like shadow-lg hover:brightness-110'
          : 'shadow-md border-white/15 text-muted hover:text-like hover:border-[var(--vc-like)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100')
      }
      style={{
        backgroundColor: 'var(--vc-surface-1)',
        borderColor: lit ? 'var(--vc-like)' : 'rgba(255,255,255,0.15)',
      }}
    >
      <Star
        size={13}
        strokeWidth={mine ? 1.5 : 2}
        className={mine ? 'fill-like' : ''}
      />
      {count > 0 && (
        <span className="tabular-nums text-[11px] font-bold leading-none text-like">
          {count}
        </span>
      )}

      {/* Flash de luz pulsando atrás do botão quando curtido */}
      {animating && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, var(--vc-like-glow) 0%, rgba(251,191,36,0) 70%)',
          }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], scale: [0.6, 1.9, 2.6] }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
          key={`flash-${burstKey}`}
        />
      )}

      {/* Partículas — voam pra fora ao curtir. Renderizadas como
          filhas do botão pra herdar position: relative.              */}
      <AnimatePresence>
        {animating && particles.map((p, i) => (
          <motion.span
            key={`${burstKey}-${i}`}
            aria-hidden
            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
            style={{
              background: i % 2 === 0 ? '#fbbf24' : '#fde047',
              boxShadow: '0 0 6px currentColor',
              marginLeft: -3,
              marginTop: -3,
              color: i % 2 === 0 ? '#fbbf24' : '#fde047',
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(p.angle) * p.distance,
              y: Math.sin(p.angle) * p.distance,
              opacity: [1, 1, 0],
              scale: [0.4, 1, 0.2],
            }}
            exit={{ opacity: 0 }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: [0.16, 1, 0.3, 1],
            }}
          />
        ))}
      </AnimatePresence>
    </motion.button>
  )
}

/** Gera 8 partículas com ângulos uniformemente distribuídos mas com
 *  pequena variação aleatória (determinística pela key — mesmo key
 *  gera mesmo burst pra evitar animação pulando em re-renders).    */
function makeBurstParticles(key) {
  const N = 8
  const base = (key * 137) % 360  // ângulo inicial pseudo-aleatório
  return Array.from({ length: N }, (_, i) => {
    const angle = ((base + (360 / N) * i) * Math.PI) / 180
    return {
      angle,
      distance: 28 + ((i * 7 + key * 3) % 12),
      duration: 0.55 + ((i * 13) % 8) / 20,
      delay: (i % 3) * 0.02,
    }
  })
}

/** Hook pra guardar valor anterior (sem deps extras). */
function usePrevious(value) {
  const [pair, setPair] = useState({ prev: value, current: value })
  if (pair.current !== value) {
    setPair({ prev: pair.current, current: value })
  }
  return pair.prev
}

/* === Componente principal ========================================= */

export default function MessageBubble({
  msg,
  isMine,
  showHeader,
  isLast = false,
  author,
  authorColor = null,
  resolveRoom = null,
  pinned = false,
  canPin = false,
  canModerate = false,
  onReply = null,
  onTogglePin = null,
  onToggleLike = null,
  onToggleReaction = null,
  quickReactions = ['👍', '❤️', '🔥'],
  onDelete = null,
  currentUserId = null,
  density = 'confortavel',
}) {
  const dens = resolveChatDensity(density)
  const [copyState, setCopyState] = useState('idle') // 'idle' | 'copied' | 'error'

  // Rich announce card (new) + upgrade long legacy sys posts that were
  // published before kind:"announce" existed.
  if (isLobbyWelcomeMessage(msg)) {
    return (
      <LobbyWelcomeCard
        lobby={msg.lobby || msg.announce}
        roomName={msg.roomName}
      />
    )
  }

  if (isLobbyEventMessage(msg)) {
    return (
      <LobbyEventCard
        msg={msg}
        accent={msg.lobbyAccent || msg.lobbyEvent?.accent || '#38bdf8'}
        resolveRoom={resolveRoom}
        spaceName={msg.lobbyEvent?.spaceName || ''}
        memberCount={msg.lobbyEvent?.memberCount}
      />
    )
  }

  if (msg.kind === 'announce' || msg.announce) {
    return (
      <AnnouncementCard
        msg={msg}
        resolveRoom={resolveRoom}
        currentUserId={currentUserId}
        onToggleLike={onToggleLike}
        onToggleReaction={onToggleReaction}
        quickReactions={quickReactions}
      />
    )
  }

  if (msg.kind === 'sys') {
    const text = String(msg.text || '')
    const looksLikeAnnounce = text.length > 60 || text.includes('\n')
    if (looksLikeAnnounce) {
      return (
        <AnnouncementCard
          msg={{
            ...msg,
            kind: 'announce',
            announce: {
              title: '',
              body: text,
              icon: '📣',
              badge: 'Anúncio',
              authorName: msg.author || 'Equipe',
              authorPhoto: msg.authorPhoto || '',
              accent: '#f5b942',
              bodySize: 'md',
            },
          }}
          resolveRoom={resolveRoom}
          currentUserId={currentUserId}
          onToggleLike={onToggleLike}
          onToggleReaction={onToggleReaction}
          quickReactions={quickReactions}
        />
      )
    }
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-muted">{msg.text}</span>
      </div>
    )
  }

  const authorLabel = author?.displayName || msg.author || (isMine ? 'você' : 'convidado')
  const authorPhoto = author?.photoURL || msg.authorPhoto || ''
  const authorId = author?.userId || msg.authorId || null
  const time = formatMessageTime(msg.ts)
  const compactTime = formatClock(msg.ts)
  const canDelete = !!onDelete && (isMine || canModerate)
  const showPinButton = canPin && !!onTogglePin

  const handleCopy = async () => {
    const text = msg.text || ''
    /* Tenta o caminho moderno (Clipboard API). Se falhar, cai pra
     * fallback via textarea + execCommand('copy') — funciona em
     * contextos sem permissão (ex: http, iframe).                    */
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        ok = true
      } else {
        throw new Error('Clipboard API indisponível')
      }
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.top = '-9999px'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    setCopyState(ok ? 'copied' : 'error')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  const fill = bubbleFill(authorColor, isMine)
  const ring = bubbleRing(authorColor, isMine)
  const shape = bubbleShape(isMine, showHeader)

  const actionBarProps = {
    msg,
    copyState,
    onCopy: handleCopy,
    onReply,
    onTogglePin,
    onToggleReaction,
    quickReactions,
    onDelete,
    showPinButton,
    canDelete,
    pinned,
  }

  return (
    <div
      data-msg-id={msg.id}
      data-msg-author={authorId || ''}
      data-msg-mine={isMine ? '1' : '0'}
      data-msg-color={authorColor || ''}
      data-chat-density={dens.key}
      className={
        'group relative flex w-full min-w-0 justify-start ' +
        (showHeader ? dens.msgHeaderMt : dens.msgFollowMt) + ' ' +
        'px-2 sm:px-3'
      }
      onDoubleClick={
        onToggleLike && !msg.deleted
          ? (e) => {
              /* Evita acionar quando o double-click foi em controles
               * interativos (botões do action bar, like button).    */
              const tgt = e.target
              if (tgt && tgt.closest && tgt.closest('button, a, [role="button"]')) return
              e.preventDefault()
              onToggleLike(msg.id)
            }
          : undefined
      }
    >
      <AvatarColumn
        showHeader={showHeader}
        photoURL={authorPhoto}
        label={authorLabel}
        userId={authorId}
        compactTime={compactTime}
        size={dens.avatar}
      />

      <div className="relative flex flex-col max-w-[min(78%,640px)] items-start min-w-0">
        {showHeader && (
          <MessageHeader
            label={authorLabel}
            pinned={pinned}
            time={time}
            canPin={canPin}
            headerText={dens.headerText}
            timeText={dens.timeText}
            {...actionBarProps}
          />
        )}

        {/* Follow-up messages in a group have no header — still need
            the same hover actions (delete/reply/react/copy).         */}
        {!showHeader && !msg.deleted && (
          <MessageActionBar
            {...actionBarProps}
            className="absolute left-full top-0 ml-2 z-20"
          />
        )}

        <div className="flex flex-col items-start gap-1.5 max-w-full">
          <Bubble
            shape={shape}
            fill={fill}
            ring={ring}
            showHeader={showHeader}
            interactive={!!onToggleLike && !msg.deleted}
            likeContent={
              onToggleLike ? (
                <LikeButton
                  msg={msg}
                  currentUserId={currentUserId}
                  onToggleLike={onToggleLike}
                  bubbleFill={msg.deleted ? null : fill}
                />
              ) : null
            }
          >
            <div className={`${dens.bubbleText} text-strong/90`}>
              <MessageText msg={msg} resolveRoom={resolveRoom} />
              {!msg.deleted && msg.edited && (
                <span className="ml-1 text-[10px] text-muted italic">(editada)</span>
              )}
            </div>
          </Bubble>
          {onToggleReaction && !msg.deleted && (
            <EmojiReactions
              reactions={msg.reactions || {}}
              hideAdd
              onToggle={(emoji) => onToggleReaction(msg.id, emoji)}
              onPick={(emoji) => onToggleReaction(msg.id, emoji)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
