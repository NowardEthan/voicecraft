/** Compact, token-driven emoji picker shared by chat surfaces. */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Smile, Hand, Heart, Users, PawPrint, Pizza, MapPin, Lightbulb, Hash, Search as SearchIcon,
} from 'lucide-react'

export const EMOJI_CATEGORIES = [
  { key: 'smileys', label: 'Rostos', icon: Smile, emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😗','🥲','😋','😜','🤪','😎','🤩','🥳','🤔','🤨','😐','😑','😶','🙄','😏','😴','🤤','😷','🤒','🤯','🤠','😈','👿','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀'] },
  { key: 'gestures', label: 'Gestos', icon: Hand, emojis: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👏','🙌','🤝','🙏','💪','🫶','👋','🤚','✋','🖐️','👆','👇','👈','👉','✊','👊','🤛','🤜','✍️','💅','🤳','🫵'] },
  { key: 'hearts', label: 'Corações', icon: Heart, emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','✨'] },
  { key: 'people', label: 'Pessoas', icon: Users, emojis: ['👶','🧒','👦','👧','🧑','👨','👩','🧓','👴','👵','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','👮','🕵️','💂','👷','🤴','👸','👳','👲','🧕','🤵','👰','🤰'] },
  { key: 'animals', label: 'Animais', icon: PawPrint, emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦄','🐝','🦋','🐌','🐞','🐢','🐍','🦖'] },
  { key: 'food', label: 'Comida', icon: Pizza, emojis: ['🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🌽','🥕','🍕','🍔','🍟','🌭','🥪','🌮','🌯','🥗','🍣','🍰'] },
  { key: 'places', label: 'Lugares', icon: MapPin, emojis: ['🌍','🌎','🌏','🌐','🗺️','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏟️','🏛️','🏗️','🏘️','🏚️','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬'] },
  { key: 'objects', label: 'Objetos', icon: Lightbulb, emojis: ['🎉','🎊','🎈','🎁','🏆','🥇','🎯','🎮','🎲','🎸','🎵','📚','💻','📱','⌚','📷','💡','🔥','⭐','🌟','⚡','☀️','🌙','🌈','☕','🍕','🍔','🍰','🍺','🚀'] },
  { key: 'symbols', label: 'Símbolos', icon: Hash, emojis: ['✅','❌','❗','❓','💯','🔔','📌','📎','🔗','💬','💭','👀','🧠','➡️','⬅️','⬆️','⬇️','♻️','⚠️','🆗'] },
]

const CATEGORY_TERMS = {
  smileys: 'rosto rostos sorriso sorrindo feliz alegria risada rir triste choro emoção humor',
  gestures: 'gesto gestos mão mãos positivo negativo sim não aplauso obrigado força apontar',
  hearts: 'coração corações amor carinho paixão brilho',
  people: 'pessoa pessoas família bebê criança homem mulher idoso trabalho',
  animals: 'animal animais bicho cachorro gato pássaro natureza',
  food: 'comida alimento fruta lanche bebida doce pizza bolo café',
  places: 'lugar lugares viagem mundo mapa casa prédio praia montanha',
  objects: 'objeto objetos festa presente troféu jogo música tecnologia fogo estrela foguete',
  symbols: 'símbolo símbolos confirmar cancelar alerta pergunta mensagem olho cérebro seta',
}

const EMOJI_TERMS = {
  '👍': 'curtir gostei positivo joinha', '👎': 'não gostei negativo', '😂': 'chorando de rir engraçado',
  '🤣': 'rolando de rir engraçado', '😊': 'feliz sorriso', '😍': 'apaixonado amor', '🥰': 'carinho amor',
  '🤔': 'pensando dúvida', '😎': 'legal óculos', '🥳': 'festa parabéns', '😭': 'chorando triste',
  '❤️': 'coração vermelho amor', '💔': 'coração partido', '✨': 'brilho mágico', '🔥': 'fogo quente incrível',
  '⭐': 'estrela favorito', '🌟': 'estrela brilhante', '👏': 'palmas aplauso', '🙏': 'obrigado oração por favor',
  '🙌': 'comemorar mãos', '👋': 'tchau olá aceno', '💪': 'força músculo', '🫶': 'coração com mãos carinho',
  '🎉': 'festa comemoração confete', '🎁': 'presente', '🏆': 'troféu vitória', '✅': 'confirmar certo concluído',
  '❌': 'cancelar errado', '⚠️': 'alerta atenção', '👀': 'olhos vendo', '💯': 'cem perfeito',
  '🚀': 'foguete lançar rápido', '💡': 'ideia lâmpada', '☕': 'café bebida', '🍕': 'pizza comida',
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function useContainWheel(ref) {
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const stop = (event) => event.stopPropagation()
    element.addEventListener('wheel', stop, { passive: true })
    return () => element.removeEventListener('wheel', stop)
  }, [ref])
}

export default function EmojiPicker({ onPick, className = '', compact = false, initialFocus = false }) {
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0].key)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)
  const gridRef = useRef(null)
  const searchRef = useRef(null)
  const active = EMOJI_CATEGORIES.find((item) => item.key === category) || EMOJI_CATEGORIES[0]

  const results = useMemo(() => {
    const term = normalize(query.trim())
    if (!term) return active.emojis.map((emoji) => ({ emoji, category: active }))
    const unique = new Map()
    EMOJI_CATEGORIES.forEach((item) => item.emojis.forEach((emoji) => {
      const searchable = normalize(`${emoji} ${item.label} ${CATEGORY_TERMS[item.key]} ${EMOJI_TERMS[emoji] || ''}`)
      if (searchable.includes(term) && !unique.has(emoji)) unique.set(emoji, { emoji, category: item })
    }))
    return [...unique.values()]
  }, [active, query])

  useContainWheel(rootRef)
  useContainWheel(gridRef)

  useEffect(() => {
    if (!initialFocus) return undefined
    const frame = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [initialFocus])

  const selectCategory = (key) => {
    setCategory(key)
    setQuery('')
    requestAnimationFrame(() => gridRef.current?.focus({ preventScroll: true }))
  }

  return (
    <div ref={rootRef} className={`vc-emoji-picker ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <div className="vc-emoji-picker__search">
        <SearchIcon size={14} aria-hidden />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome ou emoji"
          aria-label="Buscar emoji por nome"
        />
      </div>

      <div className="vc-emoji-picker__categories" role="group" aria-label="Categorias de emoji">
        {EMOJI_CATEGORIES.map((item) => {
          const selected = !query && item.key === category
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={selected}
              aria-label={item.label}
              title={item.label}
              className={selected ? 'is-active' : ''}
              onClick={() => selectCategory(item.key)}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden />
            </button>
          )
        })}
      </div>

      <div className="vc-emoji-picker__heading">
        <strong>{query ? 'Resultados' : active.label}</strong>
        <span aria-live="polite">{results.length}</span>
      </div>

      <div ref={gridRef} className="vc-emoji-picker__grid" tabIndex={-1} aria-label={query ? 'Resultados da busca' : `Emojis: ${active.label}`}>
        {results.length ? results.map(({ emoji, category: item }) => (
          <button
            key={emoji}
            type="button"
            className="vc-emoji-picker__emoji"
            onClick={() => onPick?.(emoji)}
            aria-label={`${emoji}, ${item.label}`}
            title={`${emoji} · ${item.label}`}
          >
            {emoji}
          </button>
        )) : (
          <div className="vc-emoji-picker__empty" role="status">
            <SearchIcon size={20} aria-hidden />
            <span>Nenhum emoji encontrado</span>
          </div>
        )}
      </div>
    </div>
  )
}
