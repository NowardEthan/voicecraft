/** Shared message engagement tray, Chan controls, counts, and emoji picker. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SmilePlus, Star } from 'lucide-react'
import EmojiPicker from './EmojiPicker'
import { AnchoredOverlay } from '../../shared/motion/AnchoredOverlay.jsx'

const PICKER_WIDTH = 336
const PICKER_HEIGHT = 316
const VIEWPORT_GAP = 8
const CHAN_CELEBRATION_MS = 1400
const REACTION_POP_MS = 260

function reactionEntries(reactions) {
  return Object.entries(reactions || {}).filter(([, value]) => Number(value?.count) > 0)
}

function uniqueQuickReactions(quickReactions, reactions) {
  const visibleCounts = new Set(reactionEntries(reactions).map(([emoji]) => emoji))
  return [...new Set((quickReactions || []).filter(Boolean))]
    .filter((emoji) => !visibleCounts.has(emoji))
    .slice(0, 3)
}

function useTransientClass(duration) {
  const [active, setActive] = useState(false)
  const timerRef = useRef(0)
  const frameRef = useRef(0)
  const trigger = useCallback(() => {
    window.clearTimeout(timerRef.current)
    window.cancelAnimationFrame(frameRef.current)
    setActive(false)
    frameRef.current = window.requestAnimationFrame(() => {
      setActive(true)
      timerRef.current = window.setTimeout(() => setActive(false), duration)
    })
  }, [duration])
  useEffect(() => () => {
    window.clearTimeout(timerRef.current)
    window.cancelAnimationFrame(frameRef.current)
  }, [])
  return [active, trigger]
}

function useConfirmedStateAnimation(animationKey, trigger) {
  const enabled = animationKey !== null && animationKey !== undefined
  useEffect(() => {
    if (enabled) trigger()
  }, [animationKey, enabled, trigger])
}

function useChanConfirmedCelebration(count, liked, trigger) {
  const previousRef = useRef(null)
  const enabled = count !== null && count !== undefined

  useEffect(() => {
    if (!enabled) return
    const next = { count: Number(count) || 0, liked: !!liked }
    const previous = previousRef.current
    previousRef.current = next

    const isRemoval = previous && (
      next.count < previous.count
      || (previous.liked && !next.liked)
    )
    if (next.count > 0 && !isRemoval && (
      previous === null
      || next.count > previous.count
      || (!previous.liked && next.liked)
    )) trigger()
  }, [count, enabled, liked, trigger])
}

function ChanButton({ liked, onToggle, className = '', count = null }) {
  const [pending, setPending] = useState(false)
  const [celebrating, celebrate] = useTransientClass(CHAN_CELEBRATION_MS)
  useChanConfirmedCelebration(count, liked, celebrate)
  const label = liked ? 'Remover Chan' : 'Dar um Chan'

  const handleClick = async () => {
    if (pending || !onToggle) return
    const wasLiked = liked
    setPending(true)
    try {
      const result = await onToggle()
      if (count == null && !wasLiked && result?.success && result?.status === 'success') celebrate()
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      className={`vc-chan-control ${className} ${liked ? 'is-active' : ''} ${celebrating ? 'is-celebrating' : ''}`.trim()}
      onClick={handleClick}
      disabled={pending}
      aria-busy={pending}
      aria-pressed={liked}
      aria-label={count == null ? label : `${label}, ${count} ${count === 1 ? 'Chan' : 'Chans'}`}
      title={label}
    >
      <span className="vc-chan-control__halo" aria-hidden />
      <span className="vc-chan-control__aura" aria-hidden>
        {Array.from({ length: 3 }, (_, index) => <i key={index} />)}
      </span>
      <span className="vc-chan-control__shimmer" aria-hidden />
      <span className="vc-chan-control__particles" aria-hidden>
        {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
      </span>
      <span className="vc-chan-control__icon" aria-hidden>
        <Star size={count == null ? 16 : 13} className={liked ? 'is-filled' : ''} />
      </span>
      <span className="vc-chan-control__rays" aria-hidden>
        {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
      </span>
      <span className="vc-chan-control__afterglow" aria-hidden />
      {count != null && <strong key={count} className="vc-engagement-count">{count}</strong>}
    </button>
  )
}

function ReactionButton({ emoji, onToggle, className = '', children, animationKey = null, ...props }) {
  const [popping, pop] = useTransientClass(REACTION_POP_MS)
  useConfirmedStateAnimation(animationKey, pop)
  const handleClick = () => {
    pop()
    return onToggle?.(emoji)
  }
  return (
    <button
      type="button"
      className={`vc-reaction-feedback ${className} ${popping ? 'is-popping' : ''}`.trim()}
      onClick={handleClick}
      {...props}
    >
      {children || <span aria-hidden>{emoji}</span>}
    </button>
  )
}

export function EmojiPickerButton({ onPick, className = '', label = 'Adicionar rea\u00e7\u00e3o' }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const buttonRef = useRef(null)
  const pickerRef = useRef(null)

  const placePicker = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(PICKER_WIDTH, window.innerWidth - VIEWPORT_GAP * 2)
    const height = Math.min(PICKER_HEIGHT, window.innerHeight - VIEWPORT_GAP * 2)
    const spaceAbove = rect.top - VIEWPORT_GAP
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP
    const openUp = spaceAbove >= height || spaceAbove > spaceBelow
    setPosition({
      width,
      maxHeight: height,
      left: Math.max(VIEWPORT_GAP, Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_GAP)),
      top: Math.max(VIEWPORT_GAP, Math.min(openUp ? rect.top - height - VIEWPORT_GAP : rect.bottom + VIEWPORT_GAP, window.innerHeight - height - VIEWPORT_GAP)),
    })
  }, [])

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus())
  }, [])

  const toggle = () => {
    if (open) {
      close(true)
      return
    }
    placePicker()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return undefined
    let frame = 0
    const reposition = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(placePicker)
    }
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open, placePicker])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className}
        onClick={toggle}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
      >
        <SmilePlus size={16} aria-hidden />
      </button>
      <AnchoredOverlay
        open={open && !!position}
        ref={pickerRef}
        anchorRef={buttonRef}
        onClose={() => close(false)}
        placement="top"
          role="dialog"
          aria-label="Escolher rea\u00e7\u00e3o"
          className="vc-conversation-emoji-picker"
          style={position}
          onWheel={(event) => event.stopPropagation()}
        >
          <EmojiPicker
            compact
            initialFocus
            onPick={(emoji) => {
              onPick?.(emoji)
              close(true)
            }}
          />
      </AnchoredOverlay>
    </>
  )
}

export function EngagementTray({
  reactions = {},
  likes = [],
  currentUserId = null,
  quickReactions = [],
  onToggleReaction,
  onToggleLike,
  className = '',
  children,
  label = 'A\u00e7\u00f5es r\u00e1pidas da mensagem',
}) {
  const liked = !!currentUserId && Array.isArray(likes) && likes.includes(currentUserId)
  const quick = useMemo(
    () => uniqueQuickReactions(quickReactions, reactions),
    [quickReactions, reactions],
  )

  return (
    <div className={`vc-engagement-tray ${className}`.trim()} role="toolbar" aria-label={label}>
      {onToggleLike && (
        <ChanButton
          liked={liked}
          onToggle={onToggleLike}
          className="vc-engagement-tray__like"
        />
      )}
      {onToggleReaction && quick.map((emoji) => (
        <ReactionButton
          key={emoji}
          emoji={emoji}
          onToggle={onToggleReaction}
          className="vc-engagement-tray__emoji"
          aria-label={`Reagir com ${emoji}`}
          title={`Reagir com ${emoji}`}
        />
      ))}
      {onToggleReaction && <EmojiPickerButton onPick={onToggleReaction} />}
      {children}
    </div>
  )
}

export default function EmojiReactions({
  reactions = {},
  likes = [],
  currentUserId = null,
  onToggle,
  onToggleLike,
  onPick,
  className = '',
  hideAdd = false,
  hideList = false,
}) {
  const entries = reactionEntries(reactions)
  const likeCount = Array.isArray(likes) ? likes.length : 0
  const liked = !!currentUserId && Array.isArray(likes) && likes.includes(currentUserId)
  const hasEngagement = entries.length > 0 || likeCount > 0

  if (hideList && hideAdd) return null
  if (!hasEngagement && hideAdd) return null

  return (
    <div className={`vc-conversation-reactions ${className}`.trim()} aria-label="Rea\u00e7\u00f5es da mensagem">
      {!hideList && entries.map(([emoji, info]) => {
        const mine = !!info?.mine
        const count = Number(info.count) || 0
        return (
          <ReactionButton
            key={emoji}
            emoji={emoji}
            onToggle={onToggle}
            data-emoji={emoji}
            aria-pressed={mine}
            aria-label={`${emoji}, ${count} ${count === 1 ? 'rea\u00e7\u00e3o' : 'rea\u00e7\u00f5es'}`}
            className={`vc-react-pill ${mine ? 'is-mine' : ''}`}
            animationKey={`${count}:${mine ? 1 : 0}`}
          >
            <span aria-hidden>{emoji}</span>
            <strong key={count} className="vc-engagement-count">{count}</strong>
          </ReactionButton>
        )
      })}
      {!hideList && likeCount > 0 && (
        <ChanButton
          liked={liked}
          onToggle={onToggleLike}
          count={likeCount}
          className={`vc-react-pill vc-react-pill-like ${liked ? 'is-mine' : ''}`}
        />
      )}
      {!hideAdd && <EmojiPickerButton onPick={onPick || onToggle} />}
    </div>
  )
}
