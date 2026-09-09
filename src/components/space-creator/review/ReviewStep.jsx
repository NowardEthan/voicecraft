/**
 * ReviewStep — Etapa 3 do wizard "Criar Space".
 *
 * Layout (per spec):
 *   - 2 colunas equilibradas: minmax(0, 1fr) minmax(0, 1fr), gap 36px
 *   - Coluna esquerda: SpaceReviewPreview (banner + Salas section)
 *   - Coluna direita: Resumo com 2 seções (Identidade, Primeira sala)
 *     cada uma com botão "Editar" próprio
 *   - Aviso final: "Você poderá alterar essas configurações depois."
 *
 * Sem "BEM-VINDO(A)" — o Space ainda não foi criado.
 * Sem "Canais" — sempre "Salas" (termo do VoiceCraft).
 */
import { ShieldCheck } from 'lucide-react'
import { SpaceReviewPreview } from './SpaceReviewPreview.jsx'
import { IdentitySummary } from './IdentitySummary.jsx'
import { FirstRoomSummary } from './FirstRoomSummary.jsx'

export function ReviewStep({
  // Identity
  name,
  description,
  iconValue,
  theme,
  themeList,
  cover,
  coverFit,
  // First room
  firstRoomPurpose,
  firstRoomName,
  // Edit actions
  onEditIdentity,
  onEditFirstRoom,
}) {
  return (
    <div className="pt-3 space-y-5">
      <div>
        <h2 className="text-[22px] font-bold text-strong tracking-tight">
          Tudo certo para começar?
        </h2>
        <p className="text-[12.5px] text-muted mt-1.5">
          Confira os detalhes antes de criar seu Space.
        </p>
      </div>

      <div
        className="grid gap-9 pt-1"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
      >
        <div className="min-w-0">
          <SpaceReviewPreview
            name={name}
            description={description}
            iconValue={iconValue}
            theme={theme}
            cover={cover}
            coverFit={coverFit}
            firstRoomPurpose={firstRoomPurpose}
            firstRoomName={firstRoomName}
          />
        </div>

        <div className="min-w-0 flex flex-col gap-5">
          <div>
            <h3 className="text-[14.5px] font-semibold text-strong tracking-tight mb-3">
              Resumo
            </h3>
            <div className="space-y-5">
              <IdentitySummary
                name={name}
                theme={theme}
                iconValue={iconValue}
                onEdit={onEditIdentity}
                themeList={themeList}
              />
              <div className="h-px bg-line" aria-hidden />
              <FirstRoomSummary
                purposeKey={firstRoomPurpose}
                roomName={firstRoomName}
                onEdit={onEditFirstRoom}
              />
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11.5px] text-muted leading-relaxed pt-1">
            <ShieldCheck size={13} strokeWidth={1.75} className="shrink-0 mt-[1px]" />
            <span>Você poderá alterar essas configurações depois.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
