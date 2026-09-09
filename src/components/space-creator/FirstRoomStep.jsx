/**
 * FirstRoomStep — Etapa 2 do wizard "Criar Space".
 *
 * Layout (conforme spec do usuário):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Escolha o ponto de partida                                  │
 *   │ Você poderá criar outras salas depois.                     │
 *   │                                                            │
 *   │ [Conversa] [Voz] [Estudo] [Jogos] [Música]                 │  RoomTypeSelector (1 linha)
 *   │                                                            │
 *   │ Configure a primeira sala       │ Prévia                   │
 *   │ ┌─────────────────────────────┐ │ ┌─────────────────────┐  │
 *   │ │ Nome da sala           5/64 │ │ │                     │  │
 *   │ │ [geral_________________]    │ │ │   preview           │  │
 *   │ │                             │ │ │                     │  │
 *   │ │ ┌─[icon]─ Conversa ──────┐  │ │ │                     │  │
 *   │ │ │ descrição contextual    │  │ │ │                     │  │
 *   │ │ └────────────────────────┘  │ │ │                     │  │
 *   │ │ ⓘ Você poderá alterar...    │ │ │                     │  │
 *   │ └─────────────────────────────┘ │ └─────────────────────┘  │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Auto-suggest do nome: ao trocar de tipo, se o usuário AINDA não editou
 * manualmente, substituímos pelo DEFAULT_ROOM_NAMES[type]. Caso contrário
 * preservamos o nome customizado.
 */
import { useCallback } from 'react'
import { DEFAULT_ROOM_NAMES } from '../../features/rooms'
import { RoomTypeSelector } from './RoomTypeSelector.jsx'
import { RoomNameField } from './RoomNameField.jsx'
import { RoomTypeContext } from './RoomTypeContext.jsx'
import { RoomPreview } from './RoomPreview.jsx'

export { DEFAULT_ROOM_NAMES }

export function FirstRoomStep({
  types,
  typeKey,
  roomName,
  manuallyRenamed,
  onSelectType,
  onChangeName,
  onUserEditName,
}) {
  const handleSelectType = useCallback(
    (next) => {
      // Skip the deselect click (no type selected is not a useful state
      // for the user; spec says "Continuar" disables on no-type).
      onSelectType(next)
    },
    [onSelectType]
  )

  const selectedType = types.find((t) => t.key === typeKey) || null
  const roomNameForType = selectedType
    ? (manuallyRenamed ? roomName : (roomName || DEFAULT_ROOM_NAMES[typeKey]))
    : roomName

  return (
    <div className="pt-3 space-y-5">
      <div>
        <h2 className="text-[20px] font-bold text-strong tracking-tight">
          Escolha o ponto de partida
        </h2>
        <p className="text-[12.5px] text-muted mt-1">
          Você poderá criar outras salas depois.
        </p>
      </div>

      <RoomTypeSelector
        types={types}
        value={typeKey}
        onChange={handleSelectType}
      />

      <div
        className="grid gap-8 pt-1"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 0.92fr)' }}
      >
        <div className="space-y-4 min-w-0">
          <h3 className="text-[14.5px] font-semibold text-strong tracking-tight">
            Configure a primeira sala
          </h3>
          <RoomNameField
            value={roomNameForType}
            onChange={(v) => {
              onChangeName(v)
              onUserEditName()  // marks manuallyRenamed = true
            }}
          />
          <RoomTypeContext type={selectedType} />
        </div>

        {/* Subtle vertical divider between columns */}
        <div className="relative min-w-0 flex flex-col gap-3">
          <div
            aria-hidden
            className="absolute -left-4 top-0 bottom-0 w-px"
            style={{
              background:
                'linear-gradient(180deg, transparent 0%, var(--vc-border) 18%, var(--vc-border) 82%, transparent 100%)',
              opacity: 0.7,
            }}
          />
          <h3 className="text-[14.5px] font-semibold text-strong tracking-tight">
            Prévia
          </h3>
          <div className="flex-1 min-h-[280px]">
            <RoomPreview
              typeKey={typeKey}
              typeLabel={selectedType?.label}
              roomName={roomNameForType}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
