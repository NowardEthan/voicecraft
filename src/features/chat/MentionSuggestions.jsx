/**
 * MentionSuggestions — floating dropdown for the Composer's `@` and `#`
 * triggers. Renders members (people) for `@` and rooms (Salas) for `#`.
 *
 * Contract:
 *   - The component is fully controlled: parent owns `query`, `kind`,
 *     `items` and `selectedId`. We expose pure helper logic via
 *     `computeMentionSuggestions({...})` so the caller can decide what
 *     happens when Enter selects an item.
 *   - The popover is positioned via the `anchor` prop = the textarea's
 *     bounding rect. AnchoredOverlay portals it to document.body so it
 *     floats above the rest of the chat.
 *
 * Keyboard:
 *   - ↑/↓  move the selection (wraps)
 *   - Enter selects the highlighted item
 *   - Esc closes (parent removes the popover by setting `open=false`)
 *
 * Visual:
 *   - 280px wide, max 280px tall
 *   - Top counter ("Top 8 of 12")
 *   - Selected row: translucent accent bg + 2px left border
 *   - Avatar 28x28 for people; Hash icon for rooms
 */
import { useEffect, useMemo, useRef } from 'react'
import { AnchoredOverlay } from '../../shared/motion/AnchoredOverlay.jsx'
import { Hash, AtSign } from 'lucide-react'
import { PersonAvatar } from '../people'

/* Maximum items shown — Discord caps at ~8 so the popover stays compact
 * but enough that a short query still sees the closest matches.       */
const MAX_ITEMS = 8

function optionDomId(prefix, value) {
  return `${prefix}-${String(value || 'none').replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

/** Pure: given members/rooms + a query, produce a filtered list capped at
 *  MAX_ITEMS. The same function is exposed so the Composer can also
 *  pre-compute the selectedId for keyboard nav without re-implementing
 *  the filter logic.                                                  */
export function computeMentionSuggestions({ kind, query, members, rooms }) {
  const q = String(query || '').trim().toLowerCase()
  if (kind === 'member') {
    const list = Array.isArray(members) ? members : []
    const filtered = q
      ? list.filter((m) => {
          const name = String(m?.displayName || '').toLowerCase()
          const handle = String(m?.handle || '').toLowerCase()
          return name.startsWith(q) || handle.startsWith(q)
            || name.includes(q) || handle.includes(q)
        })
      : list.slice()
    return filtered.slice(0, MAX_ITEMS)
  }
  if (kind === 'room') {
    const list = Array.isArray(rooms) ? rooms : []
    const filtered = q
      ? list.filter((r) => {
          const name = String(r?.name || '').toLowerCase()
          const id = String(r?.id || '').toLowerCase()
          return name.startsWith(q) || id.startsWith(q)
            || name.includes(q)
        })
      : list.slice()
    return filtered.slice(0, MAX_ITEMS)
  }
  return []
}

/** Pure: resolve the @query -> "@Display name" replacement (used after
 *  Enter selects a member). Currently keeps the original emoji trigger
 *  intact. Returns the new text + the new caret position.             */
export function applyMentionReplacement(text, caretStart, caretEnd, item, kind) {
  const before = text.slice(0, caretStart)
  const after = text.slice(caretEnd)
  const replacement = kind === 'member'
    ? `@${item?.handle || item?.userId || item?.displayName || ''}`
    : `#${item?.name || item?.id || ''}`
  const newText = `${before}${replacement} ${after}`
  const newCaret = (before + replacement + ' ').length
  return { newText, newCaret }
}

/** Pure: from the current text + caret, detect whether there's an open
 *  mention trigger (`@` or `#`) and if so extract the query range.
 *  Returns { active, kind, queryStart, queryEnd } where queryStart is
 *  the index AFTER the trigger char and queryEnd is the caret.         */
export function detectMentionTrigger(text, caret) {
  if (caret == null || caret < 0) return { active: false }
  const slice = text.slice(0, caret)
  // Find the LAST @ or # that is at start or after whitespace.
  for (let i = slice.length - 1; i >= 0; i--) {
    const ch = slice[i]
    if (ch === '@' || ch === '#') {
      const prev = i === 0 ? '' : slice[i - 1]
      if (prev && !/\s/.test(prev)) return { active: false }
      const query = slice.slice(i + 1)
      if (/[\s\n]/.test(query)) return { active: false }
      return {
        active: true,
        kind: ch === '@' ? 'member' : 'room',
        triggerChar: ch,
        triggerStart: i,
        queryStart: i + 1,
        queryEnd: caret,
        query,
      }
    }
    if (/[\s\n]/.test(ch)) break
  }
  return { active: false }
}

function SuggestionAvatar({ item, kind, currentUserId }) {
  if (kind === 'room') {
    return (
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center bg-[var(--space-accent-soft)] text-[var(--space-accent)] shrink-0"
        aria-hidden
      >
        <Hash size={13} strokeWidth={2.2} />
      </span>
    )
  }
  return (
    <span className="shrink-0">
      <PersonAvatar
        src={item?.photoURL}
        name={item?.displayName || item?.handle || item?.userId}
        userId={item?.userId}
        size={28}
      />
    </span>
  )
}

export default function MentionSuggestions({
  open = true,
  anchorRef,
  id = 'vc-mention-suggestions',
  optionIdPrefix = 'vc-mention-option',
  anchor,
  placement = 'top',
  kind = 'member',
  query = '',
  items = [],
  selectedId = null,
  currentUserId,
  onHover,
  onSelect,
  onClose,
}) {
  const listRef = useRef(null)

  useEffect(() => {
    if (!selectedId || !listRef.current) return
    const el = listRef.current.querySelector(`[data-mention-id="${CSS.escape(String(selectedId))}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedId])

  const style = useMemo(() => {
    if (!anchor) return { left: -9999, top: -9999 }
    const popW = 280
    const margin = 8
    let left = anchor.left
    let top = placement === 'top' ? anchor.top - margin : anchor.bottom + margin
    if (typeof window !== 'undefined') {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const estH = Math.min(280, 36 + items.length * 44 + 12)
      left = Math.max(margin, Math.min(left, vw - popW - margin))
      if (placement === 'top') {
        if (top - estH < margin) top = anchor.bottom + margin
      } else if (top + estH > vh - margin) {
        top = anchor.top - estH - margin
      }
      top = Math.max(margin, Math.min(top, vh - estH - margin))
    }
    return { left, top, width: popW }
  }, [anchor, placement, items.length])

  const totalLabel = kind === 'room' ? 'salas' : 'pessoas'

  return (
    <AnchoredOverlay
      open={open && !!anchor}
      anchorRef={anchorRef}
      onClose={onClose}
      placement={placement}
      restoreFocus
      ref={listRef}
      id={id}
      role="listbox"
      aria-label={kind === 'room' ? 'Sugestões de sala' : 'Sugestões de pessoas'}
      className="vc-mention-popover"
      style={style}
      data-mention-kind={kind}
      onMouseDown={(event) => event.preventDefault()}
    >
      <p className="vc-mention-popover__count">
        Top {items.length} {totalLabel}
      </p>
      {items.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-muted">Nada encontrado</div>
      ) : (
        items.map((item) => {
          const isSel = selectedId === (item.id || item.userId)
          return (
            <button
              key={item.id || `${kind}-${item.userId || item.name}`}
              type="button"
              id={optionDomId(optionIdPrefix, item.id || item.userId)}
              role="option"
              aria-selected={isSel}
              data-mention-id={String(item.id || item.userId || '')}
              data-mention-kind={kind}
              className={
                'vc-mention-popover__item ' +
                (isSel ? 'vc-mention-popover__item--active ' : '') +
                (kind === 'room' ? 'vc-mention-popover__item--room' : 'vc-mention-popover__item--member')
              }
              onMouseEnter={() => onHover?.(item.id || item.userId)}
              onClick={() => onSelect?.(item)}
            >
              <SuggestionAvatar item={item} kind={kind} currentUserId={currentUserId} />
              <span className="vc-mention-popover__name">
                {kind === 'room' ? (item.name || item.id) : (item.displayName || item.handle || item.userId)}
              </span>
              {kind === 'member' && item.handle && item.handle !== item.displayName && (
                <span className="vc-mention-popover__handle">@{item.handle}</span>
              )}
              {kind === 'member' && item.userId && item.userId === currentUserId && (
                <span className="vc-mention-popover__badge">você</span>
              )}
              {kind === 'room' && item.type === 'voice' && (
                <span className="vc-mention-popover__badge">voz</span>
              )}
              {kind === 'room' && item.type === 'text' && (
                <span className="vc-mention-popover__badge">texto</span>
              )}
              {kind === 'member' && <AtSign size={11} className="opacity-50" aria-hidden />}
            </button>
          )
        })
      )}
    </AnchoredOverlay>
  )
}
