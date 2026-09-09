/**
 * FirstRoomSummary — review rows for the first room of the Space.
 *
 * Renders: Tipo (icon + label), Nome, Descrição. Values come from the
 * wizard state. The description shown is the long `contextDescription`
 * from the type catalog.
 */
import { MessageSquare } from 'lucide-react'
import { EditableSummarySection } from './EditableSummarySection.jsx'
import { PURPOSES } from '../../../features/rooms'

export function FirstRoomSummary({ purposeKey, roomName, onEdit }) {
  const purpose = purposeKey ? PURPOSES.find((p) => p.key === purposeKey) : null
  const TypeIcon = purpose?.icon

  const rows = purpose
    ? [
        {
          label: 'Tipo',
          value: (
            <span className="inline-flex items-center gap-2">
              {TypeIcon ? (
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: purpose.soft, color: purpose.color }}
                  aria-hidden
                >
                  <TypeIcon size={12} strokeWidth={1.8} />
                </span>
              ) : null}
              <span className="text-strong">{purpose.label}</span>
            </span>
          ),
        },
        {
          label: 'Nome',
          value: (
            <span className="text-strong font-medium">
              {roomName || purpose.label}
            </span>
          ),
        },
        {
          label: 'Descrição',
          value: (
            <span className="text-ink leading-snug">
              {purpose.contextDescription}
            </span>
          ),
        },
      ]
    : [
        {
          label: '—',
          value: <span className="text-muted">Nenhuma sala configurada.</span>,
        },
      ]

  return (
    <EditableSummarySection
      title="Primeira sala"
      icon={MessageSquare}
      editLabel="Editar primeira sala"
      onEdit={onEdit}
      rows={rows}
    />
  )
}
