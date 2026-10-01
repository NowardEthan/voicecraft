/**
 * Composer — text + attachments. Plus / emoji / mic, send pill, Enter hint.
 *
 * Phase 3A additions:
 *   - Ctrl+V of images via `onPaste` handler.
 *   - ArrowUp (textarea empty) → edit last own message (handler prop).
 *   - Esc cancels reply / pending action.
 *
 * Phase 2 (CONTRATO_FASE2_ACEITE.md) additions:
 *   - Mention / room suggestion popover when @ or # is typed.
 *   - Drag-and-drop overlay covering the composer when files are
 *     dragged over it (visual hint).
 *   - Premium gradient + blur container.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Smile, Plus, Send, X, CornerUpLeft, FileText, Image as ImageIcon, Loader2, Film,
} from 'lucide-react'
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_ATTACHMENTS } from '../../hooks/useChat'
import {
  MAX_TEXT_CHARS, MAX_TEXT_UTF8_BYTES, isAttachmentSizeAllowed, roomOperationKey as makeRoomOperationKey, validateComposerText,
} from '../../features/chat/composerPolicy.js'
import { beginRoomSubmit, settleRoomSubmit, takeRoomRecovery } from '../../features/chat/roomSubmitState.js'
import EmojiPicker from '../ui/EmojiPicker'
import AttachPreviewModal from './AttachPreviewModal'
import GifPicker from '../../features/chat/GifPicker'
import { AnchoredOverlay } from '../../shared/motion/AnchoredOverlay.jsx'
import MentionSuggestions, {
  computeMentionSuggestions,
  detectMentionTrigger,
  applyMentionReplacement,
} from '../../features/chat/MentionSuggestions'
import { listVisibleCommands, matchCommandQuery } from '../../features/chat/commands'

const FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json'
const IMAGE_ACCEPT = 'image/*'
const TEXTAREA_MAX_PX = 160
const ATTACH_CAP = 10
function optionDomId(prefix, value) {
  return `${prefix}-${String(value || 'none').replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function writeStoredDraft(accountUid, draftKey, value) {
  if (!accountUid || !draftKey) return
  try {
    const key = `voicecraft:l1:${accountUid}`
    const parsed = JSON.parse(localStorage.getItem(key) || '{}') || {}
    const drafts = { ...(parsed.drafts || {}) }
    if (value) drafts[draftKey] = value
    else delete drafts[draftKey]
    localStorage.setItem(key, JSON.stringify({
      ...parsed,
      schemaVersion: parsed.schemaVersion || 1,
      uid: accountUid,
      updatedAt: Date.now(),
      drafts,
    }))
    window.dispatchEvent(new CustomEvent('voicecraft:drafts-changed', { detail: { draftKey } }))
  } catch { /* storage may be unavailable */ }
}

export default function Composer({
  disabled = false,
  placeholder = 'Conversar…',
  onSubmit,
  replyTo = null,
  editingMessage = null,
  onCancelEdit,
  onCancelReply,
  className = '',
  onArrowUpEditLast,
  onTextChange,
  members = [],
  rooms = [],
  currentUserId = null,
  accent = null,
  channelName = null,
  spaceId = null,
  roomId = null,
  accountUid = null,
  commandPermissions = {},
  onSlashCommand = null,
}) {
  // Drafts (Fase 2 L1): read/write per (spaceId:roomId) in localStorage.
  const draftKey = spaceId && roomId ? `${spaceId}:${roomId}` : null
  const roomOperationKey = makeRoomOperationKey(accountUid, spaceId, roomId)
  const currentRoomKeyRef = useRef(roomOperationKey)
  currentRoomKeyRef.current = roomOperationKey
  const draftFromCache = (() => {
    if (!draftKey || !accountUid) return ''
    try {
      const raw = localStorage.getItem(`voicecraft:l1:${accountUid}`)
      if (!raw) return ''
      const parsed = JSON.parse(raw)
      const drafts = parsed?.drafts || {}
      return typeof drafts[draftKey] === 'string' ? drafts[draftKey] : ''
    } catch {
      return ''
    }
  })()

  const [text, setText] = useState(draftFromCache)
  const [attachments, setAttachments] = useState([])
  const [attachIndex, setAttachIndex] = useState(0)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiPos, setEmojiPos] = useState(null)
  const [gifOpen, setGifOpen] = useState(false)
  const [gifPos, setGifPos] = useState(null)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [composerError, setComposerError] = useState(null)
  const pendingOperationsRef = useRef(new Map())
  const recoveryByRoomRef = useRef(new Map())
  const operationSequenceRef = useRef(0)
  const [, refreshPendingState] = useState(0)
  const sending = pendingOperationsRef.current.has(roomOperationKey)
  const [selectedMentionIds, setSelectedMentionIds] = useState([])
  const textRef = useRef(text)
  const activeEditRef = useRef(null)
  const preEditRef = useRef({ text: '', attachments: [] })
  textRef.current = text

  const persistDraft = useCallback((value) => {
    if (!draftKey || !accountUid) return
    const key = `voicecraft:l1:${accountUid}`
    try {
      const raw = localStorage.getItem(key)
      const parsed = raw ? (JSON.parse(raw) || {}) : {}
      const next = { ...(parsed.drafts || {}) }
      if (value && value.length > 0) next[draftKey] = value
      else delete next[draftKey]
      localStorage.setItem(key, JSON.stringify({
        ...parsed, schemaVersion: parsed.schemaVersion || 1, uid: accountUid,
        updatedAt: Date.now(), drafts: next,
      }))
      window.dispatchEvent(new CustomEvent('voicecraft:drafts-changed', { detail: { draftKey } }))
    } catch { /* storage may be unavailable */ }
  }, [draftKey, accountUid])

  // Debounce normal drafts, but flush the current room on switch/unmount.
  useEffect(() => {
    if (editingMessage || text === draftFromCache) return undefined
    const timer = setTimeout(() => persistDraft(text), 3000)
    return () => clearTimeout(timer)
  }, [text, editingMessage, draftFromCache, persistDraft])
  useEffect(() => () => {
    if (!activeEditRef.current) persistDraft(textRef.current)
  }, [persistDraft])

  // Restore only state owned by the room being entered. Failed payloads
  // stay keyed to their origin and can never leak into another room.
  useEffect(() => {
    activeEditRef.current = null
    setSelectedMentionIds([])
    const recovery = takeRoomRecovery(pendingOperationsRef.current, recoveryByRoomRef.current, roomOperationKey)
    if (recovery) {
      setText(recovery.text || '')
      setAttachments(recovery.attachments || [])
      setSelectedMentionIds(recovery.mentionIds || [])
      setComposerError(recovery.error || null)
    } else {
      setText(draftFromCache)
      setAttachments([])
      setComposerError(null)
    }
    setAttachIndex(0)
    setMention(null)
    setSlash(null)
    setAttachMenuOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, accountUid, roomOperationKey])

  /* Mention / room suggestion popover state (CONTRATO_FASE2) */
  const [mention, setMention] = useState(null) // null | { kind, query, queryStart, queryEnd, items, selectedId, anchor }
  const [slash, setSlash] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const attachmentsRef = useRef([])

  const revokeAtt = (att) => {
    const u = att?.previewUrl
    if (u && String(u).startsWith('blob:')) {
      try { URL.revokeObjectURL(u) } catch {}
    }
  }

  const clearAttachments = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach(revokeAtt)
      return []
    })
    setAttachIndex(0)
  }, [])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => () => {
    attachmentsRef.current.forEach(revokeAtt)
  }, [])

  /* Derive members / rooms passed to the popover.
   * For members we build a stable id from userId (no duplicates). For
   * rooms we pass the entries as-is.                                   */
  const memberItems = members || []
  const roomItems = (rooms || []).filter((r) => r && r.id && !String(r.id).startsWith('__optimistic__'))

  /* Notify parent of text changes (used by typing tracker) */
  useEffect(() => {
    onTextChange?.(text)
  }, [text, onTextChange])

  const taRef = useRef(null)
  const fileInputRef = useRef(null)
  const imageInputRef = useRef(null)
  const emojiRef = useRef(null)
  const emojiBtnRef = useRef(null)
  const attachBtnRef = useRef(null)
  const attachMenuRef = useRef(null)
  const gifRef = useRef(null)
  const gifBtnRef = useRef(null)
  const composerShellRef = useRef(null)

  // Editing temporarily owns the composer, preserving the room draft behind it.
  useEffect(() => {
    const editId = editingMessage?.id || editingMessage?.firestoreId || null
    if (editId && activeEditRef.current !== editId) {
      preEditRef.current = { text: textRef.current, attachments: attachmentsRef.current }
      persistDraft(textRef.current)
      activeEditRef.current = editId
      setText(editingMessage?.text || '')
      setAttachments([])
      setSelectedMentionIds((editingMessage?.mentions || []).map((m) => String(m?.userId || m)).filter(Boolean))
      requestAnimationFrame(() => taRef.current?.focus())
    } else if (!editId && activeEditRef.current) {
      const previous = preEditRef.current
      activeEditRef.current = null
      setText(previous.text || '')
      setAttachments(previous.attachments || [])
      setSelectedMentionIds([])
      requestAnimationFrame(() => taRef.current?.focus())
    }
  }, [editingMessage, persistDraft])


  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, TEXTAREA_MAX_PX) + 'px'
  }, [text])

  useEffect(() => {
    if (replyTo) {
      const t = setTimeout(() => taRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [replyTo])

  const insertEmoji = useCallback((emoji) => {
    const ta = taRef.current
    if (!ta) {
      setText(prev => prev + emoji)
      return
    }
    const start = ta.selectionStart ?? text.length
    const end = ta.selectionEnd ?? text.length
    const next = text.slice(0, start) + emoji + text.slice(end)
    setText(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + emoji.length
      ta.setSelectionRange(pos, pos)
    })
  }, [text])

  /* Compute picker portal position — anchored ABOVE the composer shell,
   * horizontally centered relative to it. Mirrors the portal technique
   * used by EmojiReactions.jsx, but uses the composer container (not
   * the button) so the picker sits centered on the whole composer.
   *
   * Constants match EmojiPicker default size (width=392, height=420). */
  const computeEmojiPos = useCallback(() => {
    const btn = emojiBtnRef.current || attachBtnRef.current
    const shell = composerShellRef.current
    if (!btn || !shell) return null
    const btnRect = btn.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const PICKER_W = Math.min(392, Math.max(280, window.innerWidth - 24))
    const PICKER_H = Math.min(420, Math.max(280, window.innerHeight - 24))
    let left = shellRect.left + (shellRect.width - PICKER_W) / 2
    left = Math.max(12, Math.min(left, window.innerWidth - PICKER_W - 12))
    let top = shellRect.top - PICKER_H - 8
    if (top < 12) top = btnRect.bottom + 8
    top = Math.max(12, Math.min(top, window.innerHeight - PICKER_H - 12))
    return { top, left }
  }, [])

  const computeGifPos = useCallback(() => {
    const btn = gifBtnRef.current || attachBtnRef.current
    const shell = composerShellRef.current
    if (!btn || !shell) return null
    const btnRect = btn.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const PICKER_W = Math.min(360, Math.max(280, window.innerWidth - 24))
    const PICKER_H = Math.min(440, Math.max(300, window.innerHeight - 24))
    let left = shellRect.left + (shellRect.width - PICKER_W) / 2
    left = Math.max(12, Math.min(left, window.innerWidth - PICKER_W - 12))
    let top = shellRect.top - PICKER_H - 8
    if (top < 12) top = btnRect.bottom + 8
    top = Math.max(12, Math.min(top, window.innerHeight - PICKER_H - 12))
    return { top, left }
  }, [])

  const toggleEmoji = useCallback(() => {
    if (emojiOpen) {
      setEmojiOpen(false)
      setEmojiPos(null)
      return
    }
    setGifOpen(false)
    setGifPos(null)
    setEmojiOpen(true)
  }, [emojiOpen])

  const toggleGif = useCallback(() => {
    if (gifOpen) {
      setGifOpen(false)
      setGifPos(null)
      return
    }
    setEmojiOpen(false)
    setEmojiPos(null)
    setGifOpen(true)
  }, [gifOpen])

  useEffect(() => {
    if (!emojiOpen) {
      setEmojiPos(null)
      return undefined
    }
    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setEmojiPos(computeEmojiPos())
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [emojiOpen, computeEmojiPos])

  useEffect(() => {
    if (!gifOpen) {
      setGifPos(null)
      return undefined
    }
    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setGifPos(computeGifPos())
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [gifOpen, computeGifPos])

  useEffect(() => {
    if (!emojiOpen) return undefined
    const handler = () => setEmojiPos(computeEmojiPos())
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [emojiOpen, computeEmojiPos])

  useEffect(() => {
    if (!gifOpen) return undefined
    const handler = () => setGifPos(computeGifPos())
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [gifOpen, computeGifPos])

  /* Compute the popover anchor from the textarea caret position. We
   * use a simple bounding rect approach: the caret's column is the X
   * offset of the *caret*, and Y is the textarea's bottom edge. The
   * MentionSuggestions component flips to "below" if there isn't room
   * above.                                                          */
  const computeAnchor = useCallback(() => {
    const ta = taRef.current
    if (!ta) return null
    const rect = ta.getBoundingClientRect()
    return { left: rect.left + 16, top: rect.top, bottom: rect.bottom }
  }, [])

  /* Re-evaluate the popover on every text update. Trigger detection is
   * a pure helper (detectMentionTrigger) that runs against the caret
   * position read from the textarea DOM element.                     */
  const refreshMention = useCallback((nextText, caretPos) => {
    const ta = taRef.current
    if (!ta) return
    const caret = (caretPos != null) ? caretPos : (ta.selectionStart ?? nextText.length)
    const beforeCaret = nextText.slice(0, caret)
    const slashMatch = /(?:^|\n)\/([\w-]*)$/.exec(beforeCaret)
    if (slashMatch) {
      const items = listVisibleCommands(commandPermissions)
        .filter((command) => matchCommandQuery(command, slashMatch[1]))
        .slice(0, 8)
      setMention(null)
      setSlash({
        query: slashMatch[1],
        start: caret - slashMatch[1].length - 1,
        end: caret,
        items,
        selectedId: items[0]?.id || null,
        anchor: computeAnchor(),
      })
      return
    }
    if (slash) setSlash(null)
    const trig = detectMentionTrigger(nextText, caret)
    if (!trig.active) {
      if (mention) setMention(null)
      return
    }
    const items = computeMentionSuggestions({
      kind: trig.kind,
      query: trig.query,
      members: memberItems,
      rooms: roomItems,
    })
    if (items.length === 0) {
      // Keep the popover open but empty — gives the user feedback.
      setMention((prev) => prev && prev.kind === trig.kind
        ? { ...prev, query: trig.query, items: [], selectedId: null, anchor: computeAnchor() }
        : {
            kind: trig.kind,
            query: trig.query,
            queryStart: trig.queryStart,
            queryEnd: trig.queryEnd,
            triggerStart: trig.triggerStart,
            items: [],
            selectedId: null,
            anchor: computeAnchor(),
          })
      return
    }
    setMention((prev) => {
      const selectedId = items[0].id || items[0].userId
      if (
        prev
        && prev.kind === trig.kind
        && prev.query === trig.query
        && prev.anchor && prev.anchor.left === (computeAnchor()?.left)
      ) {
        // No-op update — same query + same anchor.
        return prev
      }
      return {
        kind: trig.kind,
        query: trig.query,
        queryStart: trig.queryStart,
        queryEnd: trig.queryEnd,
        triggerStart: trig.triggerStart,
        items,
        selectedId,
        anchor: computeAnchor(),
      }
    })
  }, [mention, slash, memberItems, roomItems, computeAnchor, commandPermissions])

  /* Selecting a popover item replaces `@query`/`#query` with the
   * official display name and closes the popover.                     */
  const selectMentionItem = useCallback((item) => {
    if (!mention) return
    const ta = taRef.current
    const { newText, newCaret } = applyMentionReplacement(
      text,
      mention.triggerStart,
      mention.queryEnd,
      item,
      mention.kind,
    )
    setText(newText)
    if (mention.kind === 'member' && item?.userId) {
      setSelectedMentionIds((prev) => [...new Set([...prev, String(item.userId)])])
    }
    setMention(null)
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      try { ta.setSelectionRange(newCaret, newCaret) } catch {}
      // Recompute popover once caret is placed.
      refreshMention(newText, newCaret)
    })
  }, [mention, text, refreshMention])

  /* Re-anchor on scroll/resize while popover is open. */
  useEffect(() => {
    if (!mention) return undefined
    const handler = () => setMention((prev) => prev ? { ...prev, anchor: computeAnchor() } : prev)
    window.addEventListener('resize', handler)
    window.addEventListener('scroll', handler, true)
    return () => {
      window.removeEventListener('resize', handler)
      window.removeEventListener('scroll', handler, true)
    }
  }, [mention, computeAnchor])

  const submit = useCallback(async () => {
    if (disabled || sending) return
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return

    const textValidation = validateComposerText(text)
    if (!textValidation.valid) {
      setComposerError(`Mensagem muito longa: use ate ${MAX_TEXT_CHARS.toLocaleString('pt-BR')} caracteres e menos de ${Math.round(MAX_TEXT_UTF8_BYTES / 1024)} KiB em UTF-8.`)
      requestAnimationFrame(() => taRef.current?.focus())
      return
    }

    const originRoomKey = roomOperationKey
    const originDraftKey = draftKey
    const originAccountUid = accountUid
    const operationId = ++operationSequenceRef.current
    const previous = {
      operationId,
      text,
      attachments,
      mentionIds: selectedMentionIds,
      replyId: replyTo?.id || replyTo?.firestoreId || null,
    }
    const payload = {
      text: trimmed,
      attachments,
      attachment: attachments[0] || null,
      replyToId: previous.replyId,
      operationRoomId: roomId,
      operationRoomKey: originRoomKey,
      mentionUserIds: selectedMentionIds.filter((id) => {
        const member = memberItems.find((item) => String(item?.userId) === String(id))
        if (!member) return false
        const labels = [member.handle, member.userId, member.displayName].filter(Boolean)
        return labels.some((label) => text.toLowerCase().includes(`@${String(label).toLowerCase()}`))
      }),
    }

    beginRoomSubmit(pendingOperationsRef.current, recoveryByRoomRef.current, originRoomKey, operationId, previous)
    refreshPendingState((value) => value + 1)
    setText('')
    setAttachments([])
    setSelectedMentionIds([])
    setAttachIndex(0)
    setComposerError(null)
    setMention(null)
    setSlash(null)
    setAttachMenuOpen(false)

    if (!editingMessage && originDraftKey && originAccountUid) {
      writeStoredDraft(originAccountUid, originDraftKey, '')
    }
    requestAnimationFrame(() => {
      if (currentRoomKeyRef.current === originRoomKey && taRef.current) {
        taRef.current.style.height = 'auto'
        taRef.current.focus()
      }
    })

    let succeeded = false
    try {
      succeeded = (await onSubmit?.(payload)) !== false
    } catch {
      succeeded = false
    } finally {
      refreshPendingState((value) => value + 1)
    }

    const settled = settleRoomSubmit(
      pendingOperationsRef.current, recoveryByRoomRef.current, originRoomKey, operationId, succeeded,
    )
    if (succeeded) {
      previous.attachments.forEach(revokeAtt)
      if (currentRoomKeyRef.current === originRoomKey) onCancelReply?.()
      return
    }

    const recovery = settled.recovery
    if (originDraftKey && originAccountUid && previous.text) {
      writeStoredDraft(originAccountUid, originDraftKey, previous.text)
    }
    if (currentRoomKeyRef.current === originRoomKey) {
      setText((current) => current ? `${previous.text}\n${current}` : previous.text)
      setAttachments((current) => [...previous.attachments, ...current].slice(0, ATTACH_CAP))
      setSelectedMentionIds((current) => [...new Set([...previous.mentionIds, ...current])])
      setComposerError(recovery.error)
      recoveryByRoomRef.current.delete(originRoomKey)
    }
  }, [accountUid, attachments, disabled, draftKey, editingMessage, memberItems, onCancelReply, onSubmit, replyTo, roomId, roomOperationKey, selectedMentionIds, sending, text])

  const selectSlashCommand = (command) => {
    if (!command || !slash) return
    const next = text.slice(0, slash.start) + text.slice(slash.end)
    setText(next)
    setSlash(null)
    onSlashCommand?.(command)
  }

  const handleKey = (e) => {
    if (e.isComposing || e.nativeEvent?.isComposing || e.keyCode === 229) return
    if (slash) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!slash.items.length) return
        const current = slash.items.findIndex((item) => item.id === slash.selectedId)
        const delta = e.key === 'ArrowDown' ? 1 : -1
        const index = (current + delta + slash.items.length) % slash.items.length
        setSlash((value) => value ? { ...value, selectedId: value.items[index].id } : value)
        return
      }
      if (e.key === 'Enter' && slash.selectedId) {
        e.preventDefault()
        selectSlashCommand(slash.items.find((item) => item.id === slash.selectedId))
        return
      }
      if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return }
    }
    // Popover open? Then ↑/↓/Enter/Escape are owned by it.
    if (mention && mention.items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const idx = mention.items.findIndex((m) => (m.id || m.userId) === mention.selectedId)
        const nextIdx = idx < 0 ? 0 : (idx + 1) % mention.items.length
        setMention((prev) => prev ? { ...prev, selectedId: prev.items[nextIdx].id || prev.items[nextIdx].userId } : prev)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = mention.items.findIndex((m) => (m.id || m.userId) === mention.selectedId)
        const nextIdx = idx <= 0 ? mention.items.length - 1 : idx - 1
        setMention((prev) => prev ? { ...prev, selectedId: prev.items[nextIdx].id || prev.items[nextIdx].userId } : prev)
        return
      }
      if (e.key === 'Enter') {
        const idx = mention.items.findIndex((m) => (m.id || m.userId) === mention.selectedId)
        if (idx >= 0) {
          e.preventDefault()
          selectMentionItem(mention.items[idx])
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }
    if (e.key === 'Escape' && mention) {
      e.preventDefault()
      setMention(null)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
      return
    }
    if (e.key === 'Escape' && gifOpen) {
      e.preventDefault()
      setGifOpen(false)
      setGifPos(null)
      return
    }
    if (e.key === 'Escape' && emojiOpen) {
      e.preventDefault()
      setEmojiOpen(false)
      setEmojiPos(null)
      return
    }
    if (e.key === 'Escape' && attachments.length) {
      e.preventDefault()
      clearAttachments()
      return
    }
    if (e.key === 'Escape' && editingMessage) {
      e.preventDefault()
      onCancelEdit?.()
      return
    }
    if (e.key === 'Escape' && replyTo) {
      e.preventDefault()
      onCancelReply?.()
      return
    }
    if (e.key === 'ArrowUp' && text.length === 0 && !sending && attachments.length === 0) {
      e.preventDefault()
      if (onArrowUpEditLast) onArrowUpEditLast()
    }
  }

  const pickFile = () => {
    if (disabled || editingMessage) return
    fileInputRef.current?.click()
  }

  const pickImage = () => {
    if (disabled || editingMessage) return
    imageInputRef.current?.click()
  }

  const ingestFiles = useCallback((fileList) => {
    if (editingMessage) return
    const files = Array.from(fileList || []).filter(Boolean)
    if (!files.length) return
    setComposerError(null)

    const limitMax = Number(MAX_ATTACHMENTS) > 0 ? Number(MAX_ATTACHMENTS) : ATTACH_CAP
    const built = []
    for (const file of files) {
      const isImage = (file.type && String(file.type).startsWith('image/'))
        || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file.name || '')
      const limit = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
      if (!isAttachmentSizeAllowed(file.size, limit)) {
        const mb = (limit / 1024 / 1024).toFixed(0)
        setComposerError(`${isImage ? 'Imagem' : 'Arquivo'} deve ter menos de ${mb} MiB.`)
        continue
      }
      let previewUrl = null
      if (isImage) {
        try { previewUrl = URL.createObjectURL(file) } catch {
          setComposerError('falha ao ler a imagem')
          continue
        }
      }
      built.push({
        file,
        previewUrl,
        dataUrl: null,
        type: file.type || (isImage ? 'image/jpeg' : 'application/octet-stream'),
        name: file.name || 'anexo',
        size: file.size,
        kind: isImage ? 'image' : 'file',
      })
    }
    if (!built.length) return

    setAttachments((prev) => {
      const room = Math.max(0, limitMax - prev.length)
      if (room <= 0) {
        built.forEach(revokeAtt)
        setComposerError(`máximo de ${limitMax} anexos`)
        return prev
      }
      const take = built.slice(0, room)
      built.slice(room).forEach(revokeAtt)
      if (built.length > room) setComposerError(`máximo de ${limitMax} anexos`)
      const start = prev.length
      queueMicrotask(() => setAttachIndex(start))
      return [...prev, ...take]
    })
  }, [editingMessage])

  const pickGiphyGif = useCallback((gif) => {
    if (editingMessage || !gif?.url) return
    const limitMax = Number(MAX_ATTACHMENTS) > 0 ? Number(MAX_ATTACHMENTS) : ATTACH_CAP
    const isSticker = gif.variant === 'sticker'
    const lower = String(gif.url).toLowerCase()
    const type = lower.includes('.webp')
      ? 'image/webp'
      : (lower.includes('.png') ? 'image/png' : 'image/gif')
    const label = isSticker ? 'sticker' : 'gif'
    const next = {
      file: null,
      url: gif.url,
      previewUrl: gif.preview || gif.url,
      dataUrl: null,
      type,
      name: `${String(gif.title || label).slice(0, 64)}.${type === 'image/webp' ? 'webp' : (type === 'image/png' ? 'png' : 'gif')}`,
      size: 0,
      kind: 'image',
      sticker: isSticker,
    }
    setComposerError(null)
    setAttachments((prev) => {
      if (prev.length >= limitMax) {
        setComposerError(`máximo de ${limitMax} anexos`)
        return prev
      }
      const start = prev.length
      queueMicrotask(() => setAttachIndex(start))
      return [...prev, next]
    })
    setGifOpen(false)
    setGifPos(null)
  }, [editingMessage])

  const pickGifFile = useCallback((file) => {
    if (!file) return
    ingestFiles([file])
    setGifOpen(false)
    setGifPos(null)
  }, [ingestFiles])

  const handleFile = (e) => {
    // Copy FileList BEFORE clearing the input — Chromium/Electron may
    // empty the live FileList when value is reset.
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    ingestFiles(files)
  }

  const removeAttachmentAt = useCallback((idx) => {
    setAttachments((prev) => {
      const target = prev[idx]
      revokeAtt(target)
      const next = prev.filter((_, i) => i !== idx)
      setAttachIndex((cur) => {
        if (!next.length) return 0
        if (cur > idx) return cur - 1
        if (cur >= next.length) return next.length - 1
        return cur
      })
      return next
    })
  }, [])

  const handlePaste = useCallback(async (e) => {
    if (disabled || editingMessage) return
    const items = e.clipboardData?.items
    if (!items || items.length === 0) return
    const files = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 'file' && it.type?.startsWith('image/')) {
        const file = it.getAsFile?.()
        if (file) files.push(file)
      }
    }
    if (files.length) {
      e.preventDefault()
      await ingestFiles(files)
    }
  }, [disabled, editingMessage, ingestFiles])

  /* Drag-and-drop overlay (CONTRATO_FASE2) — visual hint while the user
   * drags a file over the composer. We do not capture the actual drop
   * here yet (that's a future enhancement); this is just a UI affordance
   * that mirrors Discord's composer-on-hover treatment.            */
  const handleDragOver = useCallback((e) => {
    if (disabled || editingMessage) return
    if (Array.from(e.dataTransfer?.types || []).includes('Files')) {
      e.preventDefault()
      setDragOver(true)
    }
  }, [disabled, editingMessage])
  const handleDragLeave = useCallback(() => setDragOver(false), [])
  const handleDrop = useCallback((e) => {
    if (disabled || editingMessage) return
    const list = e.dataTransfer?.files
    if (!list?.length) { setDragOver(false); return }
    e.preventDefault()
    setDragOver(false)
    ingestFiles(list)
  }, [disabled, editingMessage, ingestFiles])

  const canSend = !disabled && !sending && (text.trim().length > 0 || attachments.length > 0)
  const showAttachDock = !!replyTo || !!editingMessage || attachments.length > 0 || !!composerError
  const autocomplete = slash ? {
    controls: 'vc-slash-suggestions',
    activeId: slash.selectedId ? optionDomId('vc-slash-option', slash.selectedId) : undefined,
  } : mention ? {
    controls: 'vc-mention-suggestions',
    activeId: mention.selectedId ? optionDomId('vc-mention-option', mention.selectedId) : undefined,
  } : null

  return (
    <div
      className={`relative z-20 shrink-0 vc-composer-shell ${className} ${
        emojiOpen || gifOpen ? 'vc-composer-shell--picker-open' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {attachments.length > 0 && (
        <AttachPreviewModal
          attachments={attachments}
          index={Math.min(attachIndex, attachments.length - 1)}
          onIndexChange={setAttachIndex}
          accent={accent}
          sending={sending}
          maxCount={ATTACH_CAP}
          onCancel={clearAttachments}
          onSend={submit}
          onAddMore={pickFile}
          onRemoveAt={removeAttachmentAt}
        />
      )}

      {/* Unified edit/reply/attachment/error context dock. */}
      {showAttachDock && (
        <div className="vc-composer-attach-dock" data-vc-attach-dock="above">
          {editingMessage && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface1 border border-warning/30">
              <FileText size={12} className="text-warning shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10.5px] text-warning font-semibold">editando mensagem</p>
                <p className="text-[11px] text-muted truncate">Esc para cancelar</p>
              </div>
              <button type="button" onClick={() => onCancelEdit?.()} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-strong hover:bg-surface2" aria-label="Cancelar edicao">
                <X size={11} />
              </button>
            </div>
          )}

          {replyTo && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-surface1 border border-line">
              <CornerUpLeft size={12} className="text-accent shrink-0" strokeWidth={2} />
              {!replyTo.deleted && isImageAttachment(replyTo.attachment) && (replyTo.attachment.url || replyTo.attachment.dataUrl) ? (
                <img
                  src={replyTo.attachment.url || replyTo.attachment.dataUrl}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover bg-black/30 border border-line shrink-0"
                />
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="text-[10.5px] text-accent font-semibold">
                  respondendo a {replyTo.authorHandle ? `@${replyTo.authorHandle}` : (replyTo.author || 'peer')}
                </p>
                <p className="text-[11px] text-muted truncate">
                  {replyTo.deleted
                    ? 'mensagem apagada'
                    : (replyTo.text
                      || (isImageAttachment(replyTo.attachment) ? 'imagem' : replyTo.attachment?.name)
                      || '')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onCancelReply?.()}
                className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-strong hover:bg-surface2"
                title="Cancelar resposta"
                aria-label="Cancelar resposta"
              >
                <X size={11} />
              </button>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="vc-composer-attachment-strip" aria-label={`${attachments.length} anexos selecionados`}>
              {attachments.map((attachment, i) => {
                const image = isImageAttachment(attachment)
                const src = attachment.previewUrl || attachment.dataUrl || attachment.url
                return (
                  <div key={`${attachment.name || 'anexo'}-${i}`} className="vc-composer-attachment-chip">
                    <button
                      type="button"
                      className="vc-composer-attachment-open"
                      onClick={() => setAttachIndex(i)}
                      aria-label={`Pre-visualizar ${attachment.name || `anexo ${i + 1}`}`}
                    >
                      {image && src ? <img src={src} alt="" /> : <FileText size={16} aria-hidden />}
                    </button>
                    <span className="min-w-0 flex-1">
                      <strong>{attachment.name || (image ? 'Imagem' : 'Arquivo')}</strong>
                      <small>{attachment.size ? formatBytes(attachment.size) : (image ? 'Midia' : 'Arquivo')}</small>
                    </span>
                    <button type="button" onClick={() => removeAttachmentAt(i)} aria-label={`Remover ${attachment.name || 'anexo'}`}>
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {composerError && (
            <p id="vc-composer-error" role="alert" className="px-1 text-[11px] text-danger">{composerError}</p>
          )}
        </div>
      )}

      <div ref={composerShellRef} className="vc-composer-frame">
        <AnchoredOverlay
          open={emojiOpen && !!emojiPos}
          ref={emojiRef}
          anchorRef={attachBtnRef}
          onClose={() => { setEmojiOpen(false); setEmojiPos(null) }}
          placement="top"
          className="fixed vc-emoji-panel-portal"
          style={emojiPos || undefined}
          role="dialog"
          aria-label="Seletor de emoji"
          data-vc-emoji="v4-portal"
          onWheel={(event) => event.stopPropagation()}
        >
            <EmojiPicker
              initialFocus
              onPick={(emoji) => {
                insertEmoji(emoji)
                setEmojiOpen(false)
                setEmojiPos(null)
              }}
            />
        </AnchoredOverlay>

        <AnchoredOverlay
          open={gifOpen && !!gifPos}
          ref={gifRef}
          anchorRef={attachBtnRef}
          onClose={() => { setGifOpen(false); setGifPos(null) }}
          placement="top"
          className="fixed vc-emoji-panel-portal"
          style={gifPos || undefined}
          role="dialog"
          aria-label="Seletor de GIF"
          data-vc-gif="portal"
          onWheel={(event) => event.stopPropagation()}
        >
            <GifPicker accent={accent} onPick={pickGiphyGif} onPickFile={pickGifFile} />
        </AnchoredOverlay>

        <div
          className="vc-composer-pill"
          style={accent ? { '--composer-accent': accent } : undefined}
        >
          <div className="vc-composer-entry">
            <button
              ref={attachBtnRef}
              type="button"
              onClick={() => setAttachMenuOpen((open) => !open)}
              disabled={disabled || !!editingMessage}
              className={`vc-composer-icon vc-composer-plus ${attachMenuOpen ? 'is-active' : ''}`}
              aria-label="Adicionar conteudo"
              aria-haspopup="menu"
              aria-expanded={attachMenuOpen}
              title="Adicionar conteudo"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
            <AnchoredOverlay
              open={attachMenuOpen}
              portal={false}
              ref={attachMenuRef}
              anchorRef={attachBtnRef}
              onClose={() => setAttachMenuOpen(false)}
              placement="top"
              className="vc-composer-add-menu"
              role="menu"
              aria-label="Adicionar a mensagem"
            >
                <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); pickFile() }}>
                  <FileText size={15} /> Arquivo
                </button>
                <button type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); pickImage() }}>
                  <ImageIcon size={15} /> Imagem
                </button>
                <button ref={gifBtnRef} type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); toggleGif() }}>
                  <Film size={15} /> GIF
                </button>
                <button ref={emojiBtnRef} type="button" role="menuitem" onClick={() => { setAttachMenuOpen(false); toggleEmoji() }}>
                  <Smile size={15} /> Emoji
                </button>
            </AnchoredOverlay>
            <input ref={fileInputRef} type="file" accept={FILE_ACCEPT} multiple className="hidden" onChange={handleFile} />
            <input ref={imageInputRef} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={handleFile} />
          </div>

          <div className="vc-composer-text-wrap">
            <textarea
              ref={taRef}
              value={text}
              onChange={(event) => {
                const next = event.target.value
                setText(next)
                if (composerError) setComposerError(null)
                refreshMention(next, event.target.selectionStart)
              }}
              onKeyDown={handleKey}
              onPaste={handlePaste}
              onClick={(event) => refreshMention(text, event.currentTarget.selectionStart)}
              onSelect={(event) => refreshMention(text, event.currentTarget.selectionStart)}
              onBlur={() => { if (!editingMessage) persistDraft(textRef.current) }}
              rows={1}
              disabled={disabled}
              placeholder=""
              aria-label={placeholder}
              aria-controls={autocomplete?.controls}
              aria-expanded={!!autocomplete}
              aria-autocomplete="list"
              aria-activedescendant={autocomplete?.activeId}
              aria-describedby={composerError ? 'vc-composer-error' : undefined}
              spellCheck
              lang="pt-BR"
              autoCorrect="on"
              autoCapitalize="sentences"
              className="vc-composer-textarea"
              style={{ maxHeight: TEXTAREA_MAX_PX }}
            />
            {!text && attachments.length === 0 && (
              <div className="vc-composer-placeholder" aria-hidden>
                {placeholder || (channelName ? `Conversar em ${channelName}...` : 'Escreva uma mensagem...')}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            className="vc-composer-send"
            data-sending={sending}
            aria-label={sending ? 'Enviando mensagem' : 'Enviar mensagem'}
            title={sending ? 'Enviando...' : 'Enviar'}
          >
            {sending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} strokeWidth={2.4} className="vc-composer-send-icon" />}
            <span className="vc-composer-send-label">{sending ? 'Enviando...' : 'Enviar'}</span>
          </button>
        </div>
      </div>

      {dragOver && (
        <div className="vc-composer-drop" aria-hidden>
          Solte o arquivo aqui pra anexar
        </div>
      )}

      <AnchoredOverlay
        open={!!slash?.anchor}
        anchorRef={taRef}
        onClose={() => setSlash(null)}
        placement="top"
        className="vc-slash-suggestions"
        id="vc-slash-suggestions"
        role="listbox"
        aria-label="Comandos disponíveis"
        style={slash?.anchor ? { left: slash.anchor.left, bottom: Math.max(12, window.innerHeight - slash.anchor.top + 8) } : undefined}
        onMouseDown={(event) => event.preventDefault()}
      >
        <div className="vc-slash-suggestions__title">Comandos</div>
        {slash?.items?.length ? slash.items.map((command) => (
          <button
            key={command.id}
            type="button"
            id={optionDomId('vc-slash-option', command.id)}
            role="option"
            aria-selected={slash.selectedId === command.id}
            className={slash.selectedId === command.id ? 'is-selected' : ''}
            onMouseEnter={() => setSlash((value) => value ? { ...value, selectedId: command.id } : value)}
            onClick={() => selectSlashCommand(command)}
          >
            <strong>/{command.id}</strong><span>{command.label}</span>
          </button>
        )) : <p>Nenhum comando compatível.</p>}
      </AnchoredOverlay>

      <MentionSuggestions
        open={!!mention?.anchor}
        anchorRef={taRef}
        id="vc-mention-suggestions"
        optionIdPrefix="vc-mention-option"
        anchor={mention?.anchor}
        placement="top"
        kind={mention?.kind}
        query={mention?.query}
        items={mention?.items || []}
        selectedId={mention?.selectedId}
        currentUserId={currentUserId}
        onHover={(id) => setMention((value) => value ? { ...value, selectedId: id } : value)}
        onSelect={selectMentionItem}
        onClose={() => setMention(null)}
      />
    </div>
  )
}

function isImageAttachment(att) {
  if (!att) return false
  return att.kind === 'image' || String(att.type || '').startsWith('image/')
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
