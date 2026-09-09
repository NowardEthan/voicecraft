/**
 * VoiceCraft realtime client — Firebase Auth + Firestore + Storage.
 *
 * Keeps the same event API the rest of the app already uses
 * (onSpaceChanged, enterRoom, sendSignal, …) so hooks do not change.
 * Durable data lives under vc_spaces / vc_users; WebRTC offers ride
 * as short-lived docs in the room's signals subcollection.
 */
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { onAuthStateChanged, updateProfile } from 'firebase/auth'
import { auth, db, VC } from '../firebase/app'
import { deleteSpaceCover, uploadSpaceCover } from '../firebase/covers'
import { uploadChatFile } from '../firebase/chatFiles'
import {
  attachUserPresence,
  attachSpacePresence,
  listenSpacePresence,
} from '../firebase/presence'

const ONLINE_MS = 45_000

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function isFresh(lastSeen) {
  const n = Number(lastSeen)
  return Number.isFinite(n) && Date.now() - n < ONLINE_MS
}

function friendlyName() {
  const animals = ['Fox', 'Owl', 'Cat', 'Bee', 'Cub', 'Lynx', 'Jay', 'Ram']
  const a = animals[Math.floor(Math.random() * animals.length)]
  const n = Math.random().toString(36).slice(2, 5)
  return `${a}-${n}`
}

function spaceRef(id) {
  return doc(db, VC.spaces, id)
}

function membersCol(spaceId) {
  return collection(db, VC.spaces, spaceId, 'members')
}

function roomsCol(spaceId) {
  return collection(db, VC.spaces, spaceId, 'rooms')
}

function roomRef(spaceId, roomId) {
  return doc(db, VC.spaces, spaceId, 'rooms', roomId)
}

function memberRef(spaceId, userId) {
  return doc(db, VC.spaces, spaceId, 'members', userId)
}

function peersCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'peers')
}

function signalsCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'signals')
}

function thoughtsCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'thoughts')
}

function messagesCol(spaceId, roomId) {
  return collection(db, VC.spaces, spaceId, 'rooms', roomId, 'messages')
}

function toMemberView(id, data = {}) {
  return {
    userId: id,
    displayName: data.displayName || 'convidado',
    photoURL: data.photoURL || '',
    handle: data.handle || '',
    bio: data.bio || '',
    statusText: data.statusText || '',
    cover: data.cover || '',
    coverFit: data.coverFit || null,
    bannerHue: data.bannerHue ?? null,
    cardThemeId: data.cardThemeId || 'default',
    online: data.online === true && isFresh(data.lastSeen),
    lastSeen: data.lastSeen || null,
    location: data.location || null,
    status: data.status || data.statusText || null,
  }
}

function mergeUserOntoMember(view, user = {}) {
  if (!user) return view
  // Incoming `view` (member doc) wins when it has a value. `user` (vc_users)
  // only fills gaps — otherwise live cosmetic updates never stick.
  const pick = (a, b, fallback = '') => (a != null && a !== '' ? a : (b != null && b !== '' ? b : fallback))
  return {
    ...view,
    displayName: pick(view.displayName, user.displayName, view.displayName),
    photoURL: pick(view.photoURL, user.photoURL, ''),
    handle: pick(view.handle, user.handle, ''),
    bio: pick(view.bio, user.bio, ''),
    statusText: pick(view.statusText, user.statusText, ''),
    cover: pick(view.cover, user.cover, ''),
    coverFit: view.coverFit || user.coverFit || null,
    bannerHue: view.bannerHue ?? user.bannerHue ?? null,
    cardThemeId: view.cardThemeId || user.cardThemeId || 'default',
    createdAt: view.createdAt || user.createdAt || null,
    status: view.status || user.statusText || user.status || null,
  }
}

function toRoomView(id, data = {}) {
  return {
    id,
    name: data.name || 'sala',
    type: data.type === 'voice' ? 'voice' : 'text',
    purpose: data.purpose || (data.type === 'voice' ? 'voice' : 'conversation'),
    createdBy: data.createdBy || null,
    createdAt: data.createdAt || Date.now(),
  }
}

function normalizeVisibility(value) {
  return value === 'private' ? 'private' : 'public'
}

function toSpaceSummary(id, data = {}, joined = true) {
  return {
    id,
    name: data.name || 'sem nome',
    description: data.description || '',
    icon: data.icon || 'ph:users-three:outline',
    color: data.color || '#E74C3C',
    cover: data.cover || null,
    coverFit: data.coverFit || null,
    themeId: data.themeId || null,
    visibility: normalizeVisibility(data.visibility),
    memberCount: Array.isArray(data.memberIds) ? data.memberIds.length : 0,
    roomCount: Number(data.roomCount) || 0,
    joined,
    createdBy: data.createdBy || null,
  }
}

function toSpaceFull(id, data, rooms, members) {
  return {
    ...toSpaceSummary(id, data, true),
    events: Array.isArray(data.events) ? data.events : [],
    createdAt: data.createdAt || Date.now(),
    members,
    rooms,
  }
}

export class SignalingClient {
  constructor() {
    this.ws = null
    this.userId = null
    this.displayName = null
    this._profile = {}
    this.spaceId = null
    this.roomId = null
    this.connected = false
    this._closed = false
    this._connectPromise = null
    this._unsubs = []
    this._spaceUnsubs = []
    this._roomUnsubs = []
    this._heartbeat = null
    this._spaceCache = null

    this.peerJoinedCallback = null
    this.peerLeftCallback = null
    this.signalCallback = null
    this.errorCallback = null
    this.screenShareStateCallback = null
    this.spaceChangedCallback = null
    this.memberJoinedCallback = null
    this.memberLeftCallback = null
    this.roomChangedCallback = null
    this.statusCallback = null

    this._listeners = {
      spaceChanged: new Set(),
      memberJoined: new Set(),
      memberLeft: new Set(),
      roomChanged: new Set(),
      status: new Set(),
      peerJoined: new Set(),
      peerLeft: new Set(),
      screenShareState: new Set(),
      cameraState: new Set(),
      roomThought: new Set(),
      memberStatus: new Set(),
      chat: new Set(),
      presenceChanged: new Set(),
    }
  }

  onSpaceChanged(fn)      { return this._subscribe('spaceChanged', fn) }
  onMemberJoined(fn)      { return this._subscribe('memberJoined', fn) }
  onMemberLeft(fn)        { return this._subscribe('memberLeft', fn) }
  onRoomChanged(fn)       { return this._subscribe('roomChanged', fn) }
  onStatus(fn)            { return this._subscribe('status', fn) }
  onPeerJoined(fn)        { return this._subscribe('peerJoined', fn) }
  onPeerLeft(fn)          { return this._subscribe('peerLeft', fn) }
  onScreenShareState(fn)  { return this._subscribe('screenShareState', fn) }
  onCameraState(fn)       { return this._subscribe('cameraState', fn) }
  onRoomThought(fn)       { return this._subscribe('roomThought', fn) }
  onMemberStatus(fn)      { return this._subscribe('memberStatus', fn) }
  onChat(fn)              { return this._subscribe('chat', fn) }
  onPresenceChanged(fn)   { return this._subscribe('presenceChanged', fn) }

  _subscribe(name, fn) {
    if (typeof fn !== 'function') return () => {}
    this._listeners[name].add(fn)
    return () => this._listeners[name].delete(fn)
  }

  _emit(name, payload) {
    const legacy = this[name + 'Callback']
    if (typeof legacy === 'function') {
      try { legacy(payload) } catch (e) { console.error(`[${name}Callback]`, e) }
    }
    for (const fn of this._listeners[name]) {
      try { fn(payload) } catch (e) { console.error(`[${name}]`, e) }
    }
  }

  _loadDisplayName() {
    try {
      const cached = localStorage.getItem('voicecraft:displayName')
      if (cached) return cached
      const name = friendlyName()
      localStorage.setItem('voicecraft:displayName', name)
      return name
    } catch {
      return friendlyName()
    }
  }

  _clear(list) {
    for (const off of list) {
      try { off() } catch { /* already dropped */ }
    }
    list.length = 0
  }

  connect() {
    if (this._connectPromise) return this._connectPromise
    this._closed = false
    this._connectPromise = this._connectFirebase()
    return this._connectPromise
  }

  async _connectFirebase() {
    this._emit('status', { type: 'reconnecting' })
    try {
      await new Promise((resolve, reject) => {
        if (auth.currentUser && !auth.currentUser.isAnonymous) return resolve()
        let settled = false
        const done = (fn, value) => {
          if (settled) return
          settled = true
          off()
          clearTimeout(timer)
          fn(value)
        }
        const off = onAuthStateChanged(auth, (user) => {
          if (user && !user.isAnonymous) done(resolve)
        })
        const timer = setTimeout(() => {
          done(reject, new Error('Entre na sua conta para continuar.'))
        }, 8000)
      })

      const user = auth.currentUser
      if (!user || user.isAnonymous) {
        throw new Error('Entre na sua conta para continuar.')
      }
      this.userId = user.uid
      this.displayName = user.displayName || this._loadDisplayName()
      if (!user.displayName && this.displayName) {
        try { await updateProfile(user, { displayName: this.displayName }) } catch {}
      }

      const userRef = doc(db, VC.users, this.userId)
      const existing = await getDoc(userRef)
      const prior = existing.data() || {}
      this._profile = {
        displayName: this.displayName,
        photoURL: prior.photoURL || user.photoURL || '',
        handle: prior.handle || '',
        bio: prior.bio || '',
        statusText: prior.statusText || '',
        cover: prior.cover || '',
        coverFit: prior.coverFit || null,
        bannerHue: prior.bannerHue ?? 340,
        cardThemeId: prior.cardThemeId || 'default',
      }
      this.displayName = prior.displayName || this.displayName
      this._profile.displayName = this.displayName
      await setDoc(userRef, {
        displayName: this.displayName,
        email: user.email || null,
        photoURL: this._profile.photoURL || null,
        online: true,
        lastSeen: Date.now(),
        updatedAt: serverTimestamp(),
        ...(prior.createdAt ? {} : { createdAt: Date.now() }),
      }, { merge: true })

      this.ws = { readyState: 1 }
      this.connected = true
      this._listenMySpaces()
      this._startPresence()
      this._emit('status', { type: 'connected' })
      console.log('✅ Conectado ao Firebase')
    } catch (err) {
      this.connected = false
      this._emit('status', { type: 'failed' })
      const message = err?.message || 'Falha ao conectar no Firebase'
      if (this.errorCallback) this.errorCallback(message)
      throw new Error(message)
    }
  }

  _listenMySpaces() {
    const q = query(collection(db, VC.spaces), where('memberIds', 'array-contains', this.userId))
    const off = onSnapshot(q, (snap) => {
      const spaces = snap.docs.map((d) => toSpaceSummary(d.id, d.data(), true))
      this._emit('spaceChanged', {
        spaces,
        currentSpace: this._spaceCache,
      })
    }, (err) => {
      console.warn('[spaces list]', err)
    })
    this._unsubs.push(off)
  }

  _startPresence() {
    if (this._presenceOff) {
      try { this._presenceOff() } catch {}
      this._presenceOff = null
    }
    if (!this.userId) return
    this._presenceOff = attachUserPresence(this.userId)
    this._unsubs.push(() => {
      if (this._presenceOff) {
        try { this._presenceOff() } catch {}
        this._presenceOff = null
      }
    })
  }

  _bindSpacePresence(spaceId) {
    if (this._spacePresenceOff) {
      try { this._spacePresenceOff() } catch {}
      this._spacePresenceOff = null
    }
    if (this._spacePresenceListenOff) {
      try { this._spacePresenceListenOff() } catch {}
      this._spacePresenceListenOff = null
    }
    if (!this.userId || !spaceId) return

    this._spacePresenceOff = attachSpacePresence(this.userId, spaceId, this.roomId || null)
    this._spacePresenceListenOff = listenSpacePresence(spaceId, (map) => {
      this._presenceByUser = map
      if (this._spaceCache?.members) {
        const members = this._spaceCache.members.map((m) => {
          const p = map[m.userId]
          if (!p) return { ...m, online: false }
          return {
            ...m,
            online: !!p.online,
            location: p.online
              ? { spaceId, roomId: p.roomId || null }
              : m.location,
          }
        })
        this._spaceCache = { ...this._spaceCache, members }
      }
      this._emit('presenceChanged', { spaceId, presence: map })
    })
  }

  _clearSpacePresence() {
    if (this._spacePresenceOff) {
      try { this._spacePresenceOff() } catch {}
      this._spacePresenceOff = null
    }
    if (this._spacePresenceListenOff) {
      try { this._spacePresenceListenOff() } catch {}
      this._spacePresenceListenOff = null
    }
    this._presenceByUser = {}
  }

  async _hydrateSpace(spaceId, prefetchedSnap = null, { enrichUsers = true } = {}) {
    const snap = prefetchedSnap?.exists?.() ? prefetchedSnap : await getDoc(spaceRef(spaceId))
    if (!snap.exists()) throw new Error('space não encontrado')
    const [roomsSnap, membersSnap] = await Promise.all([
      getDocs(roomsCol(spaceId)),
      getDocs(membersCol(spaceId)),
    ])
    const rooms = roomsSnap.docs.map((d) => toRoomView(d.id, d.data()))
    let members
    if (enrichUsers && membersSnap.docs.length > 0) {
      const userSnaps = await Promise.all(
        membersSnap.docs.map((d) => getDoc(doc(db, VC.users, d.id)).catch(() => null)),
      )
      const usersById = {}
      userSnaps.forEach((s) => {
        if (s?.exists()) usersById[s.id] = s.data()
      })
      members = membersSnap.docs.map((d) => mergeUserOntoMember(toMemberView(d.id, d.data()), usersById[d.id]))
    } else {
      members = membersSnap.docs.map((d) => toMemberView(d.id, d.data()))
    }
    const full = toSpaceFull(spaceId, snap.data(), rooms, members)
    this._spaceCache = full
    return full
  }

  _attachSpaceListeners(spaceId) {
    this._clear(this._spaceUnsubs)

    let roomsReady = false
    let membersReady = false

    this._spaceUnsubs.push(onSnapshot(spaceRef(spaceId), (snap) => {
      if (!snap.exists()) {
        if (this.spaceId === spaceId) {
          this.spaceId = null
          this._spaceCache = null
          this._emit('spaceChanged', { space: null, currentSpace: null, deleted: spaceId })
        }
        return
      }
      const data = snap.data()
      const prev = this._spaceCache
      const full = toSpaceFull(spaceId, data, prev?.rooms || [], prev?.members || [])
      this._spaceCache = full
      this._emit('spaceChanged', { space: full, updated: true })
    }))

    this._spaceUnsubs.push(onSnapshot(roomsCol(spaceId), (snap) => {
      const rooms = snap.docs.map((d) => toRoomView(d.id, d.data()))
      if (this._spaceCache) this._spaceCache = { ...this._spaceCache, rooms, roomCount: rooms.length }
      if (!roomsReady) {
        roomsReady = true
        return
      }
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          this._emit('roomChanged', { kind: 'created', spaceId, room: toRoomView(change.doc.id, change.doc.data()) })
        } else if (change.type === 'modified') {
          this._emit('roomChanged', { kind: 'updated', spaceId, room: toRoomView(change.doc.id, change.doc.data()) })
        } else if (change.type === 'removed') {
          this._emit('roomChanged', { kind: 'deleted', spaceId, roomId: change.doc.id })
        }
      })
    }))

    this._spaceUnsubs.push(onSnapshot(membersCol(spaceId), (snap) => {
      // Prefer the fresh member doc. Only keep enrichment fields (e.g. createdAt)
      // from the previous cache when the snapshot omits them — never let stale
      // cache overwrite profile cosmetics like cardThemeId / cover.
      const members = snap.docs.map((d) => {
        const view = toMemberView(d.id, d.data())
        const prev = this._spaceCache?.members?.find((m) => m.userId === d.id)
        if (!prev) return view
        return {
          ...prev,
          ...view,
          createdAt: view.createdAt || prev.createdAt || null,
        }
      })
      if (this._spaceCache) this._spaceCache = { ...this._spaceCache, members, memberCount: members.length }
      if (!membersReady) {
        membersReady = true
        return
      }
      snap.docChanges().forEach((change) => {
        const view = toMemberView(change.doc.id, change.doc.data())
        if (change.type === 'added') {
          this._emit('memberJoined', view)
        } else if (change.type === 'removed') {
          this._emit('memberLeft', { userId: view.userId, spaceId })
        } else if (change.type === 'modified') {
          const member = members.find((m) => m.userId === view.userId) || view
          this._emit('memberStatus', { userId: view.userId, status: view.status, member })
          // Presence online/offline lives on RTDB — avoid full spaceChanged
          // storm from profile/location patches alone.
        }
      })
    }))
  }

  _attachRoomListeners(spaceId, roomId) {
    this._clear(this._roomUnsubs)
    const seenPeers = new Set()

    this._roomUnsubs.push(onSnapshot(peersCol(spaceId, roomId), (snap) => {
      const now = new Set(snap.docs.map((d) => d.id))
      for (const id of now) {
        if (id === this.userId) continue
        if (!seenPeers.has(id)) {
          const data = snap.docs.find((d) => d.id === id)?.data() || {}
          const msg = { type: 'peer-joined', userId: id, peerId: id, displayName: data.displayName }
          this._emit('peerJoined', msg)
          if (this.signalCallback) this.signalCallback(msg)
        }
      }
      for (const id of seenPeers) {
        if (!now.has(id) && id !== this.userId) {
          const msg = { type: 'peer-left', userId: id, peerId: id }
          this._emit('peerLeft', msg)
          if (this.signalCallback) this.signalCallback(msg)
        }
      }
      seenPeers.clear()
      now.forEach((id) => seenPeers.add(id))
    }))

    this._roomUnsubs.push(onSnapshot(signalsCol(spaceId, roomId), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const data = change.doc.data() || {}
        if (data.from === this.userId) return
        if (data.to && data.to !== this.userId) return
        const msg = {
          type: data.type,
          ...(data.payload || {}),
          from: data.from,
          to: data.to,
        }
        if (this.signalCallback) this.signalCallback(msg)
        if (data.type === 'screen-share-state') {
          this._emit('screenShareState', { active: !!msg.active, userId: data.from })
        }
        if (data.type === 'camera-state') {
          this._emit('cameraState', { active: !!msg.active, userId: data.from })
        }
        deleteDoc(change.doc.ref).catch(() => {})
      })
    }))

    this._roomUnsubs.push(onSnapshot(thoughtsCol(spaceId, roomId), (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type !== 'added') return
        const data = change.doc.data() || {}
        this._emit('roomThought', {
          type: 'room:thought',
          id: change.doc.id,
          roomId,
          userId: data.userId,
          displayName: data.displayName,
          text: data.text,
          ts: data.ts,
        })
      })
    }))
  }

  async createSpace(name, description = '', icon = 'ph:users-three:outline', color = '#5865F2', extras = {}) {
    const spaceId = uid()
    let cover = null
    if (extras.cover) {
      cover = await uploadSpaceCover(spaceId, extras.cover)
    }
    const payload = {
      name: String(name || '').trim() || 'sem nome',
      description: String(description || '').slice(0, 256),
      icon: String(icon || 'ph:users-three:outline').slice(0, 80),
      color: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#E74C3C',
      cover,
      coverFit: extras.coverFit || null,
      themeId: extras.themeId || null,
      visibility: normalizeVisibility(extras.visibility),
      events: [],
      createdBy: this.userId,
      createdAt: Date.now(),
      memberIds: [this.userId],
      roomCount: 0,
    }
    await setDoc(spaceRef(spaceId), payload)
    await setDoc(memberRef(spaceId, this.userId), {
      ...this._memberProfileFields(),
      role: 'creator',
      online: true,
      lastSeen: Date.now(),
      joinedAt: Date.now(),
      location: { spaceId, roomId: null },
      status: null,
    })
    const space = toSpaceFull(spaceId, payload, [], [toMemberView(this.userId, {
      displayName: this.displayName, online: true, lastSeen: Date.now(),
    })])
    return { space }
  }

  async listPublicSpaces({ query: search = '', limit: max = 48 } = {}) {
    if (!this.userId) throw new Error('não autenticado')
    const q = query(
      collection(db, VC.spaces),
      where('visibility', '==', 'public'),
      limit(Math.min(Math.max(Number(max) || 48, 1), 100)),
    )
    const snap = await getDocs(q)
    const needle = String(search || '').trim().toLowerCase()
    const spaces = snap.docs.map((d) => {
      const data = d.data() || {}
      const memberIds = Array.isArray(data.memberIds) ? data.memberIds : []
      return toSpaceSummary(d.id, data, memberIds.includes(this.userId))
    })
    if (!needle) return spaces
    return spaces.filter((s) => {
      const hay = `${s.name} ${s.description}`.toLowerCase()
      return hay.includes(needle)
    })
  }

  async joinSpace(spaceId) {
    const snap = await getDoc(spaceRef(spaceId))
    if (!snap.exists()) throw new Error('space não encontrado')
    const data = snap.data() || {}
    const memberIds = Array.isArray(data.memberIds) ? data.memberIds : []
    const alreadyMember = !!this.userId && memberIds.includes(this.userId)

    // Already a member: skip arrayUnion and hydrate without N user round-trips
    // (member/room listeners enrich profiles right after attach).
    const membershipWrite = alreadyMember
      ? Promise.resolve()
      : updateDoc(spaceRef(spaceId), { memberIds: arrayUnion(this.userId) })

    const presenceWrite = setDoc(memberRef(spaceId, this.userId), {
      ...this._memberProfileFields(),
      role: data.createdBy === this.userId ? 'creator' : 'member',
      online: true,
      lastSeen: Date.now(),
      ...(alreadyMember ? {} : { joinedAt: Date.now() }),
      location: { spaceId, roomId: null },
    }, { merge: true })

    this.spaceId = spaceId
    this.roomId = null

    const [space] = await Promise.all([
      this._hydrateSpace(spaceId, snap, { enrichUsers: !alreadyMember }),
      membershipWrite,
      presenceWrite,
    ])

    this._attachSpaceListeners(spaceId)
    this._bindSpacePresence(spaceId)
    this._emit('spaceChanged', { space, currentSpace: space, currentRoom: null })
    return { space }
  }

  async leaveSpace(spaceId) {
    const id = spaceId || this.spaceId
    if (!id || !this.userId) return
    this._clearSpacePresence()
    this._clear(this._roomUnsubs)
    this._clear(this._spaceUnsubs)
    if (this.roomId) {
      try { await deleteDoc(doc(peersCol(id, this.roomId), this.userId)) } catch {}
    }
    try {
      await updateDoc(spaceRef(id), { memberIds: arrayRemove(this.userId) })
      await deleteDoc(memberRef(id, this.userId))
    } catch (err) {
      console.warn('[leaveSpace]', err)
    }
    this.spaceId = null
    this.roomId = null
    this._spaceCache = null
    this._emit('spaceChanged', {
      space: null,
      currentSpace: null,
      currentRoom: null,
      left: id,
    })
  }

  async deleteSpace(spaceId) {
    const id = spaceId || this.spaceId
    if (!id) return
    const snap = await getDoc(spaceRef(id))
    if (!snap.exists()) return
    if (snap.data().createdBy !== this.userId) {
      throw new Error('só o criador pode deletar')
    }
    const [roomsSnap, membersSnap] = await Promise.all([
      getDocs(roomsCol(id)),
      getDocs(membersCol(id)),
    ])
    const batch = writeBatch(db)
    roomsSnap.docs.forEach((d) => batch.delete(d.ref))
    membersSnap.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(spaceRef(id))
    await batch.commit()
    await deleteSpaceCover(id)
    if (this.spaceId === id) {
      this._clearSpacePresence()
      this._clear(this._roomUnsubs)
      this._clear(this._spaceUnsubs)
      this.spaceId = null
      this.roomId = null
      this._spaceCache = null
    }
    this._emit('spaceChanged', {
      space: null,
      currentSpace: null,
      deleted: id,
    })
  }

  async updateSpace(spaceId, updates = {}) {
    const id = spaceId || this.spaceId
    if (!id) return
    const next = {}
    if (typeof updates.name === 'string') next.name = updates.name.slice(0, 64).trim()
    if (typeof updates.description === 'string') next.description = updates.description.slice(0, 256)
    if (typeof updates.icon === 'string') next.icon = updates.icon.slice(0, 80)
    if (typeof updates.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(updates.color)) next.color = updates.color
    if (Array.isArray(updates.events)) next.events = updates.events
    if (updates.coverFit !== undefined) next.coverFit = updates.coverFit
    if (updates.visibility !== undefined) next.visibility = normalizeVisibility(updates.visibility)
    if (updates.cover === null) {
      await deleteSpaceCover(id)
      next.cover = null
    } else if (typeof updates.cover === 'string') {
      next.cover = await uploadSpaceCover(id, updates.cover)
    }
    if (Object.keys(next).length === 0) return
    await updateDoc(spaceRef(id), next)
  }

  async createRoom(name, type = 'voice', purpose) {
    if (!this.spaceId) throw new Error('entre num space primeiro')
    const roomType = type === 'voice' ? 'voice' : 'text'
    const payload = {
      name: String(name || '').trim() || 'sem nome',
      type: roomType,
      purpose: String(purpose || (roomType === 'voice' ? 'voice' : 'conversation')).slice(0, 32),
      createdBy: this.userId,
      createdAt: Date.now(),
    }
    const ref = await addDoc(roomsCol(this.spaceId), payload)
    try {
      await updateDoc(spaceRef(this.spaceId), { roomCount: (this._spaceCache?.rooms?.length || 0) + 1 })
    } catch {}
    return { room: toRoomView(ref.id, payload) }
  }

  async updateRoom(roomId, updates = {}) {
    if (!this.spaceId || !roomId) return
    const next = {}
    if (typeof updates.name === 'string') {
      next.name = updates.name.slice(0, 64).trim() || 'sem nome'
    }
    if (typeof updates.purpose === 'string') {
      const purpose = updates.purpose.slice(0, 32)
      next.purpose = purpose
      next.type = purpose === 'voice' ? 'voice' : 'text'
    } else if (typeof updates.type === 'string') {
      next.type = updates.type === 'voice' ? 'voice' : 'text'
    }
    if (Object.keys(next).length === 0) return
    await updateDoc(roomRef(this.spaceId, roomId), next)
    const snap = await getDoc(roomRef(this.spaceId, roomId))
    if (!snap.exists()) return
    return { room: toRoomView(roomId, snap.data()) }
  }

  async deleteRoom(roomId) {
    if (!this.spaceId || !roomId) return
    await deleteDoc(roomRef(this.spaceId, roomId))
    try {
      const remaining = Math.max(0, (this._spaceCache?.rooms?.length || 1) - 1)
      await updateDoc(spaceRef(this.spaceId), { roomCount: remaining })
    } catch {}
    if (this.roomId === roomId) {
      this._clear(this._roomUnsubs)
      this.roomId = null
    }
  }

  async enterRoom(roomId) {
    if (!this.spaceId) throw new Error('entre num space primeiro')
    const snap = await getDoc(roomRef(this.spaceId, roomId))
    if (!snap.exists()) throw new Error('room não encontrada')
    if (this.roomId && this.roomId !== roomId) {
      try { await deleteDoc(doc(peersCol(this.spaceId, this.roomId), this.userId)) } catch {}
      this._clear(this._roomUnsubs)
    }
    this.roomId = roomId
    await setDoc(doc(peersCol(this.spaceId, roomId), this.userId), {
      displayName: this.displayName,
      photoURL: this._profile.photoURL || '',
      joinedAt: Date.now(),
    })
    await setDoc(memberRef(this.spaceId, this.userId), {
      location: { spaceId: this.spaceId, roomId },
    }, { merge: true })
    this._bindSpacePresence(this.spaceId)
    this._attachRoomListeners(this.spaceId, roomId)
    const peersSnap = await getDocs(peersCol(this.spaceId, roomId))
    const room = toRoomView(roomId, snap.data())
    const peers = peersSnap.docs
      .filter((d) => d.id !== this.userId)
      .map((d) => ({
        userId: d.id,
        displayName: d.data().displayName || 'convidado',
        photoURL: d.data().photoURL || '',
      }))
    this._emit('roomChanged', { kind: 'entered', room, peers })
    return { room, peers }
  }

  async leaveRoom() {
    if (!this.spaceId || !this.roomId) return
    const roomId = this.roomId
    try { await deleteDoc(doc(peersCol(this.spaceId, roomId), this.userId)) } catch {}
    try {
      await setDoc(memberRef(this.spaceId, this.userId), {
        location: { spaceId: this.spaceId, roomId: null },
      }, { merge: true })
    } catch {}
    this._clear(this._roomUnsubs)
    this.roomId = null
    this._bindSpacePresence(this.spaceId)
    this._emit('roomChanged', { kind: 'left' })
  }

  async sendThought(text) {
    if (!this.spaceId || !this.roomId) return
    const trimmed = String(text || '').trim().slice(0, 180)
    if (!trimmed) return
    await addDoc(thoughtsCol(this.spaceId, this.roomId), {
      userId: this.userId,
      displayName: this.displayName,
      text: trimmed,
      ts: Date.now(),
    })
  }

  async sendMemberStatus(status) {
    if (!this.userId) return
    const value = String(status || '').trim().slice(0, 40) || null
    await setDoc(doc(db, VC.users, this.userId), { status: value }, { merge: true })
    if (this.spaceId) {
      await setDoc(memberRef(this.spaceId, this.userId), { status: value }, { merge: true })
    }
  }

  sendSignal(type, payload = {}) {
    if (!this.spaceId || !this.roomId) return
    addDoc(signalsCol(this.spaceId, this.roomId), {
      from: this.userId,
      to: payload.to || null,
      type,
      payload,
      ts: Date.now(),
    }).catch((err) => console.warn('[signal]', err))
  }

  sendScreenShareState(active) {
    this.sendSignal('screen-share-state', { active: !!active })
    this._emit('screenShareState', { active: !!active, userId: this.userId })
  }

  sendCameraState(active) {
    this.sendSignal('camera-state', { active: !!active })
    this._emit('cameraState', { active: !!active, userId: this.userId })
  }

  async uploadChatFile(file) {
    if (!this.spaceId || !this.roomId || !file) return null
    return uploadChatFile(this.spaceId, this.roomId, file)
  }

  async sendChatMessage(message) {
    if (!this.spaceId || !this.roomId || !message) return
    const clean = JSON.parse(JSON.stringify({
      ...message,
      authorId: this.userId,
      ts: message.ts || Date.now(),
    }))
    await addDoc(messagesCol(this.spaceId, this.roomId), clean)
  }

  listenChat(spaceId, roomId, cb) {
    if (!spaceId || !roomId || typeof cb !== 'function') return () => {}
    return onSnapshot(messagesCol(spaceId, roomId), (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.ts || 0) - (b.ts || 0))
      cb(list)
    })
  }

  _memberProfileFields() {
    return {
      displayName: this.displayName,
      photoURL: this._profile.photoURL || '',
      handle: this._profile.handle || '',
      bio: this._profile.bio || '',
      statusText: this._profile.statusText || '',
      cover: this._profile.cover || '',
      coverFit: this._profile.coverFit || null,
      bannerHue: this._profile.bannerHue ?? 340,
      cardThemeId: this._profile.cardThemeId || 'default',
    }
  }

  async setDisplayName(name) {
    return this.setProfile({ displayName: name })
  }

  async setProfile(patch = {}) {
    if (!this.userId) return
    if (patch.displayName) {
      this.displayName = String(patch.displayName || '').slice(0, 64) || this.displayName
      try { localStorage.setItem('voicecraft:displayName', this.displayName) } catch {}
    }
    this._profile = {
      ...this._profile,
      ...patch,
      displayName: this.displayName,
    }
    if (auth.currentUser && (patch.displayName || patch.photoURL !== undefined)) {
      try {
        await updateProfile(auth.currentUser, {
          displayName: this.displayName,
          ...(patch.photoURL !== undefined ? { photoURL: patch.photoURL || null } : {}),
        })
      } catch { /* optional */ }
    }
    await setDoc(doc(db, VC.users, this.userId), this._memberProfileFields(), { merge: true })
    if (this.spaceId) {
      await setDoc(memberRef(this.spaceId, this.userId), this._memberProfileFields(), { merge: true })
    }
  }

  disconnect() {
    this._closed = true
    this.connected = false
    if (this._heartbeat) {
      clearInterval(this._heartbeat)
      this._heartbeat = null
    }
    this._clear(this._roomUnsubs)
    this._clear(this._spaceUnsubs)
    this._clear(this._unsubs)
    this.ws = null
    this._connectPromise = null
    this._emit('status', { type: 'disconnected' })
  }
}
