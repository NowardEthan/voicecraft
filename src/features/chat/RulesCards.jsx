import { useId } from 'react'
import { AlertCircle, Check, Loader2, RotateCcw, ShieldCheck } from 'lucide-react'
import {
  applyRulesTemplateChips,
  normalizeRules,
  sanitizeAnnounceHtml,
} from './rulesSchema'
import { SpaceCoverLayer } from '../spaces/components/SpaceCoverLayer'
import { SpaceIcon } from '../spaces/model/spaceIcons'
import ChatFeatureCardFrame from './cards/ChatFeatureCardFrame.jsx'
import { createRulesCardViewModel } from './cards/featureCardViewModels.js'
function readableTextColor(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ''))
  if (!match) return '#0a0a0a'
  const rgb = [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16) / 255)
  const linear = rgb.map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  const luminance = (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2])
  return luminance > 0.179 ? '#0a0a0a' : '#ffffff'
}

function RulesIcon({ cfg }) {
  if (cfg.iconImage) return <img src={cfg.iconImage} alt="" className="vc-feature-card-avatar-image" />
  if (cfg.iconValue) return <SpaceIcon value={cfg.iconValue} size={16} />
  return <span aria-hidden>{cfg.icon || '📜'}</span>
}

function RulesIdentity({ cfg, vm }) {
  return (
    <div className="vc-feature-card-identity">
      <span className="vc-feature-card-identity__avatar is-fallback" aria-hidden>
        {cfg.authorPhoto
          ? <img src={cfg.authorPhoto} alt="" />
          : cfg.authorIconValue
            ? <SpaceIcon value={cfg.authorIconValue} size={11} />
            : (cfg.authorIcon || <ShieldCheck size={13} />)}
      </span>
      <span className="vc-feature-card-identity__copy">
        <strong>{vm.author.name}</strong>
        <small>Política do Space · versão {cfg.version}</small>
      </span>
    </div>
  )
}

/** Rules policy card. Async error props are additive and legacy calls remain valid. */
export function RulesCard({
  rules,
  spaceName = '',
  memberCount = null,
  accepted = false,
  accepting = false,
  onAccept = null,
  showAccept = true,
  preview = false,
  error = null,
  onRetry = null,
  retrying = false,
  acceptError = null,
}) {
  const requiredHelpId = useId()
  const cfg = normalizeRules(rules)
  const context = { user: 'você', space: spaceName || 'Space', count: memberCount ?? '' }
  const vm = createRulesCardViewModel(cfg, { accepted, context, preview })
  const accent = vm.accent || cfg.accent || '#a78bfa'
  const bodyHtml = sanitizeAnnounceHtml(applyRulesTemplateChips(cfg.bodyHtml || cfg.body || '', context))
  const visibleError = error || acceptError
  const required = cfg.lockSpace && !accepted
  const status = accepted
    ? { id: 'accepted', label: 'Aceite registrado' }
    : required
      ? { id: 'required', label: 'Aceite obrigatório' }
      : { id: 'optional', label: 'Leitura recomendada' }

  const showGate = showAccept || required
  const action = showGate ? (
    <div className="vc-rules-card__gate" aria-live="polite" aria-busy={accepting || retrying ? 'true' : 'false'}>
      {visibleError ? (
        <div className="vc-feature-card-error" role="alert">
          <AlertCircle size={14} aria-hidden />
          <span>{String(visibleError?.message || visibleError || 'Não foi possível registrar o aceite.')}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry} disabled={retrying || accepting}>
              {retrying ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <RotateCcw size={13} aria-hidden />}
              Tentar novamente
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        disabled={accepted || accepting || retrying || !onAccept}
        onClick={() => onAccept?.()}
        className="vc-rules-card__accept"
        style={{ '--vc-rules-action': accent, '--vc-rules-action-text': readableTextColor(accent) }}
        aria-describedby={required ? requiredHelpId : undefined}
      >
        {accepting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : accepted ? <Check size={14} strokeWidth={2.4} aria-hidden /> : null}
        {accepting ? 'Registrando aceite…' : accepted ? 'Regras aceitas' : (cfg.acceptLabel || 'Li e aceito as regras')}
      </button>
      {required ? <small id={requiredHelpId}>Este aceite libera o restante do Space.</small> : null}
    </div>
  ) : null

  return (
    <div className={preview ? 'w-full' : 'w-full px-3 sm:px-6 my-2'}>
      <ChatFeatureCardFrame
        accent={accent}
        className={`vc-rules-card ${required ? 'is-required' : ''}`}
        media={vm.media ? <div className="vc-rules-card__banner"><SpaceCoverLayer src={vm.media.src} fit={vm.media.fit} /></div> : null}
        badge={<span className="vc-feature-card-pill" style={{ '--vc-feature-card-pill': cfg.badgeColor || accent }}>{cfg.badge || 'Política'}</span>}
        status={<span className={`vc-feature-card-state is-${status.id}`}>{status.label}</span>}
        icon={<RulesIcon cfg={cfg} />}
        title={<h3>{vm.title}</h3>}
        body={bodyHtml ? <div className="announce-html lobby-html vc-rules-card__body" dangerouslySetInnerHTML={{ __html: bodyHtml }} /> : null}
        identity={<RulesIdentity cfg={cfg} vm={vm} />}
        actions={action}
        aria-label={`${vm.title}, versão ${cfg.version}`}
        data-policy-role="rules"
        data-rules-required={required ? 'true' : 'false'}
      />
    </div>
  )
}
