import { useEffect, useRef, useState } from 'react'
import {
  BellDot, Bookmark, Check, Copy, CornerUpLeft, FileText, Hash, MoreHorizontal,
  Pencil, Pin, PinOff, RotateCcw, Trash2, XCircle,
} from 'lucide-react'
import { PersonAvatar } from '../../features/people'
import Markdown from '../../features/chat/markdown'
import { resolveChatDensity } from './chatDensity'
import AnnouncementCard from '../../features/chat/AnnouncementCard'
import ChatFeatureCardFrame from '../../features/chat/cards/ChatFeatureCardFrame.jsx'
import { createSystemCardViewModel } from '../../features/chat/cards/featureCardViewModels.js'
import { LobbyWelcomeCard, LobbyEventCard } from '../../features/chat/LobbyCards'
import { isLobbyEventMessage, isLobbyWelcomeMessage } from '../../features/chat/lobbySchema'
import EmojiReactions, { EngagementTray } from '../ui/EmojiReactions'
import { actionIdOf } from '../../features/chat/messageIdentity.js'
import { AnchoredOverlay } from '../../shared/motion/AnchoredOverlay.jsx'

function formatMessageTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function isImageAttachment(attachment) {
  return !!attachment && (attachment.kind === 'image' || String(attachment.type || '').startsWith('image/'))
}

function attachmentSrc(attachment) {
  return attachment?.url || attachment?.dataUrl || attachment?.previewUrl || null
}

function formatBytes(value) {
  const size = Number(value)
  if (!Number.isFinite(size)) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

async function writeClipboard(value) {
  const text = String(value || '')
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const input = document.createElement('textarea')
      input.value = text
      input.style.cssText = 'position:fixed;top:-9999px;opacity:0'
      document.body.appendChild(input)
      input.select()
      const result = document.execCommand('copy')
      input.remove()
      return result
    } catch {
      return false
    }
  }
}

function AvatarColumn({ showHeader, photoURL, label, userId, compactTime, size }) {
  if (!showHeader) {
    return <span className="vc-conversation-message__continuation-time" aria-hidden>{compactTime}</span>
  }
  const avatar = <PersonAvatar src={photoURL} name={label} userId={userId} size={size} />
  if (!userId) return <span className="vc-conversation-message__avatar" aria-hidden>{avatar}</span>
  return (
    <button
      type="button"
      className="vc-conversation-message__avatar is-actionable"
      onClick={() => window.__vcOpenProfile?.(userId)}
      aria-label={`Abrir perfil de ${label}`}
      title={`Ver perfil de ${label}`}
    >
      {avatar}
    </button>
  )
}


function MessageMoreMenu({
  message, roomKey, onCopyText, onEdit, onTogglePin, onMarkUnread, onDelete,
  onOpenThread, pinned, replyCount,
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const [bookmarked, setBookmarked] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const actionId = actionIdOf(message)
  const storageKey = `voicecraft:bookmarks:${roomKey || 'global'}`

  useEffect(() => {
    try {
      setBookmarked(JSON.parse(localStorage.getItem(storageKey) || '[]').map(String).includes(String(actionId)))
    } catch {
      setBookmarked(false)
    }
  }, [storageKey, actionId])


  const toggle = () => {
    if (open) return setOpen(false)
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(232, window.innerWidth - 16)
    const estimatedHeight = 360
    const top = rect.bottom + estimatedHeight <= window.innerHeight - 8
      ? rect.bottom + 6
      : Math.max(8, rect.top - estimatedHeight - 6)
    setPosition({ width, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)), top })
    setOpen(true)
  }

  const act = (callback) => {
    setOpen(false)
    callback?.()
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const handleMenuKey = (event) => {
    const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])]
    const current = items.indexOf(document.activeElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      items[(current + delta + items.length) % items.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus()
    }
  }

  const toggleBookmark = () => {
    try {
      const current = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]').map(String))
      if (bookmarked) current.delete(String(actionId))
      else current.add(String(actionId))
      localStorage.setItem(storageKey, JSON.stringify([...current]))
      setBookmarked(!bookmarked)
    } catch {
      // Local bookmarks are optional; storage failures do not affect chat.
    }
  }

  const item = (label, Icon, callback, danger = false) => (
    <button type="button" role="menuitem" className={danger ? 'is-danger' : ''} onClick={() => act(callback)}>
      <Icon size={15} aria-hidden /><span>{label}</span>
    </button>
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="Mais ações da mensagem"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Mais ações"
      >
        <MoreHorizontal size={17} aria-hidden />
      </button>
      <AnchoredOverlay
        open={open && !!position}
        ref={menuRef}
        anchorRef={buttonRef}
        onClose={() => setOpen(false)}
        placement="top"
        initialFocus
        role="menu"
        aria-label="Ações da mensagem"
        className="vc-message-menu vc-conversation-popover"
        style={position || undefined}
        onKeyDown={handleMenuKey}
      >
          {onEdit && item('Editar mensagem', Pencil, () => onEdit(actionId))}
          {onTogglePin && item(pinned ? 'Desafixar mensagem' : 'Fixar mensagem', pinned ? PinOff : Pin, () => onTogglePin(actionId))}
          {onOpenThread && item(replyCount > 0 ? `Abrir respostas (${replyCount})` : 'Abrir thread', CornerUpLeft, () => onOpenThread(message))}
          {item('Copiar texto', Copy, onCopyText)}
          {actionId && item('Copiar ID', Hash, () => writeClipboard(actionId))}
          {actionId && item(bookmarked ? 'Remover dos salvos' : 'Salvar mensagem', Bookmark, toggleBookmark)}
          {onMarkUnread && item('Marcar como não lida daqui', BellDot, () => onMarkUnread(message))}
          {onDelete && item('Excluir mensagem', Trash2, () => onDelete(actionId), true)}
      </AnchoredOverlay>
    </>
  )
}

function MessageActionBar({
  message, currentUserId, quickReactions, onToggleReaction, onToggleLike, onReply, menuProps,
  inline = false,
}) {
  if (message.deleted) return null
  const actionId = actionIdOf(message)
  return (
    <EngagementTray
      className={inline ? 'vc-message-engagement-inline' : 'vc-conversation-message__actions'}
      label={inline ? 'Engagement da mensagem' : 'A\u00e7\u00f5es r\u00e1pidas da mensagem'}
      reactions={message.reactions || {}}
      likes={message.likes || []}
      currentUserId={currentUserId}
      quickReactions={inline ? [] : quickReactions}
      onToggleLike={onToggleLike ? () => onToggleLike(actionId) : null}
      onToggleReaction={onToggleReaction ? (emoji) => onToggleReaction(actionId, emoji) : null}
    >
      {onReply && (
        <button type="button" onClick={() => onReply(message)} aria-label={'Responder \u00e0 mensagem'} title="Responder">
          <CornerUpLeft size={16} aria-hidden />
        </button>
      )}
      <MessageMoreMenu message={message} {...menuProps} />
    </EngagementTray>
  )
}

function MessageText({ message, resolveRoom, onRoomMention, searchQuery }) {
  if (message.deleted) return <span className="vc-conversation-message__deleted">Mensagem apagada</span>
  if (!message.text) return null
  return <Markdown text={message.text} resolveRoom={resolveRoom} onRoomMention={onRoomMention} mentions={message.mentions} searchQuery={searchQuery} />
}

function MediaImage({ src, alt, className = '', onClick, overlay = null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`vc-conversation-media-fallback ${className}`} role="img" aria-label={`${alt || 'Imagem'} indisponível`}>
        <FileText size={19} aria-hidden /><span>Imagem indisponível</span>
      </div>
    )
  }
  return (
    <button type="button" className={`vc-conversation-media ${className}`} onClick={onClick} aria-label={`Ampliar ${alt || 'imagem'}`}>
      <img src={src} alt={alt || 'Imagem enviada'} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      {overlay}
    </button>
  )
}

function AttachmentBlock({ attachment, attachments, onImageClick, hasText }) {
  const list = Array.isArray(attachments) && attachments.length ? attachments : (attachment ? [attachment] : [])
  if (!list.length) return null
  const images = list.filter(isImageAttachment)
  const files = list.filter((item) => !isImageAttachment(item))
  const imageSources = images.map(attachmentSrc).filter(Boolean)
  const openGallery = (index) => {
    if (!imageSources.length) return
    const source = attachmentSrc(images[index])
    const mappedIndex = Math.max(0, imageSources.indexOf(source))
    onImageClick?.(imageSources, mappedIndex)
  }

  return (
    <div className={`vc-conversation-attachments ${hasText ? 'has-text' : ''}`}>
      {images.length === 1 && (
        <MediaImage src={attachmentSrc(images[0])} alt={images[0].name || (images[0].sticker ? 'Sticker' : 'Imagem')} className={images[0].sticker ? 'is-sticker' : 'is-single'} onClick={() => openGallery(0)} />
      )}
      {images.length > 1 && (
        <div className={`vc-conversation-gallery count-${Math.min(images.length, 4)}`}>
          {images.slice(0, 4).map((image, index) => {
            const extra = images.length > 4 && index === 3 ? images.length - 4 : 0
            return (
              <MediaImage
                key={`${attachmentSrc(image) || image.name || 'image'}-${index}`}
                src={attachmentSrc(image)}
                alt={image.name || `Imagem ${index + 1}`}
                className={images.length === 3 && index === 0 ? 'is-tall' : ''}
                onClick={() => openGallery(index)}
                overlay={extra > 0 ? <span className="vc-conversation-media__overlay">+{extra}</span> : null}
              />
            )
          })}
        </div>
      )}
      {files.map((file, index) => {
        const source = attachmentSrc(file)
        if (!source) {
          return <div key={`pending-${index}`} className="vc-conversation-file is-pending"><FileText size={18} aria-hidden /><span>Anexo sendo preparado…</span></div>
        }
        return (
          <a key={`${source}-${index}`} href={source} target="_blank" rel="noopener noreferrer" className="vc-conversation-file">
            <span className="vc-conversation-file__icon"><FileText size={18} aria-hidden /></span>
            <span className="vc-conversation-file__copy"><strong>{file.name || 'Arquivo'}</strong>{file.size ? <small>{formatBytes(file.size)}</small> : null}</span>
          </a>
        )
      })}
    </div>
  )
}

function ReplyQuote({ replyTo, replyAuthor, onJumpToReply }) {
  if (!replyTo) return null
  const actionId = actionIdOf(replyTo)
  const missing = !!replyTo.missing
  const attachments = Array.isArray(replyTo.attachments) ? replyTo.attachments : (replyTo.attachment ? [replyTo.attachment] : [])
  const preview = replyTo.deleted
    ? 'Mensagem apagada'
    : missing
      ? 'Mensagem original fora do histórico disponível'
      : replyTo.text || (attachments.some(isImageAttachment) ? 'Imagem' : attachments[0]?.name) || 'Mensagem'
  return (
    <button
      type="button"
      className="vc-conversation-reply"
      disabled={missing || !actionId}
      onClick={() => onJumpToReply?.(actionId)}
      title={missing ? 'Original indisponível' : 'Ir para a mensagem original'}
    >
      <span>{replyAuthor?.displayName || replyTo.author || 'Mensagem original'}</span>
      <small>{preview}</small>
    </button>
  )
}


function DeliveryState({ message, onRetry, onCopy, onCancel }) {
  const actionId = actionIdOf(message)
  if (message.status === 'sending') return <div className="vc-conversation-delivery" role="status">Enviando…</div>
  if (message.status !== 'failed' && message.status !== 'permanent-failed') return null
  return (
    <div className="vc-conversation-failure" role="alert">
      <span><XCircle size={14} aria-hidden />Falha no envio</span>
      {onRetry && <button type="button" onClick={() => onRetry(actionId)}><RotateCcw size={14} aria-hidden />Tentar novamente</button>}
      {onCopy && <button type="button" onClick={() => onCopy(actionId)}><Copy size={14} aria-hidden />Copiar</button>}
      {onCancel && <button type="button" onClick={() => onCancel(actionId)}><Trash2 size={14} aria-hidden />Excluir</button>}
    </div>
  )
}

export default function MessageBubble({
  msg, isMine, showHeader, author, authorColor = null, resolveRoom = null,
  pinned = false, canPin = false, canModerate = false, onReply = null, onEdit = null,
  onTogglePin = null, onToggleLike = null, onToggleReaction = null,
  quickReactions = ['👍', '❤️', '🔥'], onDelete = null, onImageClick = null,
  onRetry = null, onCopy = null, onCancel = null, replyTo = null, replyAuthor = null,
  onJumpToReply = null, currentUserId = null, density = 'confortavel', highlighted = false,
  highlightTick = 0, mentionsMe = false, isReply = false, roomKey = null,
  onMarkUnread = null, threadRootId = null, replyCount = 0, onOpenThread = null,
  onRoomMention = null, searchQuery = '',
}) {
  const dens = resolveChatDensity(density)
  const [copyState, setCopyState] = useState('idle')
  const rootRef = useRef(null)

  useEffect(() => {
    if (!highlighted || !rootRef.current) return undefined
    const element = rootRef.current
    element.classList.remove('vc-msg-highlight')
    void element.offsetWidth
    element.classList.add('vc-msg-highlight')
    return () => element.classList.remove('vc-msg-highlight')
  }, [highlighted, highlightTick])

  if (isLobbyWelcomeMessage(msg)) return <LobbyWelcomeCard lobby={msg.lobby || msg.announce} roomName={msg.roomName} />
  if (isLobbyEventMessage(msg)) {
    return <LobbyEventCard msg={msg} accent={msg.lobbyAccent || msg.lobbyEvent?.accent || '#38bdf8'} resolveRoom={resolveRoom} spaceName={msg.lobbyEvent?.spaceName || ''} memberCount={msg.lobbyEvent?.memberCount} />
  }
  if (msg.kind === 'announce' || msg.announce) {
    return <AnnouncementCard msg={msg} resolveRoom={resolveRoom} currentUserId={currentUserId} onToggleLike={onToggleLike} onToggleReaction={onToggleReaction} quickReactions={quickReactions} />
  }
  if (msg.kind === 'sys') {
    const system = createSystemCardViewModel(msg)
    return (
      <div className="w-full px-3 sm:px-6 my-1">
        <ChatFeatureCardFrame
          compact
          className="vc-system-card"
          accent={system.accent || 'var(--vc-text-muted)'}
          badge={<span>Sistema</span>}
          title={<span>{system.title}</span>}
          body={system.snippet && system.snippet !== system.title ? <Markdown text={system.snippet} resolveRoom={resolveRoom} /> : null}
          status={system.time?.label ? <time dateTime={system.time.iso}>{system.time.label}</time> : null}
          role="note"
          aria-label="Atualização do sistema"
        />
      </div>
    )
  }

  const actionId = actionIdOf(msg)
  const authorLabel = author?.displayName || msg.author || (isMine ? 'você' : 'convidado')
  const authorPhoto = author?.photoURL || msg.authorPhoto || ''
  const authorId = author?.userId || msg.authorId || null
  const canDelete = !!onDelete && (isMine || canModerate)
  const canEdit = !!onEdit && isMine && msg.status !== 'sending' && !msg.deleted
  const hasText = !msg.deleted && !!String(msg.text || '').trim()
  const hasAttachment = !msg.deleted && (!!msg.attachment || (Array.isArray(msg.attachments) && msg.attachments.length > 0))
  const handleCopy = async () => {
    const attachments = Array.isArray(msg.attachments) ? msg.attachments : []
    const value = msg.text || attachmentSrc(msg.attachment) || msg.attachment?.name || attachmentSrc(attachments[0]) || attachments[0]?.name || ''
    const copied = await writeClipboard(value)
    setCopyState(copied ? 'copied' : 'error')
    window.setTimeout(() => setCopyState('idle'), 1500)
  }
  const menuProps = {
    roomKey,
    onCopyText: handleCopy,
    onEdit: canEdit ? onEdit : null,
    onTogglePin: canPin && onTogglePin ? onTogglePin : null,
    onMarkUnread,
    onDelete: canDelete ? onDelete : null,
    onOpenThread,
    pinned,
    replyCount: Number(replyCount || msg.replyCount) || 0,
  }

  return (
    <article
      ref={rootRef}
      id={actionId ? `message-${actionId}` : undefined}
      data-msg-id={actionId || ''}
      data-msg-fs={msg.firestoreId || ''}
      data-msg-author={authorId || ''}
      data-msg-mine={isMine ? '1' : '0'}
      data-msg-color={authorColor || ''}
      data-thread-root={threadRootId || msg.threadRootId || ''}
      data-reply-count={Number(replyCount || msg.replyCount) || 0}
      data-chat-density={dens.key}
      className={`vc-conversation-message group ${showHeader ? 'has-header' : 'is-followup'} ${mentionsMe ? 'is-mentioned' : ''} ${isReply ? 'is-reply' : ''}`}
      style={{ '--vc-message-author': authorColor || 'var(--space-accent)' }}
      aria-label={`${authorLabel}, ${formatMessageTime(msg.ts)}`}
    >
      <AvatarColumn showHeader={showHeader} photoURL={authorPhoto} label={authorLabel} userId={authorId} compactTime={formatMessageTime(msg.ts)} size={dens.avatar} />
      <div className="vc-conversation-message__main">
        {showHeader && (
          <header className="vc-conversation-message__header">
            <strong>{authorLabel}</strong>
            {pinned && !msg.deleted && <span className="vc-conversation-message__pinned"><Pin size={11} aria-hidden />Fixada</span>}
            <time dateTime={msg.ts ? new Date(msg.ts).toISOString() : undefined}>{formatMessageTime(msg.ts)}</time>
          </header>
        )}
        <MessageActionBar
          message={msg}
          currentUserId={currentUserId}
          quickReactions={quickReactions}
          onToggleReaction={onToggleReaction}
          onToggleLike={onToggleLike}
          onReply={onReply}
          menuProps={menuProps}
        />
        <div className="vc-conversation-message__surface">
          {!msg.deleted && <ReplyQuote replyTo={replyTo} replyAuthor={replyAuthor} onJumpToReply={onJumpToReply} />}
          <div className={`vc-conversation-message__body ${dens.bubbleText}`}>
            <MessageText message={msg} resolveRoom={resolveRoom} onRoomMention={onRoomMention} searchQuery={searchQuery} />
            {hasAttachment && <AttachmentBlock attachment={msg.attachment} attachments={msg.attachments} onImageClick={onImageClick} hasText={hasText} />}
            {!msg.deleted && msg.edited && <span className="vc-conversation-message__edited">editada</span>}
          </div>
          {copyState !== 'idle' && <span className={`vc-conversation-copy-state is-${copyState}`} role="status">{copyState === 'copied' ? <><Check size={12} />Copiado</> : <><XCircle size={12} />Falha ao copiar</>}</span>}
        </div>
        {!msg.deleted && (
          <MessageActionBar
            inline
            message={msg}
            currentUserId={currentUserId}
            onToggleReaction={onToggleReaction}
            onToggleLike={onToggleLike}
            onReply={onReply}
            menuProps={menuProps}
          />
        )}
        {isMine && !msg.deleted && <DeliveryState message={msg} onRetry={onRetry} onCopy={onCopy} onCancel={onCancel} />}
        {!msg.deleted && (onToggleReaction || onToggleLike) && (
          <EmojiReactions
            reactions={msg.reactions || {}}
            likes={msg.likes || []}
            currentUserId={currentUserId}
            hideAdd
            onToggle={onToggleReaction ? (emoji) => onToggleReaction(actionId, emoji) : null}
            onToggleLike={onToggleLike ? () => onToggleLike(actionId) : null}
          />
        )}
      </div>
    </article>
  )
}
