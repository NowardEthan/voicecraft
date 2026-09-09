const STORAGE_KEY = 'voicecraft:chatDensity'

export const CHAT_DENSITIES = {
  compacto: {
    key: 'compacto',
    label: 'Compacto',
    hint: 'Mensagens mais juntas',
    row: 'px-5 sm:px-8 py-[3px]',
    group: 'mt-5',
    listPy: 'py-4',
    dividerPy: 'py-3 px-5 sm:px-8',
  },
  confortavel: {
    key: 'confortavel',
    label: 'Confortável',
    hint: 'Equilíbrio de espaço',
    row: 'px-5 sm:px-8 py-1',
    group: 'mt-7',
    listPy: 'py-5',
    dividerPy: 'py-3.5 px-5 sm:px-8',
  },
  espacado: {
    key: 'espacado',
    label: 'Espaçado',
    hint: 'Mais respiro entre mensagens',
    row: 'px-5 sm:px-8 py-1.5',
    group: 'mt-10',
    listPy: 'py-6',
    dividerPy: 'py-4 px-5 sm:px-8',
  },
}

export const CHAT_DENSITY_ORDER = ['compacto', 'confortavel', 'espacado']
export const DEFAULT_CHAT_DENSITY = 'compacto'

export function resolveChatDensity(key) {
  return CHAT_DENSITIES[key] || CHAT_DENSITIES[DEFAULT_CHAT_DENSITY]
}

export function readChatDensity() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw && CHAT_DENSITIES[raw]) return raw
  } catch {}
  return DEFAULT_CHAT_DENSITY
}

export function writeChatDensity(key) {
  if (!CHAT_DENSITIES[key]) return
  try {
    window.localStorage.setItem(STORAGE_KEY, key)
  } catch {}
}
