/**
 * spaceIcons.js — single entry point for Space icons.
 *
 * Architecture:
 *   - ICON_CATALOG (generated) = curated list of Phosphor icons with PT/EN
 *     keywords, categories, and a 4-style variant per icon.
 *   - registerSpaceIcons()  — call once at boot to load the local
 *     @iconify-json/ph collection so Iconify can resolve icon IDs offline.
 *   - <SpaceIcon value={…} />  — single React component that renders the
 *     icon at the right size, with currentColor, in the right style.
 *   - searchSpaceIcons(query, options)  — PT/EN keyword + label + category
 *     search, scoped to the curated catalog.
 *   - getRecentIcons() / pushRecentIcon()  — localStorage-backed MRU of
 *     the user's last 12 picks.
 *
 * Persistence shape (the only thing saved with a Space):
 *   { id, collection, name, style }
 *   (e.g. { id: "users-three", collection: "ph", name: "users-three",
 *          style: "outline" })
 */
import { useEffect, useMemo, useRef, useState } from 'react'
// IMPORTANT: import from `/offline` so the Icon component reads from
// the local storage populated by addCollection() instead of trying to
// fetch icons from the Iconify API at runtime. The default
// `@iconify/react` entry point is the online variant.
import { Icon, addCollection } from '@iconify/react/offline'
import { ICON_CATALOG } from './spaceIcons.generated.js'

// ---- Style config (per spec) --------------------------------------------
// Each style has its own size + stroke. Filled and duotone don't use stroke.
export const ICON_STYLE_CONFIG = {
  outline: { size: 24, strokeWidth: 1.8, suffix: '' },
  rounded: { size: 24, strokeWidth: 2.0, suffix: '-light' },
  filled:  { size: 23, strokeWidth: null, suffix: '-fill' },
  duotone: { size: 24, strokeWidth: null, suffix: '-duotone' },
}

export const ICON_STYLES = Object.keys(ICON_STYLE_CONFIG)

// ---- Legacy / fallback --------------------------------------------------
// If a Space was saved with the old system (icon: "users" or any Lucide
// key) we need a stable fallback so it still renders something sensible.
export const FALLBACK_SPACE_ICON = {
  id: 'users',
  collection: 'ph',
  name: 'users',
  style: 'outline',
}

// ---- Boot-time registration ---------------------------------------------
// Full Phosphor JSON (~4.5MB) is loaded lazily via ensureFullSpaceIcons().
// Boot only marks the module ready; first SpaceIcon / IconPicker pulls the pack.
let _bootRegistered = false
let _fullLoaded = false
let _fullPromise = null
const _fullListeners = new Set()

function notifyFullIcons() {
  _fullListeners.forEach((fn) => {
    try { fn() } catch { /* ignore */ }
  })
}

/**
 * Call once at app start. Does NOT import the full Phosphor JSON.
 */
export function registerSpaceIcons() {
  _bootRegistered = true
}

export function spaceIconsReady() {
  return _fullLoaded
}

/**
 * Dynamically load @iconify-json/ph/icons.json once. Safe to call many times.
 */
export function ensureFullSpaceIcons() {
  if (_fullLoaded) return Promise.resolve()
  if (_fullPromise) return _fullPromise
  _fullPromise = import('@iconify-json/ph/icons.json')
    .then((mod) => {
      const pack = mod.default || mod
      addCollection(pack)
      _fullLoaded = true
      notifyFullIcons()
    })
    .catch((err) => {
      console.warn('[spaceIcons] failed to load Phosphor pack', err)
      _fullPromise = null
      throw err
    })
  return _fullPromise
}

function useSpaceIconsReady() {
  const [ready, setReady] = useState(_fullLoaded)
  useEffect(() => {
    if (_fullLoaded) {
      setReady(true)
      return undefined
    }
    const onReady = () => setReady(true)
    _fullListeners.add(onReady)
    ensureFullSpaceIcons().catch(() => {})
    return () => { _fullListeners.delete(onReady) }
  }, [])
  return ready
}

// ---- Lookup helpers -----------------------------------------------------
const CATALOG_BY_ID = new Map(ICON_CATALOG.map(e => [e.id, e]))
const CATALOG_BY_NAME = new Map(ICON_CATALOG.map(e => [e.name, e]))
const CATALOG_BY_NAME_STYLE = new Map(ICON_CATALOG.map(e => [`${e.name}::${e.style}`, e]))

function catalogEntry(name, style, id) {
  return (
    (name && style && CATALOG_BY_NAME_STYLE.get(`${name}::${style}`)) ||
    (id && CATALOG_BY_ID.get(id)) ||
    (name && CATALOG_BY_NAME.get(name)) ||
    null
  )
}
const LEGACY_KEY_MAP = {
  // Old lucide keys used by the v1 system → closest Phosphor equivalent.
  users: 'users-three',
  messages: 'chats',
  home: 'house',
  heart: 'heart',
  megaphone: 'megaphone',
  mic: 'microphone',
  radio: 'broadcast',
  headphones: 'headphones',
  briefcase: 'briefcase',
  book: 'book-open',
  cpu: 'cpu',
  shield: 'shield',
  building: 'buildings',
  gamepad: 'game-controller',
  music: 'music-notes',
  coffee: 'coffee',
  star: 'star',
  flame: 'fire',
  zap: 'lightning',
  globe: 'globe',
  trophy: 'trophy',
  compass: 'compass',
  sparkles: 'sparkles',
  hammer: 'hammer',
  wrench: 'wrench',
  cog: 'gear',
}

function toCanonical(entry, fallback = {}) {
  if (!entry) return null
  return {
    id: entry.id,
    collection: entry.collection || fallback.collection || 'ph',
    name: entry.name,
    style: ICON_STYLES.includes(entry.style) ? entry.style : (fallback.style || 'outline'),
  }
}

// ---- Helper to detect if a space icon is an image ----------------------
export function isSpaceIconImage(input) {
  if (!input) return false
  if (typeof input === 'string') {
    return input.startsWith('data:image/') || /^https?:\/\//.test(input) || input.startsWith('img:')
  }
  if (typeof input === 'object' && input.type === 'image' && input.src) return true
  return false
}

/**
 * Compact wire format for the signaling server (string, ~20–40 chars):
 *   ph:users-three:outline  OR  https://... / data:image/...
 */
export function serializeSpaceIcon(input) {
  const v = normalizeSpaceIcon(input)
  if (v.type === 'image') {
    return v.src
  }
  return `${v.collection}:${v.name}:${v.style}`
}

// Normalize any incoming icon value to the canonical {id, collection, name, style} or {type: 'image', src, rawSrc, fit}
export function normalizeSpaceIcon(input) {
  if (!input || input === '[object Object]') return { ...FALLBACK_SPACE_ICON }

  // Custom image format (dataUrl or remote image URL)
  if (typeof input === 'string') {
    if (input.startsWith('data:image/') || /^https?:\/\//.test(input)) {
      return { type: 'image', src: input }
    }
    if (input.startsWith('img:')) {
      return { type: 'image', src: input.slice(4) }
    }
  }
  if (typeof input === 'object' && input.type === 'image' && input.src) {
    return {
      type: 'image',
      src: input.src,
      rawSrc: input.rawSrc || input.src,
      fit: input.fit || null,
    }
  }

  if (typeof input === 'object' && (input.id || input.name)) {
    const name = input.name || input.id
    const style = ICON_STYLES.includes(input.style) ? input.style : 'outline'
    const found = catalogEntry(name, style, input.id)
    return toCanonical(found, { collection: input.collection, style }) || {
      id: input.id || name,
      collection: input.collection || 'ph',
      name,
      style,
    }
  }

  if (typeof input === 'string') {
    // Packed: ph:users-three:outline
    if (input.includes(':')) {
      const parts = input.split(':')
      const last = parts[parts.length - 1]
      if (parts.length >= 3 && ICON_STYLES.includes(last)) {
        const style = last
        const collection = parts[0]
        const name = parts.slice(1, -1).join(':')
        const found = catalogEntry(name, style)
        return toCanonical(found, { collection, style }) || { id: name, collection, name, style }
      }
      // Iconify id: ph:users-three-fill
      if (parts.length === 2) {
        const found = CATALOG_BY_ID.get(parts[1]) || CATALOG_BY_NAME.get(parts[1])
        if (found) return toCanonical(found, { collection: parts[0] })
      }
    }

    const direct = CATALOG_BY_ID.get(input) || CATALOG_BY_NAME.get(input)
    if (direct) return toCanonical(direct)

    const phosphorName = LEGACY_KEY_MAP[input] || input
    const found = CATALOG_BY_NAME.get(phosphorName)
    if (found) return toCanonical(found)
  }

  return { ...FALLBACK_SPACE_ICON }
}

// ---- Search -------------------------------------------------------------
function normalize(str) {
  return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Search the curated catalog. Matches against:
 *   - label (PT)
 *   - phosphor icon name (EN)
 *   - keywords (PT + EN)
 *   - categories
 *   - style
 *   - collection
 *
 * Options:
 *   { style?: 'outline' | 'rounded' | 'filled' | 'duotone',
 *     category?: string,           // e.g. 'voice', 'music'
 *     limit?: number }              // default 200
 */
export function searchSpaceIcons(query = '', options = {}) {
  const { style, category, limit = 200 } = options
  const term = normalize(query.trim())
  let results = ICON_CATALOG

  if (style) results = results.filter(e => e.style === style)
  if (category) results = results.filter(e => e.categories.includes(category))

  if (term) {
    results = results.filter(e => {
      if (normalize(e.label).includes(term)) return true
      if (normalize(e.name).includes(term)) return true
      if (e.keywords.some(k => normalize(k).includes(term))) return true
      if (e.categories.some(c => normalize(c).includes(term))) return true
      if (e.style.includes(term)) return true
      if (e.collection.includes(term)) return true
      return false
    })
  }

  return results.slice(0, limit)
}

// Group catalog by categories for the picker sidebar
export function categoryCounts() {
  const counts = {}
  for (const entry of ICON_CATALOG) {
    for (const cat of entry.categories) {
      counts[cat] = (counts[cat] || 0) + 1
    }
  }
  return counts
}

// All categories in stable order (the user-defined ones come first, then any extras)
export const CATEGORY_ORDER = [
  'community', 'voice', 'work', 'leisure', 'games', 'music', 'study', 'tech',
  'art', 'home', 'sports', 'nature', 'travel', 'food', 'events', 'symbols', 'roles', 'settings',
]
const CATEGORY_LABELS = {
  community: 'Comunidade', voice: 'Voz', work: 'Trabalho', leisure: 'Lazer',
  games: 'Jogos', music: 'Música', study: 'Estudos', tech: 'Tecnologia',
  art: 'Arte e criação', home: 'Casa e família', sports: 'Esportes',
  nature: 'Natureza', travel: 'Viagem', food: 'Comida',
  events: 'Eventos', symbols: 'Símbolos', roles: 'Funções',
  settings: 'Configurações',
}
export function categoryLabel(key) {
  return CATEGORY_LABELS[key] || key
}

// ---- Recents (localStorage) ---------------------------------------------
const RECENTS_KEY = 'voicecraft:spaceIconRecents'
const MAX_RECENT_ICONS = 12

function readRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT_ICONS) : []
  } catch {
    return []
  }
}
function writeRecents(arr) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(arr.slice(0, MAX_RECENT_ICONS)))
  } catch {}
}

function parseRecentItem(item) {
  if (typeof item === 'string' && item.includes('::')) {
    const [idOrName, style] = item.split('::')
    return normalizeSpaceIcon({
      id: idOrName,
      name: idOrName.replace(/-(light|fill|duotone)$/, ''),
      collection: 'ph',
      style,
    })
  }
  return normalizeSpaceIcon(item)
}

export function getRecentIcons() {
  return readRecents()
    .map(parseRecentItem)
    .filter(v => v && v.id)
}

export function pushRecentIcon(value) {
  const v = normalizeSpaceIcon(value)
  const key = `${v.name}::${v.style}`
  const next = [
    v,
    ...getRecentIcons().filter(x => `${x.name}::${x.style}` !== key),
  ].slice(0, MAX_RECENT_ICONS)
  writeRecents(next)
  return next
}

// ---- React component: <SpaceIcon> ---------------------------------------
// Single render entry point. Reads `value` (any shape), normalizes, and
// draws the icon at the requested size. Consistent visual across the app.
export function SpaceIcon({ value, size, className = '', style, title, ...rest }) {
  const ready = useSpaceIconsReady()
  const v = useMemo(() => normalizeSpaceIcon(value), [value])
  const isImg = v?.type === 'image' && v.src
  const config = ICON_STYLE_CONFIG[v?.style] || ICON_STYLE_CONFIG.outline
  const finalSize = size ?? config.size

  // Always call hooks before any early return (image vs phosphor).
  const iconStyle = useMemo(() => {
    const base = { color: 'currentColor', ...style }
    if (config.strokeWidth != null) {
      base.strokeWidth = config.strokeWidth
    }
    return base
  }, [config.strokeWidth, style])

  if (isImg) {
    return (
      <img
        src={v.src}
        alt={title || ''}
        title={title}
        className={`object-cover rounded-[inherit] ${className}`}
        style={{
          width: finalSize,
          height: finalSize,
          ...style,
        }}
        {...rest}
      />
    )
  }

  if (!ready) {
    return (
      <span
        className={className}
        style={{
          display: 'inline-block',
          width: finalSize,
          height: finalSize,
          ...style,
        }}
        aria-hidden
        title={title}
      />
    )
  }

  return (
    <Icon
      icon={`${v.collection}:${v.id}`}
      width={finalSize}
      height={finalSize}
      className={className}
      style={iconStyle}
      title={title}
      {...rest}
    />
  )
}

// ---- Hook: debounced search (for the picker search input) -------------
export function useDebouncedValue(value, delay = 140) {
  const [debounced, setDebounced] = useState(value)
  const timerRef = useRef(null)
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebounced(value), delay)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, delay])
  return debounced
}
