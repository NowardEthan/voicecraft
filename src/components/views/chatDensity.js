/**
 * Chat density — spacing / typography presets for the message feed.
 * Persisted in localStorage; applied via tokens on MessageList + MessageBubble.
 */
const STORAGE_KEY = 'voicecraft:chatDensity'

const ALIASES = {
  compact: 'compacto',
  compacta: 'compacto',
  comfy: 'confortavel',
  comfortable: 'confortavel',
  confortavel: 'confortavel',
  spacious: 'espacado',
  espacado: 'espacado',
}

export const CHAT_DENSITIES = {
  compacto: {
    key: 'compacto',
    label: 'Compacto',
    hint: 'Mais mensagens na tela, pouco espaço',
    shortLabel: 'Compacta',
    row: 'px-4 sm:px-7 py-[2px]',
    group: 'mt-2.5 first:mt-0',
    listPy: 'py-3',
    dividerPy: 'py-2 px-4 sm:px-7',
    msgHeaderMt: 'mt-1',
    msgFollowMt: 'mt-0',
    bubbleText: 'text-[13px] leading-[1.35]',
    headerText: 'text-[12.5px]',
    timeText: 'text-[10px]',
    avatar: 30,
    groupBreakMs: 2 * 60 * 1000,
    vars: {
      '--vc-chat-density-gap': '10px',
      '--vc-chat-density-pad': '2px',
      '--vc-chat-density-text': '13px',
      '--vc-chat-density-lh': '1.35',
      '--vc-chat-density-avatar': '30px',
    },
  },
  confortavel: {
    key: 'confortavel',
    label: 'Confortável',
    hint: 'Equilíbrio entre densidade e leitura',
    shortLabel: 'Confortável',
    row: 'px-5 sm:px-8 py-1',
    group: 'mt-5 first:mt-0',
    listPy: 'py-4',
    dividerPy: 'py-3 px-5 sm:px-8',
    msgHeaderMt: 'mt-2',
    msgFollowMt: 'mt-[2px]',
    bubbleText: 'text-[13.5px] leading-[1.45]',
    headerText: 'text-[13px]',
    timeText: 'text-[10.5px]',
    avatar: 34,
    groupBreakMs: 5 * 60 * 1000,
    vars: {
      '--vc-chat-density-gap': '20px',
      '--vc-chat-density-pad': '4px',
      '--vc-chat-density-text': '13.5px',
      '--vc-chat-density-lh': '1.45',
      '--vc-chat-density-avatar': '34px',
    },
  },
  espacado: {
    key: 'espacado',
    label: 'Espaçado',
    hint: 'Mais respiro entre mensagens e grupos',
    shortLabel: 'Espaçada',
    row: 'px-5 sm:px-9 py-2',
    group: 'mt-8 first:mt-0',
    listPy: 'py-6',
    dividerPy: 'py-4 px-5 sm:px-9',
    msgHeaderMt: 'mt-3',
    msgFollowMt: 'mt-1',
    bubbleText: 'text-[14.5px] leading-[1.55]',
    headerText: 'text-[13.5px]',
    timeText: 'text-[11px]',
    avatar: 38,
    groupBreakMs: 8 * 60 * 1000,
    vars: {
      '--vc-chat-density-gap': '32px',
      '--vc-chat-density-pad': '8px',
      '--vc-chat-density-text': '14.5px',
      '--vc-chat-density-lh': '1.55',
      '--vc-chat-density-avatar': '38px',
    },
  },
}

export const CHAT_DENSITY_ORDER = ['compacto', 'confortavel', 'espacado']
export const DEFAULT_CHAT_DENSITY = 'confortavel'

export function normalizeChatDensity(key) {
  if (!key) return DEFAULT_CHAT_DENSITY
  const raw = String(key).trim().toLowerCase()
  const mapped = ALIASES[raw] || raw
  return CHAT_DENSITIES[mapped] ? mapped : DEFAULT_CHAT_DENSITY
}

export function resolveChatDensity(key) {
  return CHAT_DENSITIES[normalizeChatDensity(key)]
}

export function cycleChatDensity(key) {
  const current = normalizeChatDensity(key)
  const i = CHAT_DENSITY_ORDER.indexOf(current)
  return CHAT_DENSITY_ORDER[(i + 1) % CHAT_DENSITY_ORDER.length]
}

export function readChatDensity() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeChatDensity(raw)
  } catch { /* ignore */ }
  return DEFAULT_CHAT_DENSITY
}

export function writeChatDensity(key) {
  const next = normalizeChatDensity(key)
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch { /* ignore */ }
  return next
}
