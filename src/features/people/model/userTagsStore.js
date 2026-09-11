/**
 * Global user tags — Firestore `vc_user_tags/{uid}` + `vc_config/admins`.
 */
import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { auth, db, VC } from '../../../shared/firebase/app'
import {
  TAG_CATALOG,
  TAG_COLOR_PRESETS,
  envPrincipalUid,
  looksLikePrincipalProfile,
  normalizeTags,
  orderTags,
  resolveTag,
  slugTagId,
  syncDisplayOrder,
} from './userTags'
import { flashToast } from '../../../shared/utils/toast'

function tagsRef(uid) {
  return doc(db, VC.userTags, uid)
}

function adminsRef() {
  return doc(db, VC.config, 'admins')
}

function catalogRef() {
  return doc(db, VC.config, 'tag_catalog')
}

let cachedPrincipalUid = envPrincipalUid() || null
let principalListeners = new Set()

function emitPrincipal() {
  principalListeners.forEach((fn) => {
    try { fn(cachedPrincipalUid) } catch {}
  })
}

export function getCachedPrincipalUid() {
  return cachedPrincipalUid
}

export function isPrincipalUid(uid) {
  if (!uid) return false
  if (envPrincipalUid() && uid === envPrincipalUid()) return true
  return !!cachedPrincipalUid && uid === cachedPrincipalUid
}

/** Live principal uid from vc_config/admins (plus env override). */
export function subscribePrincipalUid(onChange) {
  const env = envPrincipalUid()
  if (env) {
    cachedPrincipalUid = env
    onChange?.(env)
    return () => {}
  }

  principalListeners.add(onChange)
  onChange?.(cachedPrincipalUid)

  const unsub = onSnapshot(adminsRef(), (snap) => {
    const uid = snap.exists() ? (snap.data()?.principalUid || null) : null
    cachedPrincipalUid = uid
    emitPrincipal()
  }, () => {
    cachedPrincipalUid = null
    emitPrincipal()
  })

  return () => {
    principalListeners.delete(onChange)
    unsub()
  }
}

export async function loadPrincipalUid() {
  const env = envPrincipalUid()
  if (env) {
    cachedPrincipalUid = env
    return env
  }
  const snap = await getDoc(adminsRef())
  const uid = snap.exists() ? (snap.data()?.principalUid || null) : null
  cachedPrincipalUid = uid
  return uid
}

/**
 * One-time claim: Ethan binds this Auth uid as principal.
 * Firestore rules only allow create when the admins doc is missing.
 */
export async function claimPrincipalAccount(profile) {
  const user = auth.currentUser
  if (!user?.uid) throw new Error('Faça login primeiro')
  if (envPrincipalUid()) {
    flashToast('Principal já definido no build')
    return envPrincipalUid()
  }
  if (!looksLikePrincipalProfile(profile || { displayName: user.displayName })) {
    throw new Error('Só a conta Ethan Noward pode reivindicar o principal')
  }
  const existing = await getDoc(adminsRef())
  if (existing.exists() && existing.data()?.principalUid) {
    cachedPrincipalUid = existing.data().principalUid
    if (cachedPrincipalUid !== user.uid) {
      throw new Error('Conta principal já está definida')
    }
    return cachedPrincipalUid
  }
  await setDoc(adminsRef(), {
    principalUid: user.uid,
    displayName: user.displayName || profile?.displayName || 'Ethan Noward',
    claimedAt: Date.now(),
  })
  cachedPrincipalUid = user.uid
  emitPrincipal()
  flashToast('Conta principal ativada')
  return user.uid
}

export function subscribeUserTags(uid, onChange) {
  if (!uid) {
    onChange?.([])
    return () => {}
  }
  return onSnapshot(tagsRef(uid), (snap) => {
    const data = snap.exists() ? snap.data() : null
    const tags = orderTags(data?.tags, data?.displayOrder)
    onChange?.(tags)
  }, () => onChange?.([]))
}

export async function loadUserTags(uid) {
  if (!uid) return []
  const snap = await getDoc(tagsRef(uid))
  if (!snap.exists()) return []
  const data = snap.data()
  return orderTags(data?.tags, data?.displayOrder)
}

/** Owner-only: persist display order of their assigned tags. */
export async function setUserTagDisplayOrder(uid, displayOrder) {
  const me = auth.currentUser?.uid
  if (!me || me !== uid) {
    throw new Error('Só você pode reordenar suas tags')
  }
  const snap = await getDoc(tagsRef(uid))
  const tags = normalizeTags(snap.exists() ? snap.data()?.tags : [])
  const next = syncDisplayOrder(displayOrder, tags)
  await setDoc(tagsRef(uid), {
    displayOrder: next,
    displayOrderUpdatedAt: Date.now(),
  }, { merge: true })
  return orderTags(tags, next)
}

/** Subscribe many uids → Map uid -> tags[] (for space member lists). */
export function subscribeUserTagsMap(uids, onChange) {
  const list = [...new Set((uids || []).filter(Boolean))]
  if (list.length === 0) {
    onChange?.(new Map())
    return () => {}
  }
  const map = new Map()
  const unsubs = list.map((uid) => subscribeUserTags(uid, (tags) => {
    map.set(uid, tags)
    onChange?.(new Map(map))
  }))
  return () => unsubs.forEach((u) => u?.())
}

export async function setUserTagIds(targetUid, tagIds, { assignedBy, catalog = TAG_CATALOG } = {}) {
  const me = assignedBy || auth.currentUser?.uid
  const principal = await loadPrincipalUid()
  const allowedWriter = !!me && (me === principal || isPrincipalUid(me) || me === envPrincipalUid())
  if (!allowedWriter) {
    throw new Error('Só a conta principal pode gerenciar tags')
  }
  if (!targetUid) throw new Error('Usuário inválido')

  const byId = Object.fromEntries((catalog || TAG_CATALOG).map((t) => [t.id, t]))
  const next = []
  const seen = new Set()
  for (const id of tagIds || []) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    const base = byId[id] || resolveTag(id)
    if (!base) continue
    next.push({
      id: base.id,
      label: base.label,
      color: base.color,
      assignedBy: me,
      assignedAt: Date.now(),
    })
  }

  const prevSnap = await getDoc(tagsRef(targetUid))
  const prevOrder = prevSnap.exists() ? prevSnap.data()?.displayOrder : []
  const displayOrder = syncDisplayOrder(prevOrder, next)

  await setDoc(tagsRef(targetUid), {
    tags: next,
    displayOrder,
    updatedAt: Date.now(),
    updatedBy: me,
  }, { merge: true })
  return orderTags(next, displayOrder)
}

/** Replace the full tag list (supports custom tags not in the default catalog). */
export async function setUserTags(targetUid, tags, { assignedBy } = {}) {
  const me = assignedBy || auth.currentUser?.uid
  const principal = await loadPrincipalUid()
  const allowedWriter = !!me && (me === principal || isPrincipalUid(me) || me === envPrincipalUid())
  if (!allowedWriter) {
    throw new Error('Só a conta principal pode gerenciar tags')
  }
  if (!targetUid) throw new Error('Usuário inválido')

  const next = normalizeTags(tags).map((t) => ({
    id: t.id,
    label: t.label,
    color: t.color,
    assignedBy: me,
    assignedAt: Date.now(),
  }))

  const prevSnap = await getDoc(tagsRef(targetUid))
  const prevOrder = prevSnap.exists() ? prevSnap.data()?.displayOrder : []
  const displayOrder = syncDisplayOrder(prevOrder, next)

  await setDoc(tagsRef(targetUid), {
    tags: next,
    displayOrder,
    updatedAt: Date.now(),
    updatedBy: me,
  }, { merge: true })
  return orderTags(next, displayOrder)
}

export async function toggleUserTag(targetUid, tagId, enabled) {
  const current = await loadUserTags(targetUid)
  const ids = new Set(current.map((t) => t.id))
  if (enabled) ids.add(tagId)
  else ids.delete(tagId)
  return setUserTagIds(targetUid, [...ids])
}

export function subscribeTagCatalog(onChange) {
  return onSnapshot(catalogRef(), (snap) => {
    const custom = normalizeTags(snap.exists() ? snap.data()?.tags : [])
    const merged = mergeCatalog(TAG_CATALOG, custom)
    onChange?.(merged)
  }, () => onChange?.(TAG_CATALOG))
}

function mergeCatalog(base, custom) {
  const map = new Map()
  for (const t of base || []) map.set(t.id, { ...t, custom: false })
  for (const t of custom || []) map.set(t.id, { ...t, custom: true })
  return [...map.values()]
}

export async function loadTagCatalog() {
  const snap = await getDoc(catalogRef())
  const custom = normalizeTags(snap.exists() ? snap.data()?.tags : [])
  return mergeCatalog(TAG_CATALOG, custom)
}

export async function createCustomTag({ label, color }) {
  const me = auth.currentUser?.uid
  const principal = await loadPrincipalUid()
  if (!me || (me !== principal && !isPrincipalUid(me))) {
    throw new Error('Só a conta principal pode criar tags')
  }
  const trimmed = String(label || '').trim().slice(0, 24)
  if (!trimmed) throw new Error('Digite um nome pra tag')
  const tag = {
    id: slugTagId(trimmed),
    label: trimmed,
    color: TAG_COLOR_PRESETS.includes(color) ? color : (color || TAG_COLOR_PRESETS[0]),
    hint: 'Tag personalizada',
    custom: true,
    createdBy: me,
    createdAt: Date.now(),
  }
  const snap = await getDoc(catalogRef())
  const existing = normalizeTags(snap.exists() ? snap.data()?.tags : [])
  if (existing.some((t) => t.label.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('Já existe uma tag com esse nome')
  }
  const next = [...existing, tag]
  await setDoc(catalogRef(), {
    tags: next,
    updatedAt: Date.now(),
    updatedBy: me,
  }, { merge: true })
  return tag
}

export async function removeCustomTag(tagId) {
  const me = auth.currentUser?.uid
  const principal = await loadPrincipalUid()
  if (!me || (me !== principal && !isPrincipalUid(me))) {
    throw new Error('Só a conta principal pode remover tags')
  }
  if (!String(tagId || '').startsWith('c_')) {
    throw new Error('Só tags personalizadas podem ser removidas do catálogo')
  }
  const snap = await getDoc(catalogRef())
  const existing = normalizeTags(snap.exists() ? snap.data()?.tags : [])
  const next = existing.filter((t) => t.id !== tagId)
  await setDoc(catalogRef(), {
    tags: next,
    updatedAt: Date.now(),
    updatedBy: me,
  }, { merge: true })
  return next
}

export { TAG_CATALOG, TAG_COLOR_PRESETS }
