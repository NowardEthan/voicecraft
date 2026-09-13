/**
 * Markdown renderer for chat message bodies.
 * Tiny, dependency-free parser handling:
 *   - bold (**x**)
 *   - italic (*x* or _x_)
 *   - strikethrough (~~x~~)
 *   - inline code (`x`)
 *   - fenced code block (```lang\nx\n```)
 *   - blockquote (> x) with left border
 *   - spoiler (||x||) clickable
 *   - mention (@handle) as accent pill
 *   - room mention (#nome-sala) as a clickable pill that navigates to
 *     the named Sala in the current Space.
 *   - autolink [text](url)
 *   - jumbomoji: messages composed of 1-3 consecutive emoji graphemes
 *     (no shortcodes, no surrounding text) render at ~3x base size.
 *
 * Room mentions: a # token is a clickable pill ONLY when the trailing
 * slug (letters/digits/dashes/underscores, ≤ 32 chars) resolves to one
 * of `allRooms` passed via the `onRoomMention`/`resolveRoom` props.
 * Otherwise the raw `#slug` text is rendered unchanged so unfamiliar
 * hashes (e.g. inside long URLs or external text) never get hijacked.
 */
import { useState, Fragment } from 'react'
import { Hash } from 'lucide-react'

const RE_EXT_PICTO = /\p{Extended_Pictographic}/u
const RE_EMOJI_GRAPHEME = new RegExp(
  '(?:\\p{Extended_Pictographic}(?:\\u{FE0F})?\\u{200D}\\p{Extended_Pictographic}(?:\\u{FE0F})?)*' +
  '\\p{Extended_Pictographic}(?:\\u{FE0F})?',
  'u'
)

function countEmojiGraphemes(str) {
  const re = new RegExp('\\p{Extended_Pictographic}(?:\\u{FE0F})?(?:\\u{200D}\\p{Extended_Pictographic}(?:\\u{FE0F})?)*', 'gu')
  return (str.match(re) || []).length
}

function isOnlyEmojis(str) {
  // Strip emojis + ZWJ + variation selectors + combining marks.
  const stripped = String(str || '').replace(
    new RegExp('\\p{Extended_Pictographic}(?:\\u{FE0F})?(?:\\u{200D}\\p{Extended_Pictographic}(?:\\u{FE0F})?)*', 'gu'),
    ''
  ).replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+/g, '')
  return stripped.length === 0
}

export function isJumbomoji(text) {
  if (!text || typeof text !== 'string') return false
  if (/\s/.test(text)) return false
  if (!isOnlyEmojis(text)) return false
  const n = countEmojiGraphemes(text)
  return n >= 1 && n <= 3
}

/* ---------- Spoiler ---------- */
function Spoiler({ children }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); setOpen(true) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          setOpen(true)
        }
      }}
      className={
        'vc-md-spoiler inline-block rounded px-1 cursor-pointer transition-colors ' +
        (open
          ? 'bg-surface2 text-strong'
          : 'bg-strong/85 text-strong/85 hover:bg-strong/70 select-none')
      }
    >
      {children}
    </span>
  )
}

/* ---------- Mention ---------- */
function Mention({ handle }) {
  return (
    <button
      type="button"
      data-handle={handle}
      onClick={(e) => {
        e.stopPropagation()
        if (typeof window !== 'undefined' && window.__vcOpenProfile) {
          window.__vcOpenProfile(handle)
        }
      }}
      className="vc-mention inline-flex items-center px-1.5 py-[1px] rounded-pill bg-accent/[0.18] text-accent text-[13px] font-medium hover:bg-accent/[0.28] transition-colors align-baseline"
    >
      @{handle}
    </button>
  )
}

/* ---------- Room mention (#slug) ----------
 * Renders a clickable pill that navigates to the named Sala in the
 * current Space. The pill is only emitted when the slug matches a real
 * room — otherwise the raw "#slug" text is rendered (see resolveRoom
 * contract below).                                            */
function RoomMention({ slug, room }) {
  const label = room?.name || `#${slug}`
  const onClick = (e) => {
    e.stopPropagation()
    if (!room) return
    if (typeof window !== 'undefined' && window.__vcSelectRoom) {
      window.__vcSelectRoom(room)
    }
  }
  return (
    <button
      type="button"
      data-room-id={room?.id || ''}
      data-room-mention={slug}
      onClick={onClick}
      title={room ? `Ir para ${room.name}` : slug}
      className="vc-room-mention inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-pill bg-[var(--space-accent-soft)] text-[var(--space-accent)] text-[13px] font-semibold hover:brightness-110 hover:scale-[1.05] transition-[transform,filter] duration-150 align-baseline"
    >
      <Hash size={11} strokeWidth={2.4} className="opacity-80 shrink-0" aria-hidden />
      {label.startsWith('#') ? label : `#${label}`}
    </button>
  )
}

/* Slug format: letters, digits, dashes, underscores, 1-32 chars. */
export const ROOM_MENTION_RE = /#([a-zA-Z0-9_\-]{1,32})/g

/** Build a fast room-by-slug lookup from any plausible shape
 *  ({id, name, slug?, ...} | [{id, name}]) used by the renderer. The
 *  result is a Map lowercase-slug -> room entry. First match wins so
 *  duplicate slugs don't surprise anyone. */
export function buildRoomMentionIndex(allRooms) {
  const m = new Map()
  if (!Array.isArray(allRooms)) return m
  for (const r of allRooms) {
    if (!r) continue
    const id = String(r.id || '').trim()
    if (!id) continue
    const name = String(r.name || '').trim()
    if (!name) continue
    const slugBase = name.toLowerCase().replace(/[\s_]+/g, '-')
    const keys = new Set()
    if (slugBase) keys.add(slugBase)
    if (id.toLowerCase()) keys.add(id.toLowerCase())
    for (const k of keys) {
      if (!k) continue
      if (!m.has(k)) m.set(k, { id, name, room: r })
    }
  }
  return m
}

/* ---------- Inline parser ----------
 * Tokenizes a single line (no newlines) and produces React elements.
 * Order of checks matters: code first (so its content is verbatim),
 * spoiler, then link, then mention, then bold/italic/strike.
 *
 * `resolveRoom(slug)` is optional. When provided and it returns a room
 * record, a `#slug` becomes a clickable pill. Otherwise the raw text
 * passes through untouched.                                        */
function parseInline(text, keyPrefix, resolveRoom) {
  const out = []
  let i = 0
  let k = 0
  const push = (node) => out.push(<Fragment key={`${keyPrefix}-${k++}`}>{node}</Fragment>)

  while (i < text.length) {
    // Inline code `x` — verbatim, no nested formatting.
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1)
      if (end > i) {
        push(<code className="vc-md-code-inline">{text.slice(i + 1, end)}</code>)
        i = end + 1
        continue
      }
    }

    // Spoiler ||x||
    if (text[i] === '|' && text[i + 1] === '|') {
      const end = text.indexOf('||', i + 2)
      if (end > i + 1) {
        const inner = text.slice(i + 2, end)
        push(<Spoiler>{parseInline(inner, `${keyPrefix}-sp`, resolveRoom)}</Spoiler>)
        i = end + 2
        continue
      }
    }

    // Link [text](url)
    if (text[i] === '[') {
      const closeLabel = text.indexOf(']', i + 1)
      if (closeLabel > i && text[closeLabel + 1] === '(') {
        const closeUrl = text.indexOf(')', closeLabel + 2)
        if (closeUrl > closeLabel) {
          const label = text.slice(i + 1, closeLabel)
          const url = text.slice(closeLabel + 2, closeUrl)
          push(
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="vc-md-link text-accent underline decoration-accent/40 hover:decoration-accent"
              title={url}
              onClick={(e) => e.stopPropagation()}
            >
              {parseInline(label, `${keyPrefix}-ln`, resolveRoom)}
            </a>,
          )
          i = closeUrl + 1
          continue
        }
      }
    }

    // Mention @handle — word characters / digits, max 24 chars.
    if (text[i] === '@') {
      const m = /^@([a-zA-Z0-9_.\-]{1,24})/.exec(text.slice(i))
      if (m) {
        push(<Mention handle={m[1]} />)
        i += m[0].length
        continue
      }
    }

    // Room mention #slug — only when preceded by start/whitespace so
    // things like "abc#def" never trip it. We DON'T use a leading
    // anchor in the regex because parseInline already walks char by
    // char and a `#` mid-word isn't a mention candidate.
    if (text[i] === '#') {
      const m = /^#([a-zA-Z0-9_\-]{1,32})/.exec(text.slice(i))
      if (m) {
        // Reject URL fragments: a `#` that follows `://` (e.g. inside
        // "https://example.com/path#frag") is a hyperlink fragment, not
        // a room mention. Look back 3+ chars for the `://` marker.
        const isFragment = i >= 3 && text.slice(i - 3, i) === '://'
        if (!isFragment && resolveRoom) {
          const slug = m[1]
          const room = resolveRoom(slug)
          if (room) {
            push(<RoomMention slug={slug} room={room} />)
            i += m[0].length
            continue
          }
        }
      }
      // No resolver / unknown slug — fall through to the plain-char
      // path which handles `#` by emitting one character and advancing.
    }

    // Strikethrough ~~x~~
    if (text[i] === '~' && text[i + 1] === '~') {
      const end = text.indexOf('~~', i + 2)
      if (end > i + 1) {
        push(<s className="vc-md-s">{parseInline(text.slice(i + 2, end), `${keyPrefix}-sk`, resolveRoom)}</s>)
        i = end + 2
        continue
      }
    }

    // Bold **x**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2)
      if (end > i + 1) {
        push(<strong className="vc-md-strong font-bold">{parseInline(text.slice(i + 2, end), `${keyPrefix}-b`, resolveRoom)}</strong>)
        i = end + 2
        continue
      }
    }

    // Italic *x* or _x_ — single asterisk / underscore, not adjacent to alnum on inner side.
    if (text[i] === '*' || text[i] === '_') {
      const ch = text[i]
      const end = text.indexOf(ch, i + 1)
      if (end > i + 1) {
        // Avoid eating a stray ** that was unmatched — would already be handled above.
        if (!(ch === '*' && text[end + 1] === '*')) {
          const inner = text.slice(i + 1, end)
          push(<em className="vc-md-em italic">{parseInline(inner, `${keyPrefix}-i`, resolveRoom)}</em>)
          i = end + 1
          continue
        }
      }
    }

    // Plain char — accumulate up to the next special char for efficiency.
    let j = i + 1
    while (j < text.length && !'|`[*~_@#'.includes(text[j])) j++
    push(text.slice(i, j))
    i = j
  }
  return out
}

/* ---------- Block-level renderer ---------- */

/* Very small line-by-line syntax highlighter. We tokenize line text into
 * spans (string / comment / keyword / number / plain) so the fenced
 * code block in chat shows colored syntax without a real parser. It is
 * intentionally cheap — the goal is "feels alive", not compile-grade. */
const HL_KEYWORDS = {
  js:   /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|of|in|typeof|instanceof|null|undefined|true|false|this|super|static|yield)\b/g,
  jsx:  /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|of|in|typeof|instanceof|null|undefined|true|false|this|super|static|yield|props|state)\b/g,
  ts:   /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|of|in|typeof|instanceof|null|undefined|true|false|this|super|static|yield|type|interface|implements|namespace|enum|as|public|private|protected|readonly|number|string|boolean|any|void|never)\b/g,
  py:   /\b(def|return|if|elif|else|for|while|import|from|as|class|try|except|finally|raise|with|yield|lambda|pass|break|continue|None|True|False|self|async|await|in|not|and|or|is)\b/g,
  css:  /\b(import|charset|keyframes|media|from|to|nth-child|hover|focus|active)\b/g,
  html: /\b(div|span|input|button|form|label|section|article|nav|header|footer|main|aside|ul|ol|li|img|a|p|h[1-6]|script|style|link|meta|head|body|html|class|id|src|href|rel|type)\b/g,
}
const HL_STRING_RE = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/
const HL_NUMBER_RE = /\b\d+(?:\.\d+)?\b/
const HL_COMMENT_RE = /(\/\/[^\n]*|#[^\n]*|<!--[\s\S]*?-->)/

function highlightLine(raw, lang) {
  const langKey = (lang || '').toLowerCase()
  const keywordsRe = HL_KEYWORDS[langKey]
  const out = []
  let rest = raw
  let guard = 0
  while (rest.length > 0 && guard++ < 32) {
    const candidates = []
    if (keywordsRe) {
      const m = keywordsRe.exec(rest)
      if (m && m.index === 0) {
        out.push(<span className="vc-hl-kw" key={out.length}>{m[0]}</span>)
        rest = rest.slice(m[0].length)
        keywordsRe.lastIndex = 0
        continue
      }
      keywordsRe.lastIndex = 0
    }
    const sMatch = HL_STRING_RE.exec(rest)
    const nMatch = HL_NUMBER_RE.exec(rest)
    const cMatch = HL_COMMENT_RE.exec(rest)
    if (sMatch) candidates.push({ idx: sMatch.index, len: sMatch[0].length, kind: 'str', val: sMatch[0] })
    if (nMatch) candidates.push({ idx: nMatch.index, len: nMatch[0].length, kind: 'num', val: nMatch[0] })
    if (cMatch) candidates.push({ idx: cMatch.index, len: cMatch[0].length, kind: 'cmt', val: cMatch[0] })
    candidates.sort((a, b) => a.idx - b.idx)
    const next = candidates[0]
    if (next && next.idx === 0) {
      const cls = next.kind === 'str' ? 'vc-hl-str'
        : next.kind === 'num' ? 'vc-hl-num'
        : 'vc-hl-cmt'
      out.push(<span className={cls} key={out.length}>{next.val}</span>)
      rest = rest.slice(next.len)
    } else {
      const cut = next ? next.idx : rest.length
      out.push(<span key={out.length}>{rest.slice(0, cut) || (next ? '' : rest)}</span>)
      rest = rest.slice(cut || rest.length)
      // Guard against infinite loops if a token didn't advance.
      if (cut === 0) {
        out.push(<span key={out.length}>{rest.charAt(0)}</span>)
        rest = rest.slice(1)
      }
    }
  }
  if (rest.length > 0) out.push(<span key={out.length}>{rest}</span>)
  return out
}

function renderBlocks(text, resolveRoom) {
  const lines = String(text || '').split('\n')
  const blocks = []
  let i = 0
  let k = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block (```lang\n...\n```)
    const fence = line.match(/^```([a-zA-Z0-9_+-]*)\s*$/)
    if (fence) {
      const buf = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      // skip closing fence
      if (i < lines.length) i++
      const lang = (fence[1] || '').toLowerCase()
      blocks.push(
        <pre key={k++} data-lang={fence[1] || ''} className="vc-md-code-block">
          <code>
            {buf.map((ln, idx) => (
              <span key={idx} className="vc-md-code-line">
                {lang ? highlightLine(ln, lang) : ln}
                {idx < buf.length - 1 ? '\n' : ''}
              </span>
            ))}
          </code>
        </pre>,
      )
      continue
    }

    // Blockquote — accumulate consecutive '>' lines.
    if (/^>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote key={k++} className="vc-md-quote">
          {parseInline(buf.join('\n'), `${k}-q`, resolveRoom)}
        </blockquote>,
      )
      continue
    }

    // Plain paragraph (single line).
    blocks.push(
      <span key={k++} className="block">
        {parseInline(line, `${k}-p`, resolveRoom)}
      </span>,
    )
    i++
  }
  return blocks
}

export default function Markdown({ text, className = '', resolveRoom = null }) {
  if (!text) return null
  if (isJumbomoji(text)) {
    return (
      <span
        className={
          'vc-jumbo block leading-[1.05] whitespace-pre-wrap break-words ' + className
        }
        style={{ fontSize: '44px' }}
      >
        {text}
      </span>
    )
  }
  return (
    <div className={'vc-md whitespace-pre-wrap ' + className} style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}>
      {renderBlocks(text, resolveRoom)}
    </div>
  )
}
