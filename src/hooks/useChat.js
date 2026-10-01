/**
 * useChat — manages messages and file transfers over an RTCDataChannel,
 * scoped to a specific Sala (room). The channel itself is created by the
 * caller (via useTextRoomChannel) BEFORE the WebRTC negotiation so the
 * SDP includes the data m-line.
 *
 * Why the caller owns the channel:
 *   - The host must create the channel BEFORE sending the offer so the
 *     SDP includes the data-channel m-line. Doing it from inside this
 *     hook would race the first onnegotiationneeded callback.
 *   - Keeping the channel out of hook state also lets us avoid re-creating
 *     it across React re-renders.
 *
 * Outbound messages look like:
 *   { kind: 'msg',   id, ts, author, text, attachment? }
 *   { kind: 'sys',   id, ts, text }     // local-only (e.g. "peer entrou")
 *
 * Inbound binary messages are file chunks with a 12-byte header:
 *   - 8 bytes  id (ASCII, zero-padded)
 *   - 4 bytes  offset (uint32 BE)
 *   - rest     payload bytes
 *
 * Returns:
 *   - messages:           ordered array of { id, ts, author, text, kind,
 *                          direction, status?, attachment? }
 *   - files:              array of in-flight and completed transfers
 *   - ready:              true when the channel is open
 *   - connectionState:    'connecting' | 'open' | 'closing' | 'closed'
 *   - historyReady:       true when cached/Firestore history can be rendered
 *   - sendMessage({ text, attachment? })
 *   - sendFile(file)
 *   - clear()
 *   - postSystem(text)
 *   - retry(msgId)
 *
 * Persistence: keyed by `roomKey` (e.g. `${spaceId}:${roomId}`), trimmed
 * to the most recent MAX_PERSISTED messages. Dedup is id-based so the
 * server's hello/redelivery won't double our history.
 */
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import {
  listenRoomLikes, likeMessageKeys, unlikeMessageKeys,
} from '../shared/firebase/likes'
import {
  listenRoomReactions, reactToMessage, unreactToMessage,
} from '../shared/firebase/reactions'
import {
  bumpReaction as bumpFrequent, unbumpReaction as unbumpFrequent,
} from '../shared/firebase/frequentReactions'
import {
  enqueueMessage as outboxEnqueue,
  getAll as outboxGetAll, subscribe as outboxSubscribe,
  updateMessagePayload as outboxUpdatePayload,
} from '../shared/chat/chatOutbox'
import {
  setSender as dispatcherSetSender, setActiveUid as dispatcherSetActiveUid,
  start as dispatcherStart, flush as dispatcherFlush, retryNow as dispatcherRetryNow,
  cancel as dispatcherCancel, isCanceled as dispatcherIsCanceled,
} from '../shared/chat/outboxDispatcher'
import { flashToast } from '../shared/utils/toast'
import { resolveMessageIdentity } from '../features/chat/messageIdentity.js'

const CHUNK_SIZE = 16 * 1024  // 16 KiB
const CHAT_STORAGE_PREFIX = 'voicecraft:chat:'
const MAX_PERSISTED = 500
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_ATTACHMENTS = 10
const MAX_INLINE_DATA_URL = 200_000

function uid() {
  // Kept for legacy non-message ids (system events, transfer ids).
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function genMessageId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return uid()
}

function storageKey(roomKey) {
  return roomKey ? `${CHAT_STORAGE_PREFIX}${roomKey}` : null
}

function historyRoomIds(roomKey) {
  const raw = String(roomKey || '')
  const separator = raw.indexOf(':')
  if (separator <= 0 || separator === raw.length - 1) return null
  const spaceId = raw.slice(0, separator)
  const roomId = raw.slice(separator + 1)
  if (!spaceId || spaceId === 'nospace' || !roomId) return null
  return { spaceId, roomId }
}

function canListenToHistory(signaling, roomKey) {
  return !!historyRoomIds(roomKey) && typeof signaling?.listenChat === 'function'
}

function loadHistory(roomKey) {
  const key = storageKey(roomKey)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function saveHistory(roomKey, messages) {
  const key = storageKey(roomKey)
  if (!key) return
  try {
    const trimmed = messages.slice(-MAX_PERSISTED)
    localStorage.setItem(key, JSON.stringify(trimmed))
  } catch {}
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('file read failed'))
    r.readAsDataURL(file)
  })
}

function persistableAttachment(attachment) {
  if (!attachment) return undefined
  const next = {
    kind: attachment.kind || ((attachment.type || '').startsWith('image/') ? 'image' : 'file'),
    name: attachment.name || 'arquivo',
    type: attachment.type || 'application/octet-stream',
    size: attachment.size || 0,
  }
  if (attachment.url) next.url = attachment.url
  else if (attachment.dataUrl && attachment.dataUrl.length <= MAX_INLINE_DATA_URL) {
    next.dataUrl = attachment.dataUrl
  }
  if (attachment.sticker) next.sticker = true
  for (const key of ['width', 'height', 'w', 'h']) {
    const value = Number(attachment[key])
    if (Number.isFinite(value) && value > 0) next[key] = value
  }
  return next
}

function normalizeIncomingAttachments(msg) {
  if (!msg) return []
  if (Array.isArray(msg.attachments) && msg.attachments.length) {
    return msg.attachments.filter(Boolean)
  }
  if (msg.attachment) return [msg.attachment]
  return []
}

export function messageAttachments(msg) {
  return normalizeIncomingAttachments(msg)
}

function persistableMessage(msg) {
  const out = {
    kind: 'msg',
    id: msg.id,
    ts: msg.ts,
    author: msg.author,
    text: msg.text || '',
    authorId: msg.authorId || null,
  }
  if (msg.authorHandle) out.authorHandle = msg.authorHandle
  if (msg.authorPhoto) out.authorPhoto = msg.authorPhoto
  const list = normalizeIncomingAttachments(msg)
    .map(persistableAttachment)
    .filter(Boolean)
  if (list.length === 1) out.attachment = list[0]
  if (list.length > 1) {
    out.attachments = list
    out.attachment = list[0]
  } else if (list.length === 1) {
    // already set attachment
  }
  if (msg.replyToId) out.replyToId = msg.replyToId
  if (msg.threadRootId) out.threadRootId = String(msg.threadRootId)
  if (Number.isFinite(Number(msg.replyCount))) out.replyCount = Math.max(0, Number(msg.replyCount))
  if (Array.isArray(msg.mentions) && msg.mentions.length) out.mentions = msg.mentions
  if (msg.editedAt) { out.edited = true; out.editedAt = msg.editedAt }
  return out
}

function outboxMessageStatus(item) {
  if (item?.status === 'permanent-failed') return 'permanent-failed'
  if (item?.status === 'pending' && Number(item?.attempts) > 0) return 'failed'
  return 'sending'
}

function toStoredAtt(attachment) {
  if (!attachment) return null
  const kind = (attachment?.type || '').startsWith('image/') || attachment?.kind === 'image'
    ? 'image'
    : 'file'
  const out = {
    kind,
    name: attachment.name || (kind === 'image' ? 'imagem' : 'arquivo'),
    type: attachment.type || 'application/octet-stream',
    size: attachment.size || 0,
    dataUrl: attachment.dataUrl || null,
    previewUrl: attachment.previewUrl || null,
    url: attachment.url || null,
    file: attachment.file || null,
  }
  if (attachment.sticker) out.sticker = true
  for (const key of ['width', 'height', 'w', 'h']) {
    const value = Number(attachment[key])
    if (Number.isFinite(value) && value > 0) out[key] = value
  }
  return out
}

export function useChat({
  channel,
  signaling,
  username,
  roomKey,
  spaceId = null,
  roomId = null,
  userId,
  authorProfile,
}) {
  const transfersRef = useRef(new Map())
  // Load cached history synchronously so opening a Sala with prior history
  // never flashes a loading state.
  const [messages, setMessages] = useState(() => loadHistory(roomKey) || [])
  const [files, setFiles] = useState([])
  const [ready, setReady] = useState(false)
  const [connectionState, setConnectionState] = useState(
    channel ? (channel.readyState || 'connecting') : 'connecting'
  )
  const [historyStatus, setHistoryStatus] = useState(() => ({
    roomKey: roomKey || null,
    // A parsed array (including []) is usable cache. If history cannot be
    // listened to, render local state instead of leaving the timeline blocked.
    ready: loadHistory(roomKey) !== null || !canListenToHistory(signaling, roomKey),
  }))
  const historyReady = historyStatus.roomKey === (roomKey || null) && historyStatus.ready

  /* Fonte da verdade dos likes: Map<msgId, likes[]>. Persiste entre
   * renders do React e sobrevive ao re-seed de history quando trocamos
   * de sala. Atualizado pelo listener RTDB e consumido por todas as
   * mutações em `messages` (helper `applyLikes`).                     */
  const likesFromServerRef = useRef(new Map())

  /* Fonte da verdade das reactions: Map<msgId, {emoji: userId[]}>.
   * Mesma estratégia dos likes — autoritativo, atualizado pelo
   * listener RTDB e re-aplicado em qualquer mutação de messages. */
  const reactionsFromServerRef = useRef(new Map())
  const reactionMutationRef = useRef(new Map())
  const chanMutationRef = useRef(null)

  /* Outbox integration — Fase 3:
   *   - Register sender with the dispatcher on mount/uid change.
   *   - Reconcile any pending outbox items for this roomKey into the
   *     message stream (so reloads show sending/failed bubbles).
   *   - Trigger flush on mount.                                          */
  useEffect(() => {
    if (!userId) return
    dispatcherSetActiveUid(userId)
    const unregisterSender = dispatcherSetSender(async (item) => {
      if (dispatcherIsCanceled(item.id)) return
      // Reconstruct the wire message from the outbox payload.
      const rawKey = item.roomKey
      const sep = rawKey.indexOf(':')
      const chatSpaceId = sep >= 0 ? rawKey.slice(0, sep) : null
      const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : rawKey
      const sourceAttachments = item.payload?.attachments || []
      const persisted = new Array(sourceAttachments.length)
      for (let index = 0; index < sourceAttachments.length; index += 1) {
        if (dispatcherIsCanceled(item.id)) return
        const source = sourceAttachments[index]
        const uploadBody = source.blob || source.file || null
        let url = source.url || null
        if (!url && uploadBody) {
          if (typeof signaling?.uploadChatFile !== 'function') {
            throw new Error('Upload de anexo indisponivel')
          }
          url = await signaling.uploadChatFile(uploadBody, chatRoomId, chatSpaceId)
          if (dispatcherIsCanceled(item.id)) return
          if (!url) throw new Error('Upload sem URL')
        }
        if (!url && !source.dataUrl) throw new Error('Anexo incompleto - envie de novo')
        const { blob, file, previewUrl, ...metadata } = source
        persisted[index] = {
          ...metadata,
          kind: source.kind || ((source.type || '').startsWith('image/') ? 'image' : 'file'),
          name: source.name || 'arquivo',
          type: source.type || 'application/octet-stream',
          size: Number(source.size) || 0,
          url,
          dataUrl: source.dataUrl || null,
        }
        if (uploadBody) {
          // Save every completed URL immediately. If the process stops between
          // attachments, already-uploaded files are not uploaded or lost again.
          await outboxUpdatePayload(item.id, {
            ...item.payload,
            attachments: sourceAttachments.map((entry, entryIndex) => (
              persisted[entryIndex] || entry
            )),
          })
        }
      }
      const wire = persistableMessage({
        kind: 'msg',
        id: item.id,
        ts: item.createdAt,
        author: item.payload?.author?.name || 'você',
        authorId: item.payload?.author?.id || userId,
        authorHandle: item.payload?.author?.handle || '',
        authorPhoto: item.payload?.author?.photo || '',
        text: item.payload?.text || '',
        replyToId: item.payload?.replyToId || null,
        threadRootId: item.payload?.threadRootId || null,
        mentions: item.payload?.mentions || [],
        attachment: persisted[0] || undefined,
        attachments: persisted.length > 1 ? persisted : undefined,
      })
      const isCurrentRoom = item.roomKey === roomKey
      if (isCurrentRoom) {
        replaceMessage(item.id, {
          attachment: persisted[0] || undefined,
          attachments: persisted.length > 1 ? persisted : undefined,
        })
      }
      if (dispatcherIsCanceled(item.id)) return
      const dc = channelRef?.current
      if (isCurrentRoom && dc?.readyState === 'open') {
        try { dc.send(JSON.stringify(wire)) } catch (err) {
          console.warn('[outbox] p2p send failed:', err)
        }
      }
      if (typeof signaling?.sendChatMessage !== 'function') {
        throw new Error('Persistencia do chat indisponivel')
      }
      if (dispatcherIsCanceled(item.id)) return
      await signaling.sendChatMessage(wire, chatRoomId, chatSpaceId)
      if (dispatcherIsCanceled(item.id)) return
      // Reflect success in local state if still pending.
      if (isCurrentRoom) {
        setMessages((prev) => {
          if (!prev.find((m) => m.id === item.id)) return prev
          const next = prev.map((m) => (m.id === item.id ? { ...m, status: 'sent' } : m))
          saveHistory(roomKey, next)
          return next
        })
      }
    })
    dispatcherStart()
    void dispatcherFlush(userId)
    return unregisterSender
  }, [userId, signaling, roomKey])

  // Channel ref so the dispatcher sender can access the latest channel
  // without re-registering on every channel change.
  const channelRef = useRef(channel)
  channelRef.current = channel

  /* Reconcile outbox into messages on mount / roomKey change. */
  useEffect(() => {
    if (!userId || !roomKey) return
    let cancelled = false
    ;(async () => {
      try {
        const items = await outboxGetAll(userId)
        const mine = items.filter((m) => m.roomKey === roomKey)
        if (!mine.length || cancelled) return
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]))
          let changed = false
          for (const item of mine) {
            const existing = byId.get(item.id)
            const outboxAttachments = item.payload?.attachments || []
            if (existing) {
              byId.set(item.id, {
                ...existing,
                text: item.payload?.text ?? existing.text,
                attachment: outboxAttachments[0] || existing.attachment,
                attachments: outboxAttachments.length > 1 ? outboxAttachments : existing.attachments,
                replyToId: item.payload?.replyToId || existing.replyToId || null,
                threadRootId: item.payload?.threadRootId || existing.threadRootId || null,
                mentions: item.payload?.mentions || existing.mentions || [],
                status: outboxMessageStatus(item),
              })
              changed = true
              continue
            }
            byId.set(item.id, {
              id: item.id,
              kind: 'msg',
              ts: item.createdAt,
              text: item.payload?.text || '',
              attachment: (item.payload?.attachments || [])[0] || undefined,
              attachments: (item.payload?.attachments || []).length > 1 ? item.payload.attachments : undefined,
              replyToId: item.payload?.replyToId || null,
              threadRootId: item.payload?.threadRootId || null,
              mentions: item.payload?.mentions || [],
              author: item.payload?.author?.name || 'você',
              authorId: item.payload?.author?.id || userId,
              authorHandle: item.payload?.author?.handle || '',
              authorPhoto: item.payload?.author?.photo || '',
              direction: 'out',
              status: outboxMessageStatus(item),
            })
            changed = true
          }
          if (!changed) return prev
          const next = Array.from(byId.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0))
          saveHistory(roomKey, next)
          return next
        })
      } catch (err) {
        console.warn('[outbox] reconcile:', err)
      }
    })()
    return () => { cancelled = true }
  }, [userId, roomKey])

  useEffect(() => {
    if (!userId || !roomKey) return undefined
    return outboxSubscribe((event) => {
      const item = event.item
      if (item && (item.uid !== userId || item.roomKey !== roomKey)) return
      const id = event.id || item?.id
      if (!id) return
      setMessages((prev) => {
        const matches = (message) => message.id === id || message.firestoreId === id
        if (event.type === 'canceled') {
          if (!prev.some(matches)) return prev
          const next = prev.filter((message) => !matches(message))
          saveHistory(roomKey, next)
          return next
        }
        const status = event.type === 'sent'
          ? 'sent'
          : (event.type === 'permanent-failed' ? 'permanent-failed'
            : (event.type === 'failed' ? 'failed' : 'sending'))
        if (!prev.some(matches)) return prev
        const next = prev.map((message) => matches(message) ? { ...message, status } : message)
        saveHistory(roomKey, next)
        return next
      })
    })
  }, [userId, roomKey])

  /** Resolve likes for a message — prefer exact id, then firestoreId. */
  const lookupServerLikes = useCallback((m) => {
    if (!m) return undefined
    const map = likesFromServerRef.current
    if (m.id != null && map.has(m.id)) return map.get(m.id)
    if (m.firestoreId != null && map.has(m.firestoreId)) return map.get(m.firestoreId)
    return undefined
  }, [])

  /** Helper — aplica os likes do servidor numa lista de mensagens.
   *  Só pula msgs cujo id ainda não existe no Map (permite optimistic
   *  local). Usa Map.has — array vazio [] também é estado válido.   */
  const applyLikes = useCallback((list) => {
    if (!list || list.length === 0) return list
    let changed = false
    const next = list.map((m) => {
      if (!m || !m.id) return m
      const fromServer = lookupServerLikes(m)
      if (fromServer === undefined) return m
      const local = Array.isArray(m.likes) ? m.likes : []
      if (local.length === fromServer.length
          && local.every((u, i) => u === fromServer[i])) {
        return m
      }
      changed = true
      return { ...m, likes: fromServer }
    })
    return changed ? next : list
  }, [lookupServerLikes])

  const syncLikesMapKeys = useCallback((msgIds, nextLikes) => {
    const map = likesFromServerRef.current
    const ids = [...new Set((msgIds || []).filter(Boolean))]
    for (const id of ids) map.set(id, nextLikes)
  }, [])

  /** Helper — aplica as reactions do servidor. Converte a estrutura
   *  interna (por-msgId: emoji → userId[]) pro shape esperado pelo
   *  componente EmojiReactions: { emoji: { count, mine[] } }.          */
  const applyReactions = useCallback((list) => {
    if (!list || list.length === 0) return list
    let changed = false
    const next = list.map((m) => {
      if (!m || (!m.id && !m.firestoreId)) return m
      const store = reactionsFromServerRef.current
      const fromServer = (m.id != null && store.has(m.id))
        ? store.get(m.id)
        : (m.firestoreId != null ? store.get(m.firestoreId) : undefined)
      if (!fromServer) return m
      const local = m.reactions || {}
      /* Compara profundamente por chaves/valores. */
      const sameShape = Object.keys(fromServer).length === Object.keys(local).length
        && Object.keys(fromServer).every((emoji) => {
          const a = fromServer[emoji] || []
          const b = local[emoji]?.users || []
          return a.length === b.length && a.every((u, i) => u === b[i])
        })
      if (sameShape) return m
      const built = {}
      Object.keys(fromServer).forEach((emoji) => {
        const users = fromServer[emoji] || []
        if (users.length === 0) return
        built[emoji] = {
          count: users.length,
          users,
          mine: userId ? users.includes(userId) : false,
        }
      })
      changed = true
      return { ...m, reactions: built }
    })
    return changed ? next : list
  }, [userId])

  // Re-seed history when roomKey changes (different Sala). Re-apply
  // whatever likes are already in the Map (listener may have fired).
  useLayoutEffect(() => {
    const cached = loadHistory(roomKey)
    const seeded = cached || []
    setHistoryStatus({
      roomKey: roomKey || null,
      ready: cached !== null || !canListenToHistory(signaling, roomKey),
    })
    setMessages(applyLikes(seeded))
    setFiles([])
    // Don't reset `ready` here — it makes the Composer flash "Reconnecting…"
    // on every room open. The channel's readyState (managed below) already
    // reflects the live P2P status, and the cached history is good enough
    // to render immediately without depending on the data channel.
    setConnectionState(channel ? (channel.readyState || 'connecting') : 'connecting')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey])

  /* Subscribe aos likes do RTDB — autoritativo. Atualiza o ref de
   * likes e re-aplica nas mensagens atuais. Também captura curtidas
   * feitas em mensagens que podem ainda não ter chegado do Firestore
   * (ficam guardadas no Map até a mensagem aparecer).              */
  useEffect(() => {
    if (!spaceId || !roomId) return undefined
    const off = listenRoomLikes(spaceId, roomId, (map) => {
      const store = likesFromServerRef.current
      store.clear()
      Object.keys(map).forEach((msgId) => {
        store.set(msgId, Array.isArray(map[msgId]) ? map[msgId] : [])
      })
      setMessages((prev) => {
        const next = applyLikes(prev)
        if (next !== prev) saveHistory(roomKey, next)
        return next
      })
    })
    return off
  }, [spaceId, roomId, roomKey, applyLikes])

  /* Subscribe às reactions do RTDB — autoritativo. Mesma estratégia
   * dos likes: atualiza o ref autoritativo e re-aplica em todas as
   * mensagens. Captura reactions feitas em mensagens ainda não
   * carregadas do Firestore (guardadas no Map).                    */
  useEffect(() => {
    if (!spaceId || !roomId) return undefined
    const off = listenRoomReactions(spaceId, roomId, (map) => {
      const ref = reactionsFromServerRef.current
      ref.clear()
      Object.keys(map).forEach((msgId) => {
        ref.set(msgId, map[msgId] || {})
      })
      setMessages(prev => {
        const next = applyReactions(prev)
        if (next !== prev) saveHistory(roomKey, next)
        return next
      })
    })
    return off
  }, [spaceId, roomId, roomKey, applyReactions])

  useEffect(() => {
    const activeRoomKey = roomKey || null
    const ids = historyRoomIds(roomKey)
    const finishWithoutRemoteHistory = (err) => {
      if (err) console.warn('[chat] history listener:', err)
      setHistoryStatus({ roomKey: activeRoomKey, ready: true })
    }
    if (!ids || typeof signaling?.listenChat !== 'function') {
      finishWithoutRemoteHistory()
      return undefined
    }
    let active = true
    const onHistory = (list) => {
      if (!active || !Array.isArray(list)) return
      const remote = list.map((m) => ({
        ...m,
        kind: m.kind || 'msg',
        deleted: !!m.deleted,
        pinned: !!m.pinned,
        text: m.deleted ? '' : (m.text || ''),
        attachment: m.deleted ? undefined : (m.attachment || undefined),
        attachments: m.deleted
          ? undefined
          : (Array.isArray(m.attachments) && m.attachments.length ? m.attachments : undefined),
        replyToId: m.replyToId || null,
        threadRootId: m.threadRootId || null,
        replyCount: Math.max(0, Number(m.replyCount) || 0),
        mentions: Array.isArray(m.mentions) ? m.mentions : [],
        edited: !!m.editedAt || !!m.edited,
        editedAt: m.editedAt || null,
        direction: m.authorId && userId && m.authorId === userId ? 'out' : (m.direction || 'in'),
        status: m.authorId && userId && m.authorId === userId ? 'sent' : m.status,
      }))
      setMessages((prev) => {
        const ids = new Set(remote.flatMap((m) => [m.id, m.firestoreId]).filter(Boolean))
        const pending = prev.filter((m) => (
          m.direction === 'out'
          && ['sending', 'failed', 'permanent-failed'].includes(m.status)
          && m.id
          && !ids.has(m.id)
          && !dispatcherIsCanceled(m.id)
        ))
        let next = applyLikes([...remote, ...pending].sort((a, b) => (a.ts || 0) - (b.ts || 0)))
        next = applyReactions(next)
        saveHistory(roomKey, next)
        return next
      })
      setHistoryStatus({ roomKey: activeRoomKey, ready: true })
    }
    const onHistoryError = (err) => {
      if (active) finishWithoutRemoteHistory(err)
    }
    let unsubscribe
    try {
      unsubscribe = signaling.listenChat(ids.spaceId, ids.roomId, onHistory, onHistoryError)
    } catch (err) {
      finishWithoutRemoteHistory(err)
    }
    return () => {
      active = false
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [roomKey, signaling, userId, applyLikes, applyReactions])

  // ----- Helpers that update state ------------------------------------------
  const appendMessage = useCallback((msg) => {
    setMessages(prev => {
      // Id-based dedup. Server may re-deliver messages on reconnect.
      if (msg.id && prev.some(m => m.id === msg.id)) return prev
      let next = applyLikes([...prev, msg])
      next = applyReactions(next)
      saveHistory(roomKey, next)
      return next
    })
  }, [roomKey, applyLikes, applyReactions])

  const replaceMessage = useCallback((id, patch) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, ...patch } : m)
      saveHistory(roomKey, next)
      return next
    })
  }, [roomKey])

  const updateTransfer = useCallback((id, patch) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }, [])

  const addTransfer = useCallback((transfer) => {
    setFiles(prev => prev.some(f => f.id === transfer.id) ? prev : [...prev, transfer])
  }, [])

  // ----- Wire the data channel ---------------------------------------------
  useEffect(() => {
    if (!channel) {
      setReady(false)
      setConnectionState('connecting')
      return
    }

    let unmounted = false
    channel.binaryType = 'arraybuffer'

    const reflectReadyState = () => {
      if (unmounted) return
      const s = channel.readyState
      setConnectionState(s)
      setReady(s === 'open')
    }

    const onOpen = () => {
      if (unmounted) return
      setReady(true)
      setConnectionState('open')
      try {
        channel.send(JSON.stringify({ kind: 'hello', ts: Date.now() }))
      } catch {}
    }
    const onClose = () => {
      if (unmounted) return
      setReady(false)
      setConnectionState('closed')
    }
    const onError = (err) => {
      console.warn('[chat] dc error:', err)
    }

    const onJson = (msg) => {
      switch (msg.kind) {
        case 'msg': {
          const list = normalizeIncomingAttachments(msg).map((a) => ({
            kind: a.kind || ((a.type || '').startsWith('image/') ? 'image' : 'file'),
            dataUrl: a.dataUrl || null,
            url: a.url || null,
            type: a.type || 'application/octet-stream',
            name: a.name || 'arquivo',
            size: a.size || 0,
            sticker: !!a.sticker,
            width: a.width || a.w || null,
            height: a.height || a.h || null,
          })).filter((a) => a.url || a.dataUrl)
          appendMessage({
            id: msg.id || uid(),
            ts: msg.ts || Date.now(),
            author: msg.author || 'peer',
            authorId: msg.authorId || null,
            authorHandle: msg.authorHandle || '',
            authorPhoto: msg.authorPhoto || '',
            text: String(msg.text || ''),
            kind: 'msg',
            direction: 'in',
            attachment: list[0] || null,
            attachments: list.length > 1 ? list : undefined,
            replyToId: msg.replyToId || null,
            threadRootId: msg.threadRootId || null,
            replyCount: Math.max(0, Number(msg.replyCount) || 0),
            mentions: Array.isArray(msg.mentions) ? msg.mentions : [],
            edited: !!msg.editedAt || !!msg.edited,
            editedAt: msg.editedAt || null,
          })
          break
        }
        case 'like':
        case 'unlike': {
          // Peer curtiu / descurtiu uma mensagem. Idempotente: chegar
          // duas vezes não duplica o userId. Também espelha no Map
          // autoritativo pra o próximo snapshot do RTDB não “apagar”.
          if (!msg.msgId || !msg.userId) break
          setMessages(prev => {
            const next = prev.map(m => {
              if (m.id !== msg.msgId && m.firestoreId !== msg.msgId) return m
              const likes = Array.isArray(m.likes) ? [...m.likes] : []
              const idx = likes.indexOf(msg.userId)
              if (msg.kind === 'like' && idx === -1) likes.push(msg.userId)
              else if (msg.kind === 'unlike' && idx !== -1) likes.splice(idx, 1)
              const keyIds = [m.id, m.firestoreId].filter(Boolean)
              for (const id of keyIds) likesFromServerRef.current.set(id, likes)
              return { ...m, likes }
            })
            saveHistory(roomKey, next)
            return next
          })
          break
        }
        case 'edit': {
          if (!msg.msgId || !msg.authorId) break
          setMessages((prev) => {
            const next = prev.map((m) => (
              (m.id === msg.msgId || m.firestoreId === msg.msgId) && m.authorId === msg.authorId
                ? { ...m, text: String(msg.text || ''), mentions: msg.mentions || [], edited: true, editedAt: msg.editedAt || Date.now() }
                : m
            ))
            saveHistory(roomKey, next)
            return next
          })
          break
        }
        case 'delete': {
          if (!msg.msgId) break
          setMessages(prev => {
            const next = prev.map(m => (
              (m.id === msg.msgId || m.firestoreId === msg.msgId)
                ? { ...m, deleted: true, text: '', attachment: undefined, attachments: undefined }
                : m
            ))
            saveHistory(roomKey, next)
            return next
          })
          break
        }
        case 'purge': {
          setMessages((prev) => {
            const next = prev.filter((m) => {
              if (m.kind === 'sys') return true
              if (msg.authorId) {
                const mid = m.authorId || null
                return mid !== msg.authorId
              }
              return false
            })
            saveHistory(roomKey, next)
            return next
          })
          break
        }
        case 'file-meta': {
          const t = {
            id: msg.id,
            name: msg.name,
            size: msg.size,
            type: msg.type || 'application/octet-stream',
            author: msg.author || 'peer',
            direction: 'in',
            progress: 0,
            status: 'receiving',
            chunks: [],
          }
          transfersRef.current.set(msg.id, t)
          addTransfer(t)
          break
        }
        case 'hello':
          // Presence ping — currently a no-op.
          break
      }
    }

    const onBinary = (data) => {
      if (!(data instanceof ArrayBuffer)) return
      const idBytes = new Uint8Array(data, 0, 8)
      let id = ''
      for (let i = 0; i < 8; i++) {
        const c = idBytes[i]
        if (c === 0) break
        id += String.fromCharCode(c)
      }
      const view = new DataView(data)
      const offset = view.getUint32(8)
      const payload = new Uint8Array(data, 12)
      const t = transfersRef.current.get(id)
      if (!t || t.status !== 'receiving') return
      t.chunks.push({ offset, payload })
      const received = t.chunks.reduce((sum, c) => sum + c.payload.byteLength, 0)
      const progress = Math.min(1, received / t.size)
      if (received >= t.size) {
        t.chunks.sort((a, b) => a.offset - b.offset)
        const all = new Uint8Array(t.size)
        let pos = 0
        for (const c of t.chunks) {
          all.set(c.payload, pos)
          pos += c.payload.byteLength
        }
        const blob = new Blob([all], { type: t.type })
        const url = URL.createObjectURL(blob)
        transfersRef.current.delete(id)
        updateTransfer(id, { progress: 1, status: 'done', url, blob })
      } else {
        updateTransfer(id, { progress })
      }
    }

    const onMessage = (e) => {
      if (typeof e.data === 'string') {
        try { onJson(JSON.parse(e.data)) } catch (err) { console.warn('[chat] bad json:', err) }
      } else {
        onBinary(e.data)
      }
    }

    channel.addEventListener('open', onOpen)
    channel.addEventListener('close', onClose)
    channel.addEventListener('error', onError)
    channel.addEventListener('message', onMessage)

    reflectReadyState()

    return () => {
      unmounted = true
      channel.removeEventListener('open', onOpen)
      channel.removeEventListener('close', onClose)
      channel.removeEventListener('error', onError)
      channel.removeEventListener('message', onMessage)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel])

  // ----- System messages (local-only) --------------------------------------
  const postSystem = useCallback((text) => {
    appendMessage({
      id: uid(),
      ts: Date.now(),
      text: String(text || ''),
      kind: 'sys',
      direction: 'local',
    })
  }, [appendMessage])

  // Announce join/leave based on signaling events.
  useEffect(() => {
    const sig = signaling
    if (!sig) return
    const onJoin = () => postSystem('peer entrou na sala')
    const onLeave = () => postSystem('peer saiu da sala')
    sig.peerJoinedCallback = onJoin
    sig.peerLeftCallback = onLeave
    return () => {
      if (sig.peerJoinedCallback === onJoin) sig.peerJoinedCallback = null
      if (sig.peerLeftCallback === onLeave) sig.peerLeftCallback = null
    }
  }, [signaling, postSystem])

  // ----- Outbound actions ---------------------------------------------------
  const sendMessage = useCallback(async ({ text, attachment, attachments, replyToId, threadRootId = null, mentions = [] } = {}) => {
    const trimmed = String(text || '').trim()
    const rawList = Array.isArray(attachments) && attachments.length
      ? attachments
      : (attachment ? [attachment] : [])
    const inputList = rawList.slice(0, MAX_ATTACHMENTS)
    if (!trimmed && inputList.length === 0) return false

    const rawKey = String(roomKey || '')
    const sep = rawKey.indexOf(':')
    const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : (rawKey || null)

    const id = genMessageId()
    const ts = Date.now()
    let storedList = inputList.map(toStoredAtt).filter(Boolean)

    const msg = {
      kind: 'msg',
      id,
      ts,
      author: authorProfile?.displayName || username || 'você',
      authorId: userId || signaling?.userId || null,
      authorHandle: authorProfile?.handle || '',
      authorPhoto: authorProfile?.photoURL || '',
      text: trimmed,
    }
    if (replyToId) msg.replyToId = String(replyToId)
    if (threadRootId) msg.threadRootId = String(threadRootId)
    if (Array.isArray(mentions) && mentions.length) msg.mentions = mentions

    appendMessage({
      ...msg,
      attachment: storedList[0] || undefined,
      attachments: storedList.length > 1 ? storedList : undefined,
      direction: 'out',
      status: 'sending',
    })

    // Persist to outbox BEFORE attempting transport so the message
    // survives a renderer reload / app crash mid-flight. We pass the
    // SAME id used in the message object so that markSent/markFailed
    // operate on the exact same outbox record (prevents duplicate sends).
    try {
      if (userId && rawKey) {
        await outboxEnqueue(userId, rawKey, id, {
          text: trimmed,
          attachments: storedList.map((a) => ({
            name: a.name,
            type: a.type,
            size: a.size,
            blob: a.file || null,
            url: a.url || null,
            dataUrl: a.dataUrl || null,
            previewUrl: a.previewUrl || null,
            kind: a.kind,
            sticker: !!a.sticker,
            width: a.width || a.w || null,
            height: a.height || a.h || null,
          })),
          replyToId: replyToId ? String(replyToId) : null,
          threadRootId: threadRootId ? String(threadRootId) : null,
          mentions: Array.isArray(mentions) ? mentions : [],
          author: {
            id: userId,
            name: msg.author,
            handle: msg.authorHandle,
            photo: msg.authorPhoto,
          },
        })
      }
    } catch (err) {
      console.warn('[outbox] enqueue failed:', err)
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== id)
        saveHistory(roomKey, next)
        return next
      })
      return false
    }

    // Acceptance means the durable enqueue succeeded. Do not hold the composer
    // open while Firebase delivery runs; dispatcher events own later UI state.
    void dispatcherFlush(userId).catch((err) => {
      console.warn('[chat] immediate dispatch deferred:', err)
    })
    return true
  }, [username, userId, authorProfile, appendMessage, replaceMessage, roomKey])

  const sendFile = useCallback((file) => {
    if (!file) return false
    const dc = channel
    if (!dc || dc.readyState !== 'open') return false
    if (dc.bufferedAmount > 4 * 1024 * 1024) return false
    const id = uid()
    const meta = {
      kind: 'file-meta',
      id,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      author: username || 'você',
    }
    try { dc.send(JSON.stringify(meta)) } catch (err) {
      console.warn('[chat] file meta failed:', err)
      return false
    }
    const transfer = {
      id,
      name: file.name,
      size: file.size,
      type: file.type,
      author: username || 'você',
      direction: 'out',
      progress: 0,
      status: 'sending',
    }
    transfersRef.current.set(id, transfer)
    addTransfer(transfer)

    const reader = new FileReader()
    let offset = 0

    const sendNext = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE)
      reader.readAsArrayBuffer(slice)
    }

    reader.onload = () => {
      const buf = reader.result
      if (!(buf instanceof ArrayBuffer)) return
      const header = new ArrayBuffer(12)
      const hv = new DataView(header)
      for (let i = 0; i < 8; i++) {
        hv.setUint8(i, i < id.length ? id.charCodeAt(i) : 0)
      }
      hv.setUint32(8, offset)
      const payload = new Uint8Array(12 + buf.byteLength)
      payload.set(new Uint8Array(header), 0)
      payload.set(new Uint8Array(buf), 12)

      const trySend = () => {
        if (dc.readyState !== 'open') {
          transfersRef.current.delete(id)
          updateTransfer(id, { status: 'failed' })
          return
        }
        try {
          dc.send(payload)
        } catch (err) {
          transfersRef.current.delete(id)
          updateTransfer(id, { status: 'failed' })
          return
        }
        offset += buf.byteLength
        updateTransfer(id, { progress: Math.min(1, offset / file.size) })
        if (offset >= file.size) {
          transfersRef.current.delete(id)
          updateTransfer(id, { status: 'done', progress: 1 })
        } else {
          if (dc.bufferedAmount > 256 * 1024) {
            setTimeout(trySend, 50)
          } else {
            setTimeout(sendNext, 0)
          }
        }
      }
      trySend()
    }
    reader.onerror = () => {
      transfersRef.current.delete(id)
      updateTransfer(id, { status: 'failed' })
    }
    sendNext()
    return true
  }, [username, addTransfer, updateTransfer, channel])

  const retry = useCallback(async (msgId) => {
    const target = messages.find((message) => message.id === msgId || message.firestoreId === msgId)
    if (!target || (target.status !== 'failed' && target.status !== 'permanent-failed')) return false
    const outboxId = target.id || msgId
    replaceMessage(target.id, { status: 'sending' })
    try {
      await dispatcherRetryNow(outboxId)
      return true
    } catch (err) {
      console.warn('[chat] retry failed:', err)
      replaceMessage(target.id, { status: 'permanent-failed' })
      return false
    }
  }, [messages, replaceMessage])

  const cancelOutbox = useCallback(async (msgId) => {
    const target = messages.find((message) => message.id === msgId || message.firestoreId === msgId)
    const { outboxId, persistenceId: persistId } = resolveMessageIdentity(target, msgId)
    setMessages((prev) => {
      const next = prev.filter((message) => message.id !== outboxId && message.firestoreId !== msgId)
      saveHistory(roomKey, next)
      return next
    })
    try {
      await dispatcherCancel(outboxId)
      const rawKey = String(roomKey || '')
      const sep = rawKey.indexOf(':')
      const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : (rawKey || null)
      if (target && typeof signaling?.deleteChatMessage === 'function') {
        await signaling.deleteChatMessage(persistId, chatRoomId)
      }
      if (channel?.readyState === 'open') {
        channel.send(JSON.stringify({
          kind: 'delete', msgId: persistId,
          userId: userId || signaling?.userId || null, ts: Date.now(),
        }))
      }
      return true
    } catch (err) {
      console.warn('[outbox] cancel:', err)
      flashToast('A mensagem foi cancelada, mas a exclusao remota nao foi confirmada.')
      return false
    }
  }, [messages, roomKey, signaling, channel, userId])

  const copyMessageText = useCallback(async (msgId) => {
    let text = ''
    setMessages((prev) => {
      const found = prev.find((m) => m.id === msgId || m.firestoreId === msgId)
      text = found?.text || ''
      return prev
    })
    if (!text) return false
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch (err) {
      console.warn('[chat] clipboard:', err)
    }
    return false
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    const key = storageKey(roomKey)
    if (key) try { localStorage.removeItem(key) } catch {}
  }, [roomKey])

  // ----- Reactions ---------------------------------------------------------
  // Reactions por msg: { emoji: { count, users: [userId, ...], mine } }.
  // Persistido no Firebase RTDB (autoritativo — sobrevive a troca de
  // sala e logout) e propagado via data channel (fast-path P2P).
  // Também bump na frequência local pra reordenar a quick bar.
  const toggleReaction = useCallback((msgId, emoji) => {
    if (!msgId || !emoji || !userId) return
    const target = messages.find((message) => message?.id === msgId || message?.firestoreId === msgId)
    if (!target) return
    const myId = userId
    const reactionId = target.id || target.firestoreId
    const keyIds = [...new Set([target.id, target.firestoreId].filter(Boolean))]
    const currentUsers = Array.isArray(target.reactions?.[emoji]?.users)
      ? [...target.reactions[emoji].users]
      : []
    const willReact = !currentUsers.includes(myId)
    const mutationKey = `${reactionId}:${emoji}:${myId}`
    const mutation = (reactionMutationRef.current.get(mutationKey) || 0) + 1
    reactionMutationRef.current.set(mutationKey, mutation)

    const applyUsers = (users) => {
      setMessages((prev) => {
        const next = prev.map((message) => {
          if (!keyIds.includes(message.id) && !keyIds.includes(message.firestoreId)) return message
          const reactions = { ...(message.reactions || {}) }
          if (users.length === 0) delete reactions[emoji]
          else reactions[emoji] = { count: users.length, users: [...users], mine: users.includes(myId) }
          return { ...message, reactions }
        })
        saveHistory(roomKey, next)
        return next
      })
      for (const key of keyIds) {
        const byEmoji = { ...(reactionsFromServerRef.current.get(key) || {}) }
        if (users.length) byEmoji[emoji] = [...users]
        else delete byEmoji[emoji]
        reactionsFromServerRef.current.set(key, byEmoji)
      }
    }

    const optimisticUsers = [...currentUsers]
    if (willReact) optimisticUsers.push(myId)
    else optimisticUsers.splice(optimisticUsers.indexOf(myId), 1)
    applyUsers(optimisticUsers)

    if (spaceId && roomId && reactionId) {
      const op = willReact
        ? reactToMessage(spaceId, roomId, reactionId, emoji, myId)
        : unreactToMessage(spaceId, roomId, reactionId, emoji, myId)
      op.catch((err) => {
        console.warn('[reactions] persist', err)
        if (reactionMutationRef.current.get(mutationKey) !== mutation) return
        applyUsers(currentUsers)
        flashToast('Nao foi possivel atualizar a reacao.')
      })
    }
    try {
      if (willReact) bumpFrequent(emoji)
      else unbumpFrequent(emoji)
    } catch { /* localStorage unavailable */ }
  }, [messages, roomKey, userId, spaceId, roomId])

  // ----- Chan (confirmed persistence + RTDB listener + P2P fast-path) -----
  // The configured persistence provider owns the write. In temporary unlimited
  // mode this is direct RTDB; future quota mode uses the authoritative callable.
  // Local state and P2P update only after that provider confirms the operation.
  const toggleLike = useCallback(async (msgId) => {
    if (!msgId || !userId || !spaceId || !roomId) {
      return { success: false, status: 'failed' }
    }
    if (chanMutationRef.current) {
      return { success: false, status: 'pending' }
    }

    const target = messages.find((message) => message.id === msgId || message.firestoreId === msgId)
    if (!target) return { success: false, status: 'failed' }

    const myId = userId
    const identity = resolveMessageIdentity(target, msgId)
    // Canonical Firestore id first; the callable validates every alias and
    // materializes all known keys for compatibility with older clients.
    const keyIds = [...new Set([identity.persistenceId, ...identity.aliases].filter(Boolean))]
    const currentlyHasChan = Array.isArray(target.likes) && target.likes.includes(myId)
    const operation = currentlyHasChan ? 'remove' : 'grant'
    chanMutationRef.current = identity.persistenceId || msgId

    try {
      const serverResult = currentlyHasChan
        ? await unlikeMessageKeys(spaceId, roomId, keyIds, myId)
        : await likeMessageKeys(spaceId, roomId, keyIds, myId)
      const granted = serverResult?.status !== 'removed'
      const confirmedIds = [...new Set([
        ...keyIds,
        serverResult?.messageId,
        ...(Array.isArray(serverResult?.messageIds) ? serverResult.messageIds : []),
      ].filter(Boolean))]
      let confirmedLikes = []

      setMessages((previous) => {
        const next = previous.map((message) => {
          if (!confirmedIds.includes(message.id) && !confirmedIds.includes(message.firestoreId)) return message
          const likes = Array.isArray(message.likes) ? message.likes.filter((uid) => uid !== myId) : []
          if (granted) likes.push(myId)
          confirmedLikes = likes
          return { ...message, likes }
        })
        syncLikesMapKeys(confirmedIds, confirmedLikes)
        saveHistory(roomKey, next)
        return next
      })

      try {
        if (channel?.readyState === 'open') {
          channel.send(JSON.stringify({
            kind: granted ? 'like' : 'unlike',
            msgId: identity.actionId || msgId,
            userId: myId,
            ts: Date.now(),
          }))
        }
      } catch {}

      return {
        ...serverResult,
        success: true,
        status: granted ? 'success' : 'removed',
        granted,
        removed: !granted,
      }
    } catch (error) {
      const code = String(error?.code || '').replace(/^functions\//, '')
      if (code === 'resource-exhausted') {
        const nextResetAt = error?.details?.nextResetAt || null
        let resetHint = ''
        if (nextResetAt) {
          const reset = new Date(nextResetAt)
          if (!Number.isNaN(reset.getTime())) {
            const time = reset.toLocaleTimeString('pt-BR', {
              hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
            })
            resetHint = ' Voc\u00ea poder\u00e1 dar outro ap\u00f3s ' + time + '.'
          }
        }
        flashToast('Seu Chan di\u00e1rio j\u00e1 foi usado.' + resetHint)
        return { success: false, status: 'exhausted', nextResetAt, details: error?.details || null }
      }
      console.warn('[chan] ' + operation + ' failed', error)
      flashToast(currentlyHasChan
        ? 'N\u00e3o foi poss\u00edvel remover o Chan. Tente novamente.'
        : 'N\u00e3o foi poss\u00edvel dar o Chan. Tente novamente.')
      return { success: false, status: 'failed', error }
    } finally {
      chanMutationRef.current = null
    }
  }, [channel, messages, userId, roomKey, spaceId, roomId, syncLikesMapKeys])

  // ----- Edit (own message only) -------------------------------------------
  const editMessage = useCallback(async (msgId, newText, mentions = []) => {
    const trimmed = String(newText || '').trim()
    if (!msgId || !trimmed) return false
    const target = messages.find((m) => m.id === msgId || m.firestoreId === msgId)
    if (!target || target.deleted || (target.authorId && target.authorId !== userId) || target.status === 'sending') return false
    const editedAt = Date.now()
    const patch = { text: trimmed, mentions, edited: true, editedAt }
    replaceMessage(target.id, patch)
    try {
      if (typeof signaling?.editChatMessage !== 'function') {
        throw new Error('Edicao remota indisponivel')
      }
      await signaling.editChatMessage(target.firestoreId || target.id, trimmed, mentions, roomId)
      if (channel?.readyState === 'open') {
        channel.send(JSON.stringify({
          kind: 'edit', msgId: target.id, authorId: userId, text: trimmed, mentions, editedAt,
        }))
      }
      return true
    } catch (err) {
      console.warn('[chat] edit failed:', err)
      replaceMessage(target.id, { text: target.text, mentions: target.mentions || [], edited: target.edited, editedAt: target.editedAt })
      flashToast(err?.message || 'Nao foi possivel editar a mensagem.')
      return false
    }
  }, [messages, userId, signaling, roomId, channel, replaceMessage])

  // ----- Pins (persisted on Firestore message docs via signaling) --------
  const togglePin = useCallback(async (msgId) => {
    if (!msgId) return
    let target = null
    let nextPinned = false
    setMessages((prev) => {
      target = prev.find((m) => m.id === msgId || m.firestoreId === msgId)
      if (!target || target.deleted) return prev
      nextPinned = !target.pinned
      const next = prev.map((m) => (
        (m.id === target.id || (target.firestoreId && m.firestoreId === target.firestoreId))
          ? {
              ...m,
              pinned: nextPinned,
              pinnedAt: nextPinned ? Date.now() : null,
              pinnedBy: nextPinned ? (userId || null) : null,
            }
          : m
      ))
      saveHistory(roomKey, next)
      return next
    })
    if (!target) return
    try {
      if (signaling?.pinChatMessage) {
        await signaling.pinChatMessage(target.firestoreId || target.id, nextPinned)
      }
    } catch (err) {
      console.warn('[pin] persist', err)
      setMessages((prev) => {
        const next = prev.map((m) => (
          (m.id === target.id || (target.firestoreId && m.firestoreId === target.firestoreId))
            ? {
                ...m,
                pinned: !nextPinned,
                pinnedAt: !nextPinned ? Date.now() : null,
                pinnedBy: !nextPinned ? (userId || null) : null,
              }
            : m
        ))
        saveHistory(roomKey, next)
        return next
      })
      throw err
    }
  }, [roomKey, signaling, userId])

  // ----- Delete -----------------------------------------------------------
  // Own messages always; moderators may delete anyone's when canModerate.
  // Persist to Firestore so the soft-delete survives room/space switches.
  const deleteMessage = useCallback(async (msgId, { moderate = false } = {}) => {
    const target = messages.find((message) => message.id === msgId || message.firestoreId === msgId)
    if (!target) return false
    const isOwn = target.direction === 'out' || (!!userId && target.authorId === userId)
    if (!isOwn && !moderate) return false

    const identity = resolveMessageIdentity(target, msgId)
    const actionIds = identity.aliases
    const { outboxId, persistenceId: persistId } = identity
    const rawKey = String(roomKey || '')
    const sep = rawKey.indexOf(':')
    const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : (rawKey || null)
    const pending = target.status === 'sending'
      || target.status === 'failed'
      || target.status === 'permanent-failed'

    if (pending) {
      setMessages((prev) => {
        const next = prev.filter((message) => !actionIds.includes(message.id) && !actionIds.includes(message.firestoreId))
        saveHistory(roomKey, next)
        return next
      })
      try {
        await dispatcherCancel(outboxId)
        if (typeof signaling?.deleteChatMessage === 'function') {
          await signaling.deleteChatMessage(persistId, chatRoomId)
        }
        if (channel?.readyState === 'open') {
          channel.send(JSON.stringify({
            kind: 'delete', msgId: persistId,
            userId: userId || signaling?.userId || null, ts: Date.now(),
          }))
        }
        return true
      } catch (err) {
        console.warn('[chat] pending delete failed:', err)
        flashToast(err?.message || 'A mensagem foi cancelada, mas a exclusao remota nao foi confirmada.')
        return false
      }
    }

    setMessages((prev) => {
      const next = prev.map((message) => (
        actionIds.includes(message.id) || actionIds.includes(message.firestoreId)
          ? { ...message, deleted: true, text: '', attachment: undefined, attachments: undefined }
          : message
      ))
      saveHistory(roomKey, next)
      return next
    })

    try {
      if (typeof signaling?.deleteChatMessage !== 'function') {
        throw new Error('Exclusao remota indisponivel')
      }
      await signaling.deleteChatMessage(persistId, chatRoomId)
      if (channel?.readyState === 'open') {
        channel.send(JSON.stringify({
          kind: 'delete', msgId: persistId,
          userId: userId || signaling?.userId || null, ts: Date.now(),
        }))
      }
      return true
    } catch (err) {
      console.warn('[chat] delete persist failed:', err)
      setMessages((prev) => {
        const next = prev.map((message) => (
          actionIds.includes(message.id) || actionIds.includes(message.firestoreId) ? target : message
        ))
        saveHistory(roomKey, next)
        return next
      })
      flashToast(err?.message || 'Nao foi possivel excluir a mensagem.')
      return false
    }
  }, [messages, roomKey, signaling, channel, userId])

  // Hard-purge messages (incl. soft-deleted stubs). Optimistic local + Firestore.
  const purgeMessages = useCallback(async ({ authorId = null, beforeTs = null } = {}) => {
    const rawKey = String(roomKey || '')
    const sep = rawKey.indexOf(':')
    const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : (rawKey || null)

    setMessages((prev) => {
      const next = prev.filter((m) => {
        if (m.kind === 'sys') return true
        if (authorId) {
          const mid = m.authorId || (m.direction === 'out' ? userId : null)
          if (mid !== authorId) return true
        }
        if (beforeTs != null && Number(m.ts || 0) >= Number(beforeTs)) return true
        return false
      })
      saveHistory(roomKey, next)
      return next
    })

    let purged = 0
    try {
      purged = await signaling?.purgeChatMessages?.(chatRoomId, { authorId, beforeTs }) ?? 0
    } catch (err) {
      console.warn('[chat] purge failed:', err)
      throw err
    }

    try {
      if (channel && channel.readyState === 'open') {
        channel.send(JSON.stringify({
          kind: 'purge',
          roomId: chatRoomId,
          authorId: authorId || null,
          userId: userId || signaling?.userId || null,
          ts: Date.now(),
        }))
      }
    } catch {}

    return purged
  }, [roomKey, signaling, channel, userId])

  // Helper exported via closure for callers that need to read images.
  // We keep it private to the module — Composer does its own read.
  readFileAsDataUrl // eslint hint
  return {
    messages,
    files,
    ready,
    historyReady,
    connectionState,
    sendMessage,
    sendFile,
    clear,
    postSystem,
    retry,
    cancelOutbox,
    copyMessageText,
    toggleReaction,
    toggleLike,
    togglePin,
    editMessage,
    deleteMessage,
    purgeMessages,
  }
}

export { MAX_IMAGE_BYTES, MAX_FILE_BYTES, MAX_ATTACHMENTS, readFileAsDataUrl }
