import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { defaultAutopurge, readAutopurgeFromSpace, normalizeAutopurge } from './chatAutomation'
import { flashToast } from '../../../shared/utils/toast'

export default function AutopurgeSettings({
  space,
  room,
  signaling,
  canModerateChat = false,
}) {
  const [draft, setDraft] = useState(() => readAutopurgeFromSpace(space))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(readAutopurgeFromSpace(space))
  }, [space?.id, space?.chatAutomation])

  if (!canModerateChat) {
    return (
      <div className="rounded-xl border border-line bg-surface1/60 p-4 text-[12.5px] text-muted leading-relaxed">
        Só quem tem <span className="text-ink font-medium">Moderar chat</span> ou
        {' '}é criador pode configurar automações.
      </div>
    )
  }

  const setField = (key, value) => {
    setDraft((prev) => normalizeAutopurge({ ...prev, [key]: value }))
  }

  const roomOnly = () => {
    const id = room?.id
    if (!id) return
    setDraft((prev) => normalizeAutopurge({
      ...prev,
      roomIds: [id],
    }))
  }

  const allRooms = () => {
    setDraft((prev) => normalizeAutopurge({ ...prev, roomIds: 'all' }))
  }

  const handleSave = async () => {
    if (!signaling?.updateChatAutomation) {
      flashToast('Cliente sem suporte a automações')
      return
    }
    setSaving(true)
    try {
      await signaling.updateChatAutomation(space?.id, draft)
      flashToast('Autopurge salvo')
    } catch (err) {
      flashToast(err?.message || 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const scopeLabel = draft.roomIds === 'all'
    ? 'Todas as salas de texto'
    : Array.isArray(draft.roomIds) && draft.roomIds.includes(room?.id)
      ? 'Só esta sala'
      : `${Array.isArray(draft.roomIds) ? draft.roomIds.length : 0} salas`

  return (
    <div className="rounded-xl border border-line bg-surface1/80 p-3.5 space-y-3.5">
      <p className="text-[11.5px] text-muted leading-snug">
        Apaga automaticamente mensagens antigas no intervalo escolhido.
        A execução confiável depende da Cloud Function agendada.
      </p>

      <label className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-ink">Ativado</span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          onClick={() => setField('enabled', !draft.enabled)}
          className={[
            'relative w-10 h-6 rounded-full transition-colors',
            draft.enabled ? 'bg-[var(--vc-positive)]' : 'bg-surface2 border border-line',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
              draft.enabled ? 'translate-x-4' : '',
            ].join(' ')}
          />
        </button>
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted">Rodar a cada (horas)</span>
        <input
          type="number"
          min={1}
          max={168}
          value={draft.everyHours}
          onChange={(e) => setField('everyHours', e.target.value)}
          className="w-full rounded-lg bg-surface2 border border-line px-3 py-2 text-[12.5px] text-ink outline-none"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] text-muted">Apagar msgs mais velhas que (horas)</span>
        <input
          type="number"
          min={1}
          max={720}
          value={draft.olderThanHours}
          onChange={(e) => setField('olderThanHours', e.target.value)}
          className="w-full rounded-lg bg-surface2 border border-line px-3 py-2 text-[12.5px] text-ink outline-none"
        />
      </label>

      <div className="space-y-1.5">
        <div className="text-[11px] text-muted">Escopo · {scopeLabel}</div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={allRooms}
            className={[
              'flex-1 h-8 rounded-lg text-[11.5px] font-medium border transition-colors',
              draft.roomIds === 'all'
                ? 'bg-surface2 border-line text-strong'
                : 'border-transparent text-muted hover:bg-white/[0.04]',
            ].join(' ')}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={roomOnly}
            className={[
              'flex-1 h-8 rounded-lg text-[11.5px] font-medium border transition-colors',
              Array.isArray(draft.roomIds)
                ? 'bg-surface2 border-line text-strong'
                : 'border-transparent text-muted hover:bg-white/[0.04]',
            ].join(' ')}
          >
            Só esta sala
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="w-full h-9 rounded-lg bg-[var(--space-accent,#32c48d)] text-[12.5px] font-semibold text-[var(--vc-bg-canvas,#0a0a0a)] disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Salvar
      </button>

      <p className="text-[10.5px] text-muted leading-snug">
        Padrão: {defaultAutopurge().everyHours}h / msgs &gt; {defaultAutopurge().olderThanHours}h.
        Deploy da function <code className="text-ink">scheduledChatAutopurge</code> necessário para o cron.
      </p>
    </div>
  )
}
