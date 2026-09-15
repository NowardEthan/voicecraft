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
import { useEffect, useRef, useState, useCallback } from 'react'
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
  enqueueMessage as outboxEnqueue, markSent as outboxMarkSent,
  markPermanentFailed as outboxMarkPermanentFailed,
  resetForRetry as outboxResetForRetry,
  getAll as outboxGetAll, deleteItem as outboxDelete,
} from '../shared/chat/chatOutbox'
import {
  setSender as dispatcherSetSender, setActiveUid as dispatcherSetActiveUid,
  start as dispatcherStart, flush as dispatcherFlush, retryNow as dispatcherRetryNow,
} from '../shared/chat/outboxDispatcher'

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
  return out
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

  /* Fonte da verdade dos likes: Map<msgId, likes[]>. Persiste entre
   * renders do React e sobrevive ao re-seed de history quando trocamos
   * de sala. Atualizado pelo listener RTDB e consumido por todas as
   * mutações em `messages` (helper `applyLikes`).                     */
  const likesFromServerRef = useRef(new Map())

  /* Fonte da verdade das reactions: Map<msgId, {emoji: userId[]}>.
   * Mesma estratégia dos likes — autoritativo, atualizado pelo
   * listener RTDB e re-aplicado em qualquer mutação de messages. */
  const reactionsFromServerRef = useRef(new Map())

  /* Outbox integration — Fase 3:
   *   - Register sender with the dispatcher on mount/uid change.
   *   - Reconcile any pending outbox items for this roomKey into the
   *     message stream (so reloads show sending/failed bubbles).
   *   - Trigger flush on mount.                                          */
  useEffect(() => {
    if (!userId) return
    dispatcherSetActiveUid(userId)
    dispatcherSetSender(async (item) => {
      // Reconstruct the wire message from the outbox payload.
      const rawKey = item.roomKey
      const sep = rawKey.indexOf(':')
      const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : rawKey
      const persisted = (item.payload?.attachments || []).filter((a) => !a.blob)
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
        attachment: persisted[0] || undefined,
        attachments: persisted.length > 1 ? persisted : undefined,
      })
      const dc = channelRef?.current
      if (dc?.readyState === 'open') {
        try { dc.send(JSON.stringify(wire)) } catch (err) {
          console.warn('[outbox] p2p send failed:', err)
        }
      }
      await signaling?.sendChatMessage?.(wire, chatRoomId)
      // Reflect success in local state if still pending.
      setMessages((prev) => {
        if (!prev.find((m) => m.id === item.id)) return prev
        const next = prev.map((m) => (m.id === item.id ? { ...m, status: 'sent' } : m))
        saveHistory(roomKey, next)
        return next
      })
    })
    dispatcherStart()
    void dispatcherFlush(userId)
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
            if (byId.has(item.id)) continue
            byId.set(item.id, {
              id: item.id,
              kind: 'msg',
              ts: item.createdAt,
              text: item.payload?.text || '',
              attachment: (item.payload?.attachments || [])[0] || undefined,
              attachments: (item.payload?.attachments || []).length > 1 ? item.payload.attachments : undefined,
              replyToId: item.payload?.replyToId || null,
              author: item.payload?.author?.name || 'você',
              authorId: item.payload?.author?.id || userId,
              authorHandle: item.payload?.author?.handle || '',
              authorPhoto: item.payload?.author?.photo || '',
              direction: 'out',
              status: item.status === 'permanent-failed'
                ? 'permanent-failed'
                : (item.status === 'in-flight' ? 'sending' : 'sending'),
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
      if (!m || !m.id) return m
      const fromServer = reactionsFromServerRef.current.get(m.id)
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
  useEffect(() => {
    const seeded = loadHistory(roomKey) || []
    setMessages(applyLikes(seeded))
    setFiles([])
    setReady(false)
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
    if (!roomKey || !signaling?.listenChat) return undefined
    const [spaceId, roomId] = String(roomKey).split(':')
    if (!spaceId || spaceId === 'nospace' || !roomId) return undefined
    return signaling.listenChat(spaceId, roomId, (list) => {
      if (!Array.isArray(list)) return
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
        direction: m.authorId && userId && m.authorId === userId ? 'out' : (m.direction || 'in'),
        status: m.authorId && userId && m.authorId === userId ? 'sent' : m.status,
      }))
      setMessages((prev) => {
        const ids = new Set(remote.map((m) => m.id).filter(Boolean))
        const pending = prev.filter((m) => m.direction === 'out' && m.status === 'sending' && m.id && !ids.has(m.id))
        let next = applyLikes([...remote, ...pending].sort((a, b) => (a.ts || 0) - (b.ts || 0)))
        next = applyReactions(next)
        saveHistory(roomKey, next)
        return next
      })
    })
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
  const sendMessage = useCallback(async ({ text, attachment, attachments, replyToId } = {}) => {
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
            previewUrl: a.previewUrl || null,
            kind: a.kind,
          })),
          replyToId: replyToId ? String(replyToId) : null,
          author: {
            id: userId,
            name: msg.author,
            handle: msg.authorHandle,
            photo: msg.authorPhoto,
          },
        })
      }
    } catch (err) {
      console.warn('[outbox] enqueue failed (continuing):', err)
    }

    try {
      const needsUpload = storedList.some((a) => a.file)
      if (needsUpload && !signaling?.uploadChatFile) {
        throw new Error('Upload de anexo indisponível')
      }

      for (let i = 0; i < storedList.length; i++) {
        const att = storedList[i]
        if (!att?.file) continue
        const url = await signaling.uploadChatFile(att.file, chatRoomId)
        if (!url) throw new Error('Upload sem URL')
        if (att.previewUrl) {
          try { URL.revokeObjectURL(att.previewUrl) } catch {}
        }
        storedList[i] = {
          kind: att.kind,
          name: att.name,
          type: att.type,
          size: att.size,
          url,
          dataUrl: null,
          previewUrl: null,
          ...(att.sticker ? { sticker: true } : null),
        }
        replaceMessage(id, {
          attachment: storedList[0],
          attachments: storedList.length > 1 ? storedList : undefined,
        })
      }

      // Strip File handles before persist
      storedList = storedList.map(({ file, ...rest }) => rest)

      const persistList = storedList.map(persistableAttachment).filter(Boolean)
      if (inputList.length && persistList.length === 0) {
        throw new Error('Anexo incompleto — envie de novo')
      }
      if (persistList.some((a) => !a.url && !a.dataUrl)) {
        throw new Error('Anexo incompleto — envie de novo')
      }

      const wire = persistableMessage({
        ...msg,
        attachment: persistList[0],
        attachments: persistList.length > 1 ? persistList : undefined,
      })
      // Note: we DO NOT call signaling.sendChatMessage here.
      // The outbox dispatcher (sender registered via setSender) is the
      // single authority for transport — this prevents duplicate sends
      // when the dispatcher also flushes the message in parallel.
      const dc = channel
      if (dc?.readyState === 'open') {
        try { dc.send(JSON.stringify(wire)) } catch (err) {
          console.warn('[chat] p2p send failed:', err)
        }
      }
      // Force an immediate dispatch via the outbox dispatcher so the
      // user gets fast feedback; backoff retries still apply on failure.
      try {
        if (userId) {
          const { dispatcherFlush } = await import('../shared/chat/outboxDispatcher')
          await dispatcherFlush(userId)
        }
      } catch (err) {
        console.warn('[outbox] immediate flush:', err)
      }
      // NOTE: do NOT mark as 'sent' here or call outboxMarkSent here.
      // The dispatcher's sender (registered via setSender) is the
      // single source of truth for transport. It will:
      //  - on success: setMessages to 'sent' + outboxMarkSent.
      //  - on failure: outboxMarkFailedAttempt (with backoff) or
      //    outboxMarkPermanentFailed after MAX_ATTEMPTS (5).
      return true
    } catch (err) {
      console.warn('[chat] send failed:', err)
      const retryable = inputList.length === 0 || persistableAttachment(storedList[0])?.url
        || persistableAttachment(storedList[0])?.dataUrl
      if (!retryable) {
        // Anexo com File não persistido em URL — outbox marca falha permanente.
        try { await outboxMarkPermanentFailed(id, err) } catch {}
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== id)
          saveHistory(roomKey, next)
          return next
        })
      } else {
        replaceMessage(id, { status: 'failed' })
      }
      return false
    }
  }, [username, userId, authorProfile, appendMessage, replaceMessage, channel, signaling, roomKey])

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
    let target = null
    setMessages((prev) => {
      const found = prev.find((m) => m.id === msgId)
      if (!found) return prev
      if (found.status !== 'failed' && found.status !== 'permanent-failed') return prev
      target = found
      return prev.map((m) => (m.id === msgId ? { ...m, status: 'sending' } : m))
    })
    if (!target) return
    try {
      await outboxResetForRetry(msgId)
      await dispatcherRetryNow(msgId)
      replaceMessage(msgId, { status: 'sending' })
    } catch (err) {
      console.warn('[chat] retry failed:', err)
      replaceMessage(msgId, { status: 'permanent-failed' })
    }
  }, [roomKey, replaceMessage, channel, signaling])

  const cancelOutbox = useCallback(async (msgId) => {
    try { await outboxDelete(msgId) } catch (err) { console.warn('[outbox] cancel:', err) }
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== msgId)
      saveHistory(roomKey, next)
      return next
    })
  }, [roomKey])

  const copyMessageText = useCallback(async (msgId) => {
    let text = ''
    setMessages((prev) => {
      const found = prev.find((m) => m.id === msgId)
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
    const myId = userId

    /* Optimistic update — mesmo formato do applyReactions pra
     * não divergir do snapshot RTDB.                                */
    let willReact = false
    setMessages(prev => {
      const next = prev.map(m => {
        if (m.id !== msgId) return m
        const reactions = { ...(m.reactions || {}) }
        const cur = reactions[emoji]
        const users = Array.isArray(cur?.users) ? [...cur.users] : []
        const idx = users.indexOf(myId)
        willReact = idx === -1
        if (willReact) users.push(myId)
        else users.splice(idx, 1)
        if (users.length === 0) {
          delete reactions[emoji]
        } else {
          reactions[emoji] = {
            count: users.length,
            users,
            mine: willReact,
          }
        }
        return { ...m, reactions }
      })
      saveHistory(roomKey, next)
      return next
    })

    /* Atualiza o Map autoritativo pra evitar race com snapshot
     * RTDB que chegar logo depois — idem likes.                    */
    if (msgId) {
      const ref = reactionsFromServerRef.current
      const byEmoji = ref.get(msgId) || {}
      const users = Array.isArray(byEmoji[emoji]) ? [...byEmoji[emoji]] : []
      const idx = users.indexOf(myId)
      const will = idx === -1
      if (will) users.push(myId)
      else users.splice(idx, 1)
      byEmoji[emoji] = users
      ref.set(msgId, byEmoji)
    }

    /* Persiste no RTDB. */
    if (spaceId && roomId) {
      const op = willReact
        ? reactToMessage(spaceId, roomId, msgId, emoji, myId)
        : unreactToMessage(spaceId, roomId, msgId, emoji, myId)
      op.catch((err) => console.warn('[reactions] persist', err))
    }

    /* Bump na frequência local — reordena quick bar. */
    try {
      if (willReact) bumpFrequent(emoji)
      else unbumpFrequent(emoji)
    } catch { /* localStorage indisponível */ }
  }, [roomKey, userId, spaceId, roomId])

  // ----- Likes (Sparkles — synced P2P + persisted in RTDB) ---------------
  // Like = binário por user. Armazenado como `msg.likes: string[]` de
  // userIds. Persistido no Firebase RTDB (fonte da verdade) e
  // propagado via data channel (fast-path P2P). Quando o user troca
  // de sala ou desloga, o RTDB restaura o estado das curtidas.
  const toggleLike = useCallback((msgId) => {
    if (!msgId || !userId) return
    const myId = userId

    let willLike = false
    let keyIds = [msgId]
    let nextLikesForMsg = null

    setMessages((prev) => {
      const target = prev.find((m) => m.id === msgId || m.firestoreId === msgId)
      if (!target) return prev

      keyIds = [...new Set([target.id, target.firestoreId].filter(Boolean))]
      const likes = Array.isArray(target.likes) ? [...target.likes] : []
      const idx = likes.indexOf(myId)
      willLike = idx === -1
      if (willLike) likes.push(myId)
      else likes.splice(idx, 1)
      nextLikesForMsg = likes

      const next = prev.map((m) => (
        (m.id === target.id || (target.firestoreId && m.firestoreId === target.firestoreId))
          ? { ...m, likes }
          : m
      ))
      saveHistory(roomKey, next)
      return next
    })

    if (!nextLikesForMsg) return

    /* Atualiza o Map autoritativo sob todos os ids conhecidos da msg. */
    syncLikesMapKeys(keyIds, nextLikesForMsg)

    if (spaceId && roomId) {
      const op = willLike
        ? likeMessageKeys(spaceId, roomId, keyIds, myId)
        : unlikeMessageKeys(spaceId, roomId, keyIds, myId)
      op.catch((err) => {
        console.warn('[likes] persist', err)
        /* Revert optimistic on hard failure so UI matches RTDB. */
        setMessages((prev) => {
          const next = prev.map((m) => {
            if (!keyIds.includes(m.id) && !keyIds.includes(m.firestoreId)) return m
            const likes = Array.isArray(m.likes) ? m.likes.filter((u) => u !== myId) : []
            if (willLike) {
              /* failed like → remove me */
              return { ...m, likes }
            }
            /* failed unlike → put me back */
            return likes.includes(myId) ? m : { ...m, likes: [...likes, myId] }
          })
          syncLikesMapKeys(keyIds, willLike
            ? (next.find((m) => keyIds.includes(m.id))?.likes || [])
            : (next.find((m) => keyIds.includes(m.id))?.likes || []))
          saveHistory(roomKey, next)
          return next
        })
      })
    }

    try {
      if (channel && channel.readyState === 'open') {
        channel.send(JSON.stringify({
          kind: willLike ? 'like' : 'unlike',
          msgId,
          userId: myId,
          ts: Date.now(),
        }))
      }
    } catch {}
  }, [channel, userId, roomKey, spaceId, roomId, syncLikesMapKeys])

  // ----- Edit (own message only) -------------------------------------------
  const editMessage = useCallback((msgId, newText) => {
    setMessages(prev => {
      const next = prev.map(m => {
        if (m.id !== msgId) return m
        if (m.direction !== 'out') return m // only own
        if (m.status === 'sending') return m // block edit during in-flight send
        return {
          ...m,
          text: newText,
          edited: true,
          editedAt: Date.now(),
        }
      })
      saveHistory(roomKey, next)
      return next
    })
  }, [roomKey])

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
  const deleteMessage = useCallback((msgId, { moderate = false } = {}) => {
    let allowed = false
    let persistId = msgId
    setMessages((prev) => {
      const target = prev.find((m) => m.id === msgId || m.firestoreId === msgId)
      if (!target) return prev
      const isOwn = target.direction === 'out'
        || (!!userId && target.authorId === userId)
      if (!isOwn && !moderate) return prev
      allowed = true
      persistId = target.firestoreId || target.id || msgId
      const next = prev.map((m) => (
        (m.id === target.id || (target.firestoreId && m.firestoreId === target.firestoreId))
          ? {
              ...m,
              deleted: true,
              text: '',
              attachment: undefined,
              attachments: undefined,
            }
          : m
      ))
      saveHistory(roomKey, next)
      return next
    })
    if (!allowed) return

    const rawKey = String(roomKey || '')
    const sep = rawKey.indexOf(':')
    const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : (rawKey || null)
    signaling?.deleteChatMessage?.(persistId, chatRoomId)?.catch((err) => {
      console.warn('[chat] delete persist failed:', err)
    })

    try {
      if (channel && channel.readyState === 'open') {
        channel.send(JSON.stringify({
          kind: 'delete',
          msgId: persistId,
          userId: userId || signaling?.userId || null,
          ts: Date.now(),
        }))
      }
    } catch {}
  }, [roomKey, signaling, channel, userId])

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
