/**
 * VoiceRoomHeader — the bar at the top of the main area.
 *
 * Uses a container query so it reacts to the *column* width (sidebars
 * steal space) rather than the window. Title always truncates; stats
 * and the invite label appear only when there is room.
 */
import { useRef } from 'react'
import { ChevronRight, UserPlus } from 'lucide-react'
import { formatElapsed } from '../formatElapsed'
import { ConnectionStatus } from './ConnectionStatus'
import { RoomThemeControl } from './RoomThemeControl'
import { VoiceMoreMenu } from './VoiceMoreMenu'
import { RoomIconMark, roomAccentColor } from '../../../components/RoomIconMark'
import { resolveRoomNameStyle } from '../../../model/roomCosmetics'

export function VoiceRoomHeader({
  space,
  room,
  elapsed,
  participantsCount,
  connectionState,
  roomCover,
  onInvite,
  onCoverChange,
  onOpenSettings,
  onLeave,
}) {
  const themeBtnRef = useRef(null)
  const accent = roomAccentColor(room)
  const nameStyle = resolveRoomNameStyle(room?.nameStyle).style
  return (
    <header className="@container shrink-0 px-3 sm:px-5 pt-4 sm:pt-6 pb-2 sm:pb-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <span
          className="inline-flex items-center gap-1.5 min-w-0"
          title={space?.name || 'Espaço'}
        >
          <span
            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0"
            style={{
              backgroundColor: 'var(--space-accent-soft)',
              color: 'var(--space-accent)',
            }}
            aria-hidden
          >
            {(space?.name || 'ES').slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate max-w-[10rem] sm:max-w-[180px]">{space?.name || 'Espaço'}</span>
        </span>
        <ChevronRight size={11} className="text-muted/60 shrink-0" />
      </div>

      <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          className="hidden @[420px]:flex w-11 h-11 sm:w-12 sm:h-12 rounded-2xl items-center justify-center shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`,
            color: accent,
            boxShadow: `0 8px 24px -10px color-mix(in srgb, ${accent} 40%, transparent)`,
          }}
          aria-hidden
        >
          <RoomIconMark room={room} size={18} />
        </div>

        <div className="flex-1 min-w-0 basis-[8rem]">
          <h1
            className="text-[clamp(1.15rem,3.4vw,1.85rem)] font-bold text-strong tracking-tight leading-tight truncate"
            style={{ ...nameStyle, ...(room?.color ? { color: accent } : null) }}
          >
            {room?.name || 'sala de voz'}
          </h1>
          <p className="text-[12px] text-muted mt-0.5 truncate hidden @[380px]:block">
            Sala de voz ao vivo, baixa latência.
          </p>
        </div>

        <div className="hidden @[720px]:flex items-center gap-3 text-[12px] text-ink shrink-0">
          <ConnectionStatus state={connectionState} />
          {connectionState === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-positive" aria-hidden />
              <span>{formatElapsed(elapsed)}</span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <UserPlus size={11} className="text-muted" />
            <span>
              <span className="font-semibold text-strong">{participantsCount}</span> na conversa
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          <span ref={themeBtnRef} className="inline-flex">
            <RoomThemeControl
              roomId={room?.id}
              currentCover={roomCover}
              onCoverChange={onCoverChange}
              anchorRef={themeBtnRef}
            />
          </span>
          <button
            type="button"
            onClick={onInvite}
            className="
              h-9 w-9 @[520px]:w-auto @[520px]:px-3.5 rounded-full text-[12.5px] font-medium
              bg-black/35 hover:bg-black/50 backdrop-blur-md
              text-white/90 hover:text-white
              shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]
              inline-flex items-center justify-center gap-1.5
              transition-[background-color,color,transform] duration-150
              hover:scale-[1.03] active:scale-[0.97]
            "
          >
            <UserPlus size={14} strokeWidth={1.9} />
            <span className="hidden @[520px]:inline">Convidar</span>
          </button>
          <VoiceMoreMenu
            space={space}
            room={room}
            onOpenSettings={onOpenSettings}
            onLeave={onLeave}
          />
        </div>
      </div>

      <div className="mt-2 flex @[720px]:hidden items-center gap-3 text-[11px] text-ink min-w-0">
        <ConnectionStatus state={connectionState} />
        {connectionState === 'connected' ? (
          <span className="inline-flex items-center gap-1.5 tabular-nums shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-positive" aria-hidden />
            <span>{formatElapsed(elapsed)}</span>
          </span>
        ) : null}
        <span className="truncate">
          <span className="font-semibold text-strong">{participantsCount}</span> na conversa
        </span>
      </div>
    </header>
  )
}
