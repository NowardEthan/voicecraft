/**
 * IdentitySummary — review rows for the Space's identity.
 *
 * Renders: Nome, Tema (swatch + name), Ícone (icon glyph + label).
 * All values come from the wizard state (passed in by SpaceCreator).
 */
import { UserCircle2 } from 'lucide-react'
import { SpaceIcon, normalizeSpaceIcon } from '../../../features/spaces'
import { EditableSummarySection } from './EditableSummarySection.jsx'

export function IdentitySummary({
  name,
  theme,
  iconValue,
  onEdit,
  themeList,
}) {
  const themeName = theme?.name || '—'
  const themeColor = theme?.css || '#ff3f6c'
  const v = normalizeSpaceIcon(iconValue)
  const iconLabel = v.id === 'users-three' ? 'Comunidade' : v.id

  const rows = [
    {
      label: 'Nome',
      value: (
        <span className="text-strong font-medium">
          {name || '—'}
        </span>
      ),
    },
    {
      label: 'Tema',
      value: (
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="w-3.5 h-3.5 rounded-full ring-1 ring-white/15"
            style={{ background: themeColor }}
          />
          <span className="text-strong">{themeName}</span>
        </span>
      ),
    },
    {
      label: 'Ícone',
      value: (
        <span className="inline-flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center bg-[#0f1014] border border-line text-strong"
            aria-hidden
          >
            <SpaceIcon value={iconValue} size={15} />
          </span>
          <span className="text-strong">{iconLabel}</span>
        </span>
      ),
    },
  ]

  return (
    <EditableSummarySection
      title="Identidade"
      icon={UserCircle2}
      editLabel="Editar identidade do Space"
      onEdit={onEdit}
      rows={rows}
    />
  )
}
