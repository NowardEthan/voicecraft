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

const CHUNK_SIZE = 16 * 1024  // 16 KiB
const CHAT_STORAGE_PREFIX = 'voicecraft:chat:'
const MAX_PERSISTED = 500
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_INLINE_DATA_URL = 200_000

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
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
  return next
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
  const att = persistableAttachment(msg.attachment)
  if (att) out.attachment = att
  if (msg.replyToId) out.replyToId = msg.replyToId
  return out
}

export function useChat({ channel, signaling, username, roomKey, userId, authorProfile }) {
  const transfersRef = useRef(new Map())
  // Load cached history synchronously so opening a Sala with prior history
  // never flashes a loading state.
  const [messages, setMessages] = useState(() => loadHistory(roomKey) || [])
  const [files, setFiles] = useState([])
  const [ready, setReady] = useState(false)
  const [connectionState, setConnectionState] = useState(
    channel ? (channel.readyState || 'connecting') : 'connecting'
  )

  // Re-seed history when roomKey changes (different Sala).
  useEffect(() => {
    setMessages(loadHistory(roomKey) || [])
    setFiles([])
    setReady(false)
    setConnectionState(channel ? (channel.readyState || 'connecting') : 'connecting')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey])

  useEffect(() => {
    if (!roomKey || !signaling?.listenChat) return undefined
    const [spaceId, roomId] = String(roomKey).split(':')
    if (!spaceId || spaceId === 'nospace' || !roomId) return undefined
    return signaling.listenChat(spaceId, roomId, (list) => {
      if (!Array.isArray(list)) return
      const remote = list.map((m) => ({
        ...m,
        kind: m.kind || 'msg',
        direction: m.authorId && userId && m.authorId === userId ? 'out' : (m.direction || 'in'),
        status: m.authorId && userId && m.authorId === userId ? 'sent' : m.status,
      }))
      setMessages((prev) => {
        const ids = new Set(remote.map((m) => m.id).filter(Boolean))
        const pending = prev.filter((m) => m.direction === 'out' && m.status === 'sending' && m.id && !ids.has(m.id))
        const next = [...remote, ...pending].sort((a, b) => (a.ts || 0) - (b.ts || 0))
        saveHistory(roomKey, next)
        return next
      })
    })
  }, [roomKey, signaling, userId])

  // ----- Helpers that update state ------------------------------------------
  const appendMessage = useCallback((msg) => {
    setMessages(prev => {
      // Id-based dedup. Server may re-deliver messages on reconnect.
      if (msg.id && prev.some(m => m.id === msg.id)) return prev
      const next = [...prev, msg]
      saveHistory(roomKey, next)
      return next
    })
  }, [roomKey])

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
          // Build attachment from incoming wire shape.
          let attachment = null
          if (msg.attachment && (msg.attachment.dataUrl || msg.attachment.url)) {
            attachment = {
              kind: msg.attachment.kind,
              dataUrl: msg.attachment.dataUrl || null,
              url: msg.attachment.url || null,
              type: msg.attachment.type || 'application/octet-stream',
              name: msg.attachment.name || 'arquivo',
              size: msg.attachment.size || 0,
            }
          }
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
            attachment,
            replyToId: msg.replyToId || null,
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
  const sendMessage = useCallback(async ({ text, attachment, replyToId } = {}) => {
    const trimmed = String(text || '').trim()
    if (!trimmed && !attachment) return false

    const rawKey = String(roomKey || '')
    const sep = rawKey.indexOf(':')
    const chatRoomId = sep >= 0 ? rawKey.slice(sep + 1) : (rawKey || null)

    const id = uid()
    const ts = Date.now()
    const kind = (attachment?.type || '').startsWith('image/') ? 'image' : 'file'
    let storedAtt = attachment
      ? {
          kind,
          name: attachment.name || (kind === 'image' ? 'imagem' : 'arquivo'),
          type: attachment.type || 'application/octet-stream',
          size: attachment.size || 0,
          dataUrl: attachment.dataUrl || null,
        }
      : null

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
    if (replyToId) msg.replyToId = replyToId

    appendMessage({
      ...msg,
      attachment: storedAtt || undefined,
      direction: 'out',
      status: 'sending',
    })

    try {
      if (attachment?.file && signaling?.uploadChatFile) {
        try {
          const url = await signaling.uploadChatFile(attachment.file, chatRoomId)
          if (url) {
            storedAtt = { ...storedAtt, url, dataUrl: storedAtt?.dataUrl || null }
            replaceMessage(id, { attachment: storedAtt })
          }
        } catch (err) {
          console.warn('[chat] upload failed:', err)
        }
      }

      const persistAtt = persistableAttachment(storedAtt)
      const wire = persistableMessage({ ...msg, attachment: persistAtt })
      const dc = channel
      if (dc?.readyState === 'open') {
        try { dc.send(JSON.stringify(wire)) } catch (err) {
          console.warn('[chat] p2p send failed:', err)
        }
      }
      await signaling?.sendChatMessage?.(wire, chatRoomId)
      replaceMessage(id, {
        status: 'sent',
        attachment: storedAtt ? { ...storedAtt, dataUrl: persistAtt?.dataUrl || storedAtt.dataUrl || null, url: persistAtt?.url || storedAtt.url } : undefined,
      })
      return true
    } catch (err) {
      console.warn('[chat] send failed:', err)
      replaceMessage(id, { status: 'failed' })
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

  const retry = useCallback((msgId) => {
    setMessages(prev => {
      const target = prev.find(m => m.id === msgId)
      if (!target) return prev
      const dc = channel
      if (!dc || dc.readyState !== 'open') {
        return prev.map(m => m.id === msgId ? { ...m, status: 'failed' } : m)
      }
      // Re-send. Strip local-only fields.
      const wire = {
        kind: 'msg',
        id: target.id,
        ts: target.ts,
        author: target.author,
        text: target.text,
      }
      if (target.attachment) {
        wire.attachment = {
          dataUrl: target.attachment.dataUrl,
          type: target.attachment.type,
          name: target.attachment.name,
          size: target.attachment.size,
        }
      }
      try {
        dc.send(JSON.stringify(wire))
        const next = prev.map(m => m.id === msgId ? { ...m, status: 'sent' } : m)
        saveHistory(roomKey, next)
        return next
      } catch {
        return prev.map(m => m.id === msgId ? { ...m, status: 'failed' } : m)
      }
    })
  }, [channel, roomKey])

  const clear = useCallback(() => {
    setMessages([])
    const key = storageKey(roomKey)
    if (key) try { localStorage.removeItem(key) } catch {}
  }, [roomKey])

  // ----- Reactions ---------------------------------------------------------
  // Reactions are a per-user per-message map. Each emoji accumulates a count
  // and tracks whether the *current* user has voted. Persistence lives in
  // localStorage; reactions are *local-only* — peers don't see them on this
  // protocol version. (Future: piggyback on the data channel.)
  const toggleReaction = useCallback((msgId, emoji) => {
    if (!msgId || !emoji) return
    setMessages(prev => {
      const next = prev.map(m => {
        if (m.id !== msgId) return m
        const reactions = { ...(m.reactions || {}) }
        const cur = reactions[emoji] || { count: 0, mine: false }
        if (cur.mine) {
          const nextCount = cur.count - 1
          if (nextCount <= 0) {
            delete reactions[emoji]
          } else {
            reactions[emoji] = { count: nextCount, mine: false }
          }
        } else {
          reactions[emoji] = { count: cur.count + 1, mine: true }
        }
        return { ...m, reactions }
      })
      saveHistory(roomKey, next)
      return next
    })
  }, [roomKey])

  // ----- Edit (own message only) -------------------------------------------
  const editMessage = useCallback((msgId, newText) => {
    setMessages(prev => {
      const next = prev.map(m => {
        if (m.id !== msgId) return m
        if (m.direction !== 'out') return m // only own
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

  // ----- Delete -----------------------------------------------------------
  // Own messages always; moderators may delete anyone's when canModerate.
  const deleteMessage = useCallback((msgId, { moderate = false } = {}) => {
    setMessages(prev => {
      const next = prev.map(m => {
        if (m.id !== msgId) return m
        if (m.direction !== 'out' && !moderate) return m
        return { ...m, deleted: true, text: '' }
      })
      saveHistory(roomKey, next)
      return next
    })
  }, [roomKey])

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
    toggleReaction,
    editMessage,
    deleteMessage,
  }
}

export { MAX_IMAGE_BYTES, MAX_FILE_BYTES, readFileAsDataUrl }
