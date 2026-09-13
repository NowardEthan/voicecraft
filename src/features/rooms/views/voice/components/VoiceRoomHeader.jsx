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
import { resolveLabeledNameStyle } from '../../../model/roomCosmetics'

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
  cinema = false,
}) {
  const themeBtnRef = useRef(null)
  const accent = roomAccentColor(room)
  const nameStyle = resolveLabeledNameStyle({
    nameStyle: room?.nameStyle,
    fontId: room?.fontId,
    fonts: space?.fonts,
  })
  return (
    <header
      className={[
        '@container vc-voice-room-header shrink-0 px-3 sm:px-5 pt-4 sm:pt-6 pb-2 sm:pb-3 relative',
        cinema ? 'text-white' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className={['flex items-center gap-1.5 text-[11px]', cinema ? 'text-white/75' : 'text-muted'].join(' ')}>
        <span
          className="inline-flex items-center gap-1.5 min-w-0"
          title={space?.name || 'Espaço'}
        >
          <span
            className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0"
            style={{
              backgroundColor: cinema ? 'rgba(0,0,0,0.55)' : 'var(--space-accent-soft)',
              color: cinema ? '#fff' : 'var(--space-accent)',
              border: cinema ? '1px solid rgba(255,255,255,0.18)' : undefined,
            }}
            aria-hidden
          >
            {(space?.name || 'ES').slice(0, 2).toUpperCase()}
          </span>
          <span className="truncate max-w-[10rem] sm:max-w-[180px]">{space?.name || 'Espaço'}</span>
        </span>
        <ChevronRight size={11} className={cinema ? 'text-white/50 shrink-0' : 'text-muted/60 shrink-0'} />
      </div>

      <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          className="hidden @[420px]:flex w-11 h-11 sm:w-12 sm:h-12 rounded-2xl items-center justify-center shrink-0"
          style={{
            backgroundColor: cinema
              ? 'rgba(0,0,0,0.55)'
              : `color-mix(in srgb, ${accent} 18%, transparent)`,
            color: cinema ? '#fff' : accent,
            boxShadow: cinema
              ? '0 8px 24px -10px rgba(0,0,0,0.65)'
              : `0 8px 24px -10px color-mix(in srgb, ${accent} 40%, transparent)`,
            border: cinema ? '1px solid rgba(255,255,255,0.16)' : undefined,
          }}
          aria-hidden
        >
          <RoomIconMark room={room} size={18} />
        </div>

        <div className="flex-1 min-w-0 basis-[8rem]">
          <h1
            className={[
              'text-[clamp(1.15rem,3.4vw,1.85rem)] font-bold tracking-tight leading-tight truncate',
              cinema ? 'text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]' : 'text-strong',
            ].join(' ')}
            style={{ ...nameStyle, ...(room?.color && !cinema ? { color: accent } : null) }}
          >
            {room?.name || 'sala de voz'}
          </h1>
          <p className={[
            'text-[12px] mt-0.5 truncate hidden @[380px]:block',
            cinema ? 'text-white/70' : 'text-muted',
          ].join(' ')}>
            Sala de voz ao vivo, baixa latência.
          </p>
        </div>

        <div className={[
          'hidden @[720px]:flex items-center gap-3 text-[12px] shrink-0',
          cinema ? 'text-white/90' : 'text-ink',
        ].join(' ')}>
          <ConnectionStatus state={connectionState} />
          {connectionState === 'connected' ? (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-positive" aria-hidden />
              <span>{formatElapsed(elapsed)}</span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <UserPlus size={11} className={cinema ? 'text-white/70' : 'text-muted'} />
            <span>
              <span className={cinema ? 'font-semibold text-white' : 'font-semibold text-strong'}>{participantsCount}</span> na conversa
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
            className={[
              'h-9 w-9 @[520px]:w-auto @[520px]:px-3.5 rounded-full text-[12.5px] font-medium',
              'inline-flex items-center justify-center gap-1.5',
              'transition-[background-color,color,transform] duration-150',
              'hover:scale-[1.03] active:scale-[0.97]',
              cinema
                ? 'bg-black/65 hover:bg-black/80 backdrop-blur-md text-white border border-white/20 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.9)]'
                : 'bg-black/35 hover:bg-black/50 backdrop-blur-md text-white/90 hover:text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
            ].join(' ')}
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

      <div className={[
        'mt-2 flex @[720px]:hidden items-center gap-3 text-[11px] min-w-0',
        cinema ? 'text-white/90' : 'text-ink',
      ].join(' ')}>
        <ConnectionStatus state={connectionState} />
        {connectionState === 'connected' ? (
          <span className="inline-flex items-center gap-1.5 tabular-nums shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-positive" aria-hidden />
            <span>{formatElapsed(elapsed)}</span>
          </span>
        ) : null}
        <span className="truncate">
          <span className={cinema ? 'font-semibold text-white' : 'font-semibold text-strong'}>{participantsCount}</span> na conversa
        </span>
      </div>
    </header>
  )
}
