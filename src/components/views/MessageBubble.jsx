/**
 * MessageBubble — Discord-style flat feed (no colored bubbles).
 * Avatar left, name+time+body in one aligned column.
 */
import { useState, useRef, useEffect } from 'react'
import {
  RefreshCw, MoreHorizontal, Copy, Edit3, Trash2, CornerUpLeft,
  FileText, Download, Smile,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { PersonAvatar } from '../../features/people'
import EmojiReactions from '../ui/EmojiReactions'
import { resolveChatDensity } from './chatDensity'
import { downloadUrl } from '../../shared/utils/download'

const AVATAR = 40

export default function MessageBubble({
  msg,
  isMine,
  showHeader,
  density = 'compacto',
  onRetry,
  onImageClick,
  onReply,
  onToggleReaction,
  onEdit,
  onDelete,
  canModerate = false,
  replyTo,
  author,
  replyAuthor,
  highlighted = false,
  highlightTick = 0,
  onJumpToReply,
}) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState('')
  const menuRef = useRef(null)
  const menuBtnRef = useRef(null)
  const editInputRef = useRef(null)
  const rootRef = useRef(null)
  const reactAddRef = useRef(null)

  const dens = resolveChatDensity(density)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        menuBtnRef.current && !menuBtnRef.current.contains(e.target)
      ) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (!highlighted) return
    const el = rootRef.current
    if (!el) return
    el.classList.remove('vc-msg-highlight')
    void el.offsetWidth
    el.classList.add('vc-msg-highlight')
  }, [highlighted, highlightTick])

  useEffect(() => {
    if (editing) {
      setDraftText(msg.text || '')
      const t = setTimeout(() => editInputRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [editing, msg.text])

  if (msg.kind === 'sys') {
    return (
      <div className="flex justify-center my-2 vc-anim-fade-in">
        <span className="text-[11px] text-muted">{msg.text}</span>
      </div>
    )
  }

  const authorLabel = author?.displayName || msg.author || (isMine ? 'você' : 'convidado')
  const authorHandle = author?.handle || msg.authorHandle || ''
  const authorPhoto = author?.photoURL || msg.authorPhoto || ''
  const authorId = author?.userId || msg.authorId || null
  const time = formatMessageTime(msg.ts)
  const compactTime = formatClock(msg.ts)
  const status = msg.status
  const deleted = !!msg.deleted
  const attachmentSrc = msg.attachment?.url || msg.attachment?.dataUrl || null
  const isImage = isImageAttachment(msg.attachment)
  const isFile = !!msg.attachment && !isImage

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(msg.text || '')
      setMenuOpen(false)
    } catch {}
  }

  const commitEdit = () => {
    const next = draftText.trim()
    if (!next || next === msg.text) {
      setEditing(false)
      return
    }
    onEdit?.(msg.id, next)
    setEditing(false)
  }

  const openProfile = () => {
    if (authorId && typeof window !== 'undefined' && window.__vcOpenProfile) {
      window.__vcOpenProfile(authorId)
    }
  }

  const openMenu = () => {
    if (menuOpen) {
      setMenuOpen(false)
      return
    }
    const rect = menuBtnRef.current?.getBoundingClientRect()
    if (rect) {
      const width = 176
      let left = rect.right - width
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12))
      let top = rect.bottom + 6
      if (top + 160 > window.innerHeight) top = Math.max(12, rect.top - 160)
      setMenuPos({ top, left })
    }
    setMenuOpen(true)
  }

  return (
    <>
      <div
        ref={rootRef}
        data-msg-id={msg.id}
        className={
          `relative group flex gap-3 ${dens.row} vc-anim-fade-in hover:bg-white/[0.02] ` +
          (showHeader ? dens.group : '')
        }
      >
        {/* Avatar column — same width always so text stays aligned */}
        <div className="w-10 shrink-0 flex justify-center pt-0.5">
          {showHeader ? (
            <button
              type="button"
              onClick={openProfile}
              className="rounded-full transition-transform hover:scale-105"
              title={authorHandle ? `${authorLabel} @${authorHandle}` : authorLabel}
            >
              <span className="relative block">
                <PersonAvatar
                  src={authorPhoto}
                  name={authorLabel}
                  userId={authorId}
                  size={AVATAR}
                />
                {author?.online && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-positive ring-[2px] ring-[#12141a]" />
                )}
              </span>
            </button>
          ) : (
            <span
              className="text-[10px] text-transparent group-hover:text-muted transition-colors tabular-nums leading-5 mt-0.5"
              title={time}
            >
              {compactTime}
            </span>
          )}
        </div>

        {/* Content column — name and body share the same left edge */}
        <div className="relative min-w-0 flex-1 pr-10">
          {replyTo && !deleted && !editing && (
            <ReplyThread
              replyTo={replyTo}
              replyAuthor={replyAuthor}
              onClick={() => onJumpToReply?.(replyTo.id)}
            />
          )}

          {showHeader && (
            <div className="flex items-baseline gap-2 min-w-0 mb-0.5 leading-snug">
              <button
                type="button"
                onClick={openProfile}
                className="text-[14px] font-semibold text-strong truncate hover:underline"
              >
                {authorLabel}
              </button>
              <span className="text-[11px] text-muted tabular-nums shrink-0">{time}</span>
              <StatusIndicator status={status} onRetry={() => onRetry?.(msg.id)} />
            </div>
          )}

          {deleted ? (
            <p className="text-[15px] leading-[1.4] text-muted italic">mensagem apagada</p>
          ) : editing ? (
            <EditBox
              editInputRef={editInputRef}
              draftText={draftText}
              setDraftText={setDraftText}
              commitEdit={commitEdit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              {isImage && attachmentSrc && (
                <button
                  type="button"
                  onClick={() => onImageClick?.(attachmentSrc)}
                  className="block max-w-[min(100%,420px)] rounded-[8px] overflow-hidden bg-black/25 hover:opacity-95 transition-opacity mt-0.5"
                  title="Ampliar"
                >
                  <img
                    src={attachmentSrc}
                    alt=""
                    className="max-w-full max-h-[300px] object-cover"
                    style={{ display: imgLoaded ? 'block' : 'none' }}
                    onLoad={() => setImgLoaded(true)}
                  />
                  {!imgLoaded && (
                    <div className="w-64 h-36 flex items-center justify-center text-muted text-[11px]">
                      carregando…
                    </div>
                  )}
                </button>
              )}

              {isImage && msg.attachment && (
                <div className="flex items-center gap-2 max-w-[min(100%,420px)] mt-1">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium truncate text-strong/75">
                      {msg.attachment.name || 'imagem'}
                    </span>
                    <span className="block text-[10.5px] text-muted">
                      {formatBytes(msg.attachment.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
                    title="Baixar imagem"
                    aria-label="Baixar imagem"
                    onClick={() => downloadUrl(attachmentSrc, msg.attachment.name || 'imagem')}
                  >
                    <Download size={14} strokeWidth={1.8} />
                  </button>
                </div>
              )}

              {isFile && (
                <button
                  type="button"
                  onClick={() => downloadUrl(attachmentSrc, msg.attachment.name || 'arquivo')}
                  className="flex items-center gap-2.5 min-w-[180px] max-w-sm text-left px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors mt-0.5"
                  title="Baixar arquivo"
                >
                  <span className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                    <FileText size={16} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-strong truncate">
                      {msg.attachment.name || 'arquivo'}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {formatBytes(msg.attachment.size)}
                    </span>
                  </span>
                  <Download size={14} strokeWidth={1.8} className="shrink-0 text-muted" />
                </button>
              )}

              {msg.text ? (
                <p className={'text-[15px] leading-[1.4] text-strong/90 whitespace-pre-wrap break-words ' + (isImage ? 'mt-1' : '')}>
                  {msg.text}
                  {msg.edited && (
                    <span className="ml-1 text-[10px] text-muted italic">(editada)</span>
                  )}
                </p>
              ) : msg.edited ? (
                <span className="text-[10px] text-muted italic">(editada)</span>
              ) : null}
            </>
          )}

          {!showHeader && (
            <StatusIndicator status={status} onRetry={() => onRetry?.(msg.id)} />
          )}

          {!deleted && (
            <EmojiReactions
              reactions={msg.reactions || {}}
              onToggle={(emoji) => onToggleReaction?.(msg.id, emoji)}
              onPick={(emoji) => onToggleReaction?.(msg.id, emoji)}
              hideAdd
              registerOpen={(fn) => { reactAddRef.current = fn }}
            />
          )}

          {!deleted && (
            <div
              className={
                'absolute -top-2 right-0 z-20 flex items-center gap-0.5 ' +
                'rounded-md border border-line bg-[#1a1c22] shadow-lg p-0.5 ' +
                'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ' +
                (menuOpen ? '!opacity-100' : '')
              }
            >
              <button
                type="button"
                onClick={(e) => reactAddRef.current?.(e.currentTarget)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
                title="Adicionar reação"
                aria-label="Adicionar reação"
              >
                <Smile size={13} strokeWidth={1.9} />
              </button>
              <button
                type="button"
                onClick={() => onReply?.(msg)}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
                title="Responder"
                aria-label="Responder"
              >
                <CornerUpLeft size={13} strokeWidth={2} />
              </button>
              <button
                ref={menuBtnRef}
                type="button"
                onClick={openMenu}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-strong hover:bg-white/[0.06]"
                title="Mais ações"
                aria-label="Mais ações"
                aria-expanded={menuOpen}
              >
                <MoreHorizontal size={13} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>

      {menuOpen && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[80] w-44 py-1 rounded-xl bg-surface1 border border-line shadow-2xl vc-anim-fade-in-up"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <MenuItem icon={Copy} onClick={handleCopy}>Copiar texto</MenuItem>
          {isMine && (
            <MenuItem icon={Edit3} onClick={() => { setMenuOpen(false); setEditing(true) }}>
              Editar
            </MenuItem>
          )}
          {(isMine || canModerate) && (
            <MenuItem
              icon={Trash2}
              danger
              onClick={() => { setMenuOpen(false); onDelete?.(msg.id) }}
            >
              Excluir
            </MenuItem>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function ReplyThread({ replyTo, replyAuthor, onClick }) {
  const missing = !replyTo || replyTo.missing
  const name = replyAuthor?.displayName || replyTo?.author || 'mensagem'
  const photo = replyAuthor?.photoURL || ''
  const thumb = isImageAttachment(replyTo?.attachment)
    ? (replyTo.attachment.url || replyTo.attachment.dataUrl)
    : null
  const snippet = missing
    ? 'mensagem não encontrada'
    : replyTo.deleted
      ? 'mensagem apagada'
      : (replyTo.text || (thumb ? 'foto' : (replyTo.attachment?.name || '')))

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={missing}
      title={missing ? 'Mensagem original não encontrada' : 'Ir para a mensagem'}
      className="flex items-center gap-1.5 mb-1 max-w-full text-left disabled:opacity-60 group/reply -ml-1"
    >
      <span className="w-5 h-2.5 border-l border-t border-white/20 rounded-tl shrink-0" aria-hidden />
      <PersonAvatar src={photo} name={name} userId={replyAuthor?.userId} size={14} />
      <span className="text-[12px] text-muted truncate min-w-0 group-hover/reply:text-ink">
        <span className="font-semibold text-strong/70">{name}</span>
        {snippet ? ` ${snippet}` : ''}
      </span>
    </button>
  )
}

function EditBox({ editInputRef, draftText, setDraftText, commitEdit, onCancel }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[220px] max-w-xl mt-0.5">
      <textarea
        ref={editInputRef}
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            commitEdit()
          }
          if (e.key === 'Escape') onCancel()
        }}
        rows={2}
        className="w-full bg-surface1 border border-line rounded-lg px-3 py-2 text-[14px] text-strong focus:outline-none focus:border-accent/50 resize-none"
      />
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onCancel} className="px-2 py-0.5 rounded text-[11px] text-muted hover:text-strong hover:bg-surface2">
          cancelar
        </button>
        <button
          type="button"
          onClick={commitEdit}
          disabled={!draftText.trim()}
          className="px-2 py-0.5 rounded text-[11px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-30"
        >
          salvar
        </button>
      </div>
    </div>
  )
}

function MenuItem({ icon: Icon, children, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left ' +
        (danger
          ? 'text-danger hover:bg-danger/15'
          : 'text-ink hover:bg-surface2 hover:text-strong')
      }
      role="menuitem"
    >
      <Icon size={12} />
      {children}
    </button>
  )
}

function StatusIndicator({ status, onRetry }) {
  if (status === 'sending') {
    return (
      <span title="enviando" className="inline-flex">
        <span className="block w-2.5 h-2.5 rounded-full border-[1.5px] border-line border-t-strong/70 vc-anim-spin" />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <button
        onClick={onRetry}
        title="falhou — clique pra reenviar"
        aria-label="Reenviar mensagem"
        className="inline-flex w-5 h-5 rounded-md items-center justify-center text-danger hover:bg-danger/15"
      >
        <RefreshCw size={11} strokeWidth={2.25} />
      </button>
    )
  }
  return null
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatClock(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatMessageTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const clock = formatClock(ts)
  const today = new Date()
  if (sameDay(d, today)) return `Hoje às ${clock}`
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (sameDay(d, yesterday)) return `Ontem às ${clock}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${clock}`
}

function isImageAttachment(att) {
  if (!att) return false
  if (att.kind === 'file') return false
  const type = att.type || ''
  return att.kind === 'image' || type.startsWith('image/')
}

function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return 'documento'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
