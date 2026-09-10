/**
 * Room kinds — only two behaviors matter today:
 *   - voice → LiveKit call
 *   - conversation (text) → chat / files
 *
 * Older purposes (study / games / music) still resolve for existing rooms
 * so icons don't break, but they are no longer offered when creating.
 */
import {
  MessageCircle,
  Mic,
  BookOpen,
  Gamepad2,
  Music,
} from 'lucide-react'

const soft = (hex) => {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/)
  if (!m) return 'rgba(255, 63, 108, .14)'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},.14)`
}

/** Types shown in create / edit pickers. */
export const CREATE_PURPOSES = [
  {
    key: 'conversation',
    label: 'Texto',
    icon: MessageCircle,
    color: '#7c8aa4',
    soft: soft('#7c8aa4'),
    description: 'Mensagens e arquivos, sem call.',
    contextDescription: 'Canal de texto para conversar, compartilhar links e arquivos.',
    actionLabel: 'Abrir',
    emptyHint: 'Crie um canal de texto pra trocar mensagens.',
  },
  {
    key: 'voice',
    label: 'Voz',
    icon: Mic,
    color: '#ff3f6c',
    soft: soft('#ff3f6c'),
    description: 'Call ao vivo com a galera.',
    contextDescription: 'Sala de voz em tempo real — microfone, tela e presença juntos.',
    actionLabel: 'Entrar',
    emptyHint: 'Crie uma sala de voz pra conversar ao vivo.',
  },
]

/** Legacy purposes — kept for rooms already saved in Firestore. */
const LEGACY_PURPOSES = [
  {
    key: 'study',
    label: 'Estudo',
    icon: BookOpen,
    color: '#32c48d',
    soft: soft('#32c48d'),
    description: 'Canal de texto (legado).',
    contextDescription: 'Antes era um “tipo” de texto — agora funciona como canal de texto.',
    actionLabel: 'Abrir',
    emptyHint: '',
  },
  {
    key: 'games',
    label: 'Jogos',
    icon: Gamepad2,
    color: '#f0445e',
    soft: soft('#f0445e'),
    description: 'Canal de texto (legado).',
    contextDescription: 'Antes era um “tipo” de texto — agora funciona como canal de texto.',
    actionLabel: 'Abrir',
    emptyHint: '',
  },
  {
    key: 'music',
    label: 'Música',
    icon: Music,
    color: '#a78bfa',
    soft: soft('#a78bfa'),
    description: 'Canal de texto (legado).',
    contextDescription: 'Antes era um “tipo” de texto — agora funciona como canal de texto.',
    actionLabel: 'Abrir',
    emptyHint: '',
  },
]

/** @deprecated Prefer CREATE_PURPOSES for pickers. Full list for lookups. */
export const PURPOSES = [...CREATE_PURPOSES, ...LEGACY_PURPOSES]

export const PURPOSE_BY_KEY = Object.fromEntries(PURPOSES.map((p) => [p.key, p]))

export const DEFAULT_ROOM_NAMES = {
  conversation: 'geral',
  voice: 'sala de voz',
  study: 'estudos',
  games: 'lobby',
  music: 'música',
}

/** Map any purpose to the two real kinds used when saving. */
export function normalizePurposeKey(key) {
  return key === 'voice' ? 'voice' : 'conversation'
}

/**
 * Resolve a room to its UI purpose. Legacy study/games/music keep their
 * icons; unknown text rooms fall back to conversation.
 */
export function purposeOf(room) {
  if (!room) return CREATE_PURPOSES[0]
  const explicit = room.purpose && PURPOSE_BY_KEY[room.purpose]
  if (explicit) return explicit
  if (room.type === 'voice') return PURPOSE_BY_KEY.voice
  return PURPOSE_BY_KEY.conversation
}

/**
 * Group rooms for the sidebar. Create-kinds first; legacy sections only
 * appear when the Space still has rooms of that purpose.
 */
export function groupByPurpose(rooms = []) {
  const map = new Map(PURPOSES.map((p) => [p.key, []]))
  for (const room of rooms) {
    const p = purposeOf(room)
    if (!map.has(p.key)) map.set(p.key, [])
    map.get(p.key).push(room)
  }
  return PURPOSES
    .map((p) => ({ purpose: p, rooms: map.get(p.key) || [] }))
    .filter((g) => g.rooms.length > 0)
}
