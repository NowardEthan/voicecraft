/**
 * SpaceReviewPreview — compact preview of the Space about to be created.
 *
 * Mirrors the look of the real Space (banner with wave layers + icon
 * overlaid + name + subtitle), then shows a "Salas" section with the
 * first room. Re-renders whenever the wizard data changes.
 *
 * Per spec §4: never shows "Canais" — VoiceCraft uses "Salas".
 */
import { Plus, MessageCircle } from 'lucide-react'
import { SpaceIcon, bannerGradient, bannerOverlay } from '../../../features/spaces'
import { SpaceCoverLayer } from '../../../features/spaces/components/SpaceCoverLayer'
import { PURPOSES } from '../../../features/rooms'

/**
 * Compact theme banner with wave layers. Renders the same shape as the
 * Step 1 preview but smaller (no big "preview full-width" hero), so the
 * right column has room to breathe.
 */
function MiniBanner({ name, subtitle, iconValue, theme, cover, coverFit }) {
  const base = theme?.css || '#ff3f6c'
  return (
    <div className="relative overflow-hidden h-[140px] flex items-end px-5">
      {cover ? (
        <SpaceCoverLayer src={cover} fit={coverFit} />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: bannerGradient(base) }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: bannerOverlay(base, !!cover) }}
      />
      <svg
        aria-hidden
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 800 140"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="revWaveA" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="revWaveB" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000000" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.30" />
          </linearGradient>
        </defs>
        <path
          d="M 0 80 C 120 55, 260 100, 400 75 S 660 40, 800 85 L 800 140 L 0 140 Z"
          fill="url(#revWaveA)"
        />
        <path
          d="M 0 100 C 160 75, 300 120, 460 95 S 720 70, 800 105 L 800 140 L 0 140 Z"
          fill="rgba(255,255,255,0.10)"
        />
        <path
          d="M 0 118 C 200 95, 380 135, 540 115 S 760 95, 800 125 L 800 140 L 0 140 Z"
          fill="url(#revWaveB)"
        />
      </svg>

      <div className="relative flex items-center gap-3 pb-3.5">
        <div
          className="w-[60px] h-[60px] rounded-full flex items-center justify-center shrink-0 ring-2 ring-white/35 shadow-[0_6px_18px_-4px_rgba(0,0,0,0.3)]"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.18) 100%)',
            color: '#ffffff',
          }}
        >
          <SpaceIcon value={iconValue} size={28} className="text-strong" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold text-strong tracking-tight truncate">
            {name || 'Nome do Space'}
          </p>
          <p className="text-[12.5px] text-strong/80 truncate">
            {subtitle || 'Space de grupo'}
          </p>
        </div>
      </div>
    </div>
  )
}

export function SpaceReviewPreview({
  name,
  description,
  iconValue,
  theme,
  cover,
  coverFit,
  firstRoomPurpose,
  firstRoomName,
}) {
  const purpose = firstRoomPurpose
    ? PURPOSES.find((p) => p.key === firstRoomPurpose)
    : null
  const RoomIcon = purpose?.icon || MessageCircle

  return (
    <div className="rounded-[14px] border border-line bg-[#16161a] overflow-hidden">
      <div className="px-4 pt-3.5 pb-2.5 border-b border-line">
        <h3 className="text-[12px] font-semibold text-muted uppercase tracking-wider">
          Prévia do seu Space
        </h3>
      </div>

      <MiniBanner
        name={name}
        subtitle={description || 'Space de grupo'}
        iconValue={iconValue}
        theme={theme}
        cover={cover}
        coverFit={coverFit}
      />

      <div className="px-4 py-3 border-t border-line">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[11.5px] font-semibold text-muted uppercase tracking-wider">
            Salas
          </h4>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="w-5 h-5 rounded flex items-center justify-center text-muted/60 hover:text-muted transition-colors"
            title="Adicionar sala"
          >
            <Plus size={12} strokeWidth={1.75} />
          </button>
        </div>
        {purpose ? (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] bg-[#0f1014] border border-line">
            <div
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
              style={{
                background: purpose.soft,
                color: purpose.color,
              }}
            >
              <RoomIcon size={13} strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-strong leading-tight truncate">
                {firstRoomName || purpose.label}
              </p>
              <p className="text-[10.5px] text-muted leading-tight">
                {purpose.label}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[11.5px] text-muted leading-snug px-1">
            Nenhuma sala configurada.
          </p>
        )}
      </div>
    </div>
  )
}
