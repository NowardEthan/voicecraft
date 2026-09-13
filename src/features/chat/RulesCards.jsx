import { Check, Loader2, ShieldCheck } from 'lucide-react'
import {
  applyRulesTemplate,
  applyRulesTemplateChips,
  normalizeRules,
  sanitizeAnnounceHtml,
} from './rulesSchema'
import { SpaceCoverLayer } from '../spaces/components/SpaceCoverLayer'
import { SpaceIcon } from '../spaces/model/spaceIcons'

const BANNER_H = 88

function RulesPill({ color, label }) {
  return (
    <span
      className="inline-flex items-center h-[16px] px-1.5 rounded-full text-[8.5px] font-bold uppercase tracking-wide"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 18%, #111)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {label}
    </span>
  )
}

function RulesIconMark({ cfg, accent }) {
  return (
    <div
      className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 overflow-hidden text-[16px]"
      style={{
        background: `color-mix(in srgb, ${accent} 16%, #1a1e28)`,
        border: `1px solid color-mix(in srgb, ${accent} 32%, #2a303a)`,
        color: accent,
      }}
    >
      {cfg.iconImage ? (
        <img src={cfg.iconImage} alt="" className="w-full h-full object-cover" />
      ) : cfg.iconValue ? (
        <SpaceIcon value={cfg.iconValue} size={16} />
      ) : (
        <span aria-hidden>{cfg.icon || '📜'}</span>
      )}
    </div>
  )
}

function RulesAuthor({ cfg, accent }) {
  const name = cfg.authorName || 'Moderação'
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {cfg.authorPhoto ? (
        <img
          src={cfg.authorPhoto}
          alt=""
          className="w-[18px] h-[18px] rounded-full object-cover"
          style={{ border: '1px solid rgba(255,255,255,0.12)' }}
        />
      ) : cfg.authorIconValue ? (
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center"
          style={{
            background: `color-mix(in srgb, ${accent} 28%, #222)`,
            color: accent,
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <SpaceIcon value={cfg.authorIconValue} size={10} />
        </div>
      ) : cfg.authorIcon ? (
        <div
          className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px]"
          style={{
            background: `color-mix(in srgb, ${accent} 28%, #222)`,
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          {cfg.authorIcon}
        </div>
      ) : (
        <ShieldCheck size={14} style={{ color: accent }} />
      )}
      <span className="text-[10px] text-muted truncate">{name}</span>
    </div>
  )
}

/**
 * Rules channel card — compact, personalizable, with accept CTA.
 */
export function RulesCard({
  rules,
  spaceName = '',
  memberCount = null,
  accepted = false,
  accepting = false,
  onAccept = null,
  showAccept = true,
  preview = false,
}) {
  const cfg = normalizeRules(rules)
  const accent = cfg.accent || '#a78bfa'
  const badgeColor = cfg.badgeColor || accent
  const ctx = {
    user: 'você',
    space: spaceName || 'Space',
    count: memberCount ?? '',
  }

  const titleHtml = sanitizeAnnounceHtml(applyRulesTemplateChips(cfg.title, ctx))
  const titlePlain = applyRulesTemplate(cfg.title, ctx)
  const titleHasChips = /\blobby-ph\b/.test(titleHtml)
  const bodyHtml = sanitizeAnnounceHtml(
    applyRulesTemplateChips(cfg.bodyHtml || cfg.body || '', ctx),
  )

  return (
    <div className={preview ? 'w-full' : 'w-full px-3 sm:px-6 my-2'}>
      <article
        className="relative overflow-hidden rounded-lg max-w-[420px]"
        style={{
          background: 'linear-gradient(165deg, #1c2029 0%, #151820 60%, #12151c 100%)',
          border: `1px solid color-mix(in srgb, ${accent} 36%, #2a303a)`,
          boxShadow: '0 3px 12px rgba(0,0,0,0.24)',
        }}
      >
        <div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-[2.5px] z-10"
          style={{
            background: `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 22%, transparent))`,
          }}
        />

        {cfg.banner ? (
          <div className="relative w-full overflow-hidden" style={{ height: BANNER_H }}>
            <SpaceCoverLayer src={cfg.banner} fit={cfg.bannerFit} />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(to top, #151820 0%, rgba(21,24,32,0.4) 55%, transparent 100%)',
              }}
            />
            <div className="absolute top-2 left-3 right-3 flex items-center gap-2 z-[1]">
              <RulesPill color={badgeColor} label={cfg.badge || 'Regras'} />
            </div>
          </div>
        ) : null}

        <div className="pl-3 pr-2.5 pt-2.5 pb-2.5 space-y-2">
          {!cfg.banner ? (
            <div className="flex items-center gap-2 flex-wrap">
              <RulesPill color={badgeColor} label={cfg.badge || 'Regras'} />
            </div>
          ) : null}

          <div className="flex items-start gap-2">
            <RulesIconMark cfg={cfg} accent={accent} />
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="text-[13.5px] font-semibold text-strong leading-snug">
                {titleHasChips ? (
                  <span
                    className="announce-html lobby-html"
                    dangerouslySetInnerHTML={{ __html: titleHtml }}
                  />
                ) : (
                  titlePlain
                )}
              </h3>
              {cfg.lockSpace ? (
                <p className="text-[10.5px] text-muted mt-0.5">
                  Aceite para liberar o restante do Space
                </p>
              ) : null}
            </div>
          </div>

          {bodyHtml ? (
            <div
              className="rounded-md px-2.5 py-2 text-[12px] leading-relaxed"
              style={{
                color: 'var(--vc-text)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="announce-html lobby-html"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            </div>
          ) : null}

          <div
            className="flex items-center justify-between gap-2 pt-1"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <RulesAuthor cfg={cfg} accent={accent} />
            <span className="text-[9.5px] text-muted tabular-nums">v{cfg.version}</span>
          </div>

          {showAccept ? (
            <button
              type="button"
              disabled={accepted || accepting || !onAccept}
              onClick={() => onAccept?.()}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold disabled:opacity-55 transition-opacity"
              style={{
                background: accepted
                  ? 'color-mix(in srgb, var(--vc-positive, #22c55e) 22%, #1a1e28)'
                  : accent,
                color: accepted ? 'var(--vc-positive, #22c55e)' : '#0a0a0a',
                border: accepted
                  ? '1px solid color-mix(in srgb, var(--vc-positive, #22c55e) 40%, transparent)'
                  : 'none',
              }}
            >
              {accepting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : accepted ? (
                <Check size={14} strokeWidth={2.4} />
              ) : null}
              {accepted ? 'Regras aceitas' : (cfg.acceptLabel || 'Li e aceito as regras')}
            </button>
          ) : null}
        </div>
      </article>
    </div>
  )
}
