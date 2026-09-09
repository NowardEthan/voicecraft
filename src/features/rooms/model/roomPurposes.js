/**
 * Room purposes — what an activity inside a Space is for.
 *
 * The backend persists `room.type === 'voice' | 'text'` for protocol reasons
 * (it drives WebRTC vs text-only behavior). The UI, however, speaks in
 * *activities* — the user thinks "I want to study", not "I want a text
 * channel". This module maps between the two worlds.
 *
 * Rule of thumb when creating a room:
 *   - If the user picks `voice` → server stores `type='voice'`, will run WebRTC
 *   - For any other purpose → server stores `type='text'` (the protocol binary
 *     we need to preserve), and we keep `purpose=<key>` in the local object
 *     so the UI can render the right icon/copy. The server doesn't care about
 *     `purpose` and will simply round-trip it as an extra field.
 *
 * If the backend later grows purpose-aware semantics, this is the single
 * place to extend.
 *
 * Colors are spec-aligned (DESIGN_SYSTEM §2.1): activity tints lean into
 * the Space's accent family so each sala reads as "the same Space, just a
 * different activity" rather than a riot of clashing hues.
 */
import {
  MessageCircle,
  Mic,
  BookOpen,
  Gamepad2,
  Music,
} from 'lucide-react'

// Single helper to build a "soft" 14% rgba from a hex.
const soft = (hex) => {
  const m = hex.match(/^#([0-9a-fA-F]{6})$/)
  if (!m) return 'rgba(255, 63, 108, .14)'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},.14)`
}

export const PURPOSES = [
  {
    key: 'conversation',
    label: 'Conversa',
    icon: MessageCircle,
    color: '#7c8aa4', // cool grey — text-like, never fights the accent
    soft: soft('#7c8aa4'),
    // Short label for selector / cards
    description: 'Pra trocar ideia sem pressa, em texto.',
    // Long description for the context card under the name field
    contextDescription: 'Um espaço leve para trocar ideias, mensagens e arquivos.',
    actionLabel: 'Abrir conversa',
    emptyHint: 'Crie uma conversa pra trocar mensagens persistentes.',
  },
  {
    key: 'voice',
    label: 'Voz',
    icon: Mic,
    color: '#ff3f6c', // default spec accent
    soft: soft('#ff3f6c'),
    description: 'Sala de voz ao vivo, baixa latência.',
    contextDescription: 'Um ambiente ao vivo para conversar e estar junto.',
    actionLabel: 'Entrar',
    emptyHint: 'Crie uma sala de voz pra conversar em tempo real.',
  },
  {
    key: 'study',
    label: 'Estudo',
    icon: BookOpen,
    color: '#32c48d', // positive green from spec
    soft: soft('#32c48d'),
    description: 'Foco e referência compartilhada.',
    contextDescription: 'Um espaço para foco, referências e aprendizado compartilhado.',
    actionLabel: 'Participar',
    emptyHint: 'Um canto quieto pra revisar matéria junto.',
  },
  {
    key: 'games',
    label: 'Jogos',
    icon: Gamepad2,
    color: '#f0445e', // danger red — energy, intensity
    soft: soft('#f0445e'),
    description: 'Co-op, party chat, galera nos mics.',
    contextDescription: 'Um ponto de encontro para jogar e conversar em grupo.',
    actionLabel: 'Participar',
    emptyHint: 'Sala de voz pra combinar a próxima partida.',
  },
  {
    key: 'music',
    label: 'Música',
    icon: Music,
    color: '#a78bfa', // calm violet — softer, atmospheric
    soft: soft('#a78bfa'),
    description: 'Escutar junto, cantar junto.',
    contextDescription: 'Um espaço para ouvir, compartilhar e descobrir músicas.',
    actionLabel: 'Participar',
    emptyHint: 'Sala de voz pra colocar o som no mudo do trabalho.',
  },
]

export const PURPOSE_BY_KEY = Object.fromEntries(PURPOSES.map(p => [p.key, p]))

/** Suggested name when the user hasn't typed one yet. */
export const DEFAULT_ROOM_NAMES = {
  conversation: 'geral',
  voice: 'sala de voz',
  study: 'estudos',
  games: 'lobby',
  music: 'música',
}

/**
 * Resolve a room to its UI purpose. Falls back to "conversation" for text
 * rooms with no explicit purpose, so old data still renders cleanly.
 */
export function purposeOf(room) {
  if (!room) return PURPOSES[0]
  const explicit = room.purpose && PURPOSE_BY_KEY[room.purpose]
  if (explicit) return explicit
  if (room.type === 'voice') return PURPOSE_BY_KEY.voice
  return PURPOSE_BY_KEY.conversation
}

/**
 * Group rooms by purpose. Order of sections is the canonical PURPOSE order,
 * which doubles as a typology: voice before conversation because voice is
 * the headline feature, then study/games/music as "atmosphere" activities.
 */
export function groupByPurpose(rooms = []) {
  const map = new Map(PURPOSES.map(p => [p.key, []]))
  for (const room of rooms) {
    const p = purposeOf(room)
    if (!map.has(p.key)) map.set(p.key, [])
    map.get(p.key).push(room)
  }
  return PURPOSES
    .map(p => ({ purpose: p, rooms: map.get(p.key) || [] }))
    .filter(g => g.rooms.length > 0)
}
