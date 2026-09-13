/**
 * Frequência de reações — local-only, persistido em localStorage.
 *
 * Cada usuário tem sua própria lista dos emojis que mais usa (top 3)
 * pra popular a "quick bar" da action bar. Quando o user reage com
 * um emoji novo, ele sobe na lista; emojis não usados caem.
 *
 * Não compartilhamos essa info no servidor porque é puramente UX:
 * cada user tem suas próprias preferências.
 */

const KEY = 'voicecraft:frequentReactions:v1'
const DEFAULT_QUICK = ['👍', '❤️', '🔥']

/** Lê o Map completo (emoji → count) do localStorage. */
function readAll() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Map(DEFAULT_QUICK.map((e) => [e, 1]))
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return new Map(DEFAULT_QUICK.map((e) => [e, 1]))
    const map = new Map()
    Object.keys(parsed).forEach((emoji) => {
      const n = Number(parsed[emoji])
      if (Number.isFinite(n) && n > 0) map.set(emoji, n)
    })
    if (map.size === 0) return new Map(DEFAULT_QUICK.map((e) => [e, 1]))
    return map
  } catch {
    return new Map(DEFAULT_QUICK.map((e) => [e, 1]))
  }
}

/** Persiste o Map completo. */
function persistAll(map) {
  try {
    const obj = Object.fromEntries(map)
    localStorage.setItem(KEY, JSON.stringify(obj))
  } catch { /* ignore */ }
}

/** Retorna os 3 emojis mais usados (ordenados por frequência desc).
 *  Se nunca usou nenhum, retorna os defaults.                       */
export function getFrequentReactions() {
  const all = readAll()
  const sorted = Array.from(all.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([e]) => e)
  return sorted.slice(0, 3)
}

/** Incrementa a contagem de um emoji. Reordena e persiste. */
export function bumpReaction(emoji) {
  if (!emoji) return
  const all = readAll()
  all.set(emoji, (all.get(emoji) || 0) + 1)
  persistAll(all)
}

/** Decrementa a contagem (ao descurtir). Não remove se chegar a 0. */
export function unbumpReaction(emoji) {
  if (!emoji) return
  const all = readAll()
  const cur = all.get(emoji) || 0
  if (cur > 1) all.set(emoji, cur - 1)
  else all.set(emoji, 1)
  persistAll(all)
}
