import { useEffect, useState } from 'react'
import { Plus, Trash2, Shield } from 'lucide-react'
import {
  ROLE_COLOR_PRESETS,
  SPACE_PERMISSIONS,
  emptyPerms,
} from '../model/spaceRoles'
import {
  createSpaceRole,
  deleteSpaceRole,
  subscribeSpaceRoles,
  updateSpaceRole,
} from '../model/spaceRolesStore'
import { flashToast } from '../../../shared/utils/toast'

/**
 * Creator-only editor for Space role definitions.
 */
export function SpaceRolesPanel({ spaceId, enabled = true }) {
  const [roles, setRoles] = useState([])
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!spaceId || !enabled) {
      setRoles([])
      return undefined
    }
    return subscribeSpaceRoles(spaceId, setRoles)
  }, [spaceId, enabled])

  if (!enabled) {
    return (
      <p className="text-[13px] text-muted">
        Só o criador do Space pode definir cargos.
      </p>
    )
  }

  const startCreate = () => {
    setCreating(true)
    setEditingId(null)
    setDraft({
      name: '',
      color: ROLE_COLOR_PRESETS[0],
      permissions: emptyPerms(),
    })
  }

  const startEdit = (role) => {
    setCreating(false)
    setEditingId(role.id)
    setDraft({
      name: role.name,
      color: role.color,
      permissions: { ...emptyPerms(), ...role.permissions },
    })
  }

  const cancel = () => {
    setCreating(false)
    setEditingId(null)
    setDraft(null)
  }

  const togglePerm = (key) => {
    setDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          [key]: !prev.permissions[key],
        },
      }
    })
  }

  const save = async () => {
    if (!draft || busy) return
    setBusy(true)
    try {
      if (creating) {
        await createSpaceRole(spaceId, draft)
        flashToast('Cargo criado')
      } else if (editingId) {
        await updateSpaceRole(spaceId, editingId, draft)
        flashToast('Cargo atualizado')
      }
      cancel()
    } catch (err) {
      flashToast(err?.message || 'Não deu pra salvar o cargo')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (roleId) => {
    if (busy) return
    if (!window.confirm('Apagar este cargo? Quem tinha perde as permissões.')) return
    setBusy(true)
    try {
      await deleteSpaceRole(spaceId, roleId)
      if (editingId === roleId) cancel()
      flashToast('Cargo removido')
    } catch (err) {
      flashToast(err?.message || 'Não deu pra apagar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <SectionLabel>Cargos deste Space</SectionLabel>
          <p className="text-[12px] text-muted -mt-1.5 mb-1 leading-snug">
            Defina o que cada cargo pode fazer. Atribua no perfil de cada pessoa.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={startCreate}
            disabled={busy}
            className="h-8 px-2.5 rounded-lg text-[12px] font-semibold inline-flex items-center gap-1 bg-accent text-strong shrink-0"
          >
            <Plus size={13} />
            Novo
          </button>
        )}
      </div>

      {roles.length === 0 && !draft && (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <Shield size={20} className="mx-auto text-muted mb-2" />
          <p className="text-[13px] text-strong font-medium">Nenhum cargo ainda</p>
          <p className="text-[12px] text-muted mt-1">Crie Moderador, Staff, VIP… do jeito que quiser.</p>
        </div>
      )}

      <ul className="space-y-2">
        {roles.map((role) => (
          <li
            key={role.id}
            className={[
              'rounded-xl border px-3.5 py-3',
              editingId === role.id ? 'border-accent/40 bg-accent/5' : 'border-white/[0.08] bg-white/[0.02]',
            ].join(' ')}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: role.color }}
              />
              <p className="flex-1 min-w-0 text-[13.5px] font-semibold text-strong truncate">
                {role.name}
              </p>
              <button
                type="button"
                onClick={() => startEdit(role)}
                className="h-7 px-2 rounded-md text-[11.5px] font-medium text-muted hover:text-strong hover:bg-white/[0.06]"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => remove(role.id)}
                disabled={busy}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10"
                aria-label={`Apagar ${role.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted leading-snug">
              {SPACE_PERMISSIONS.filter((p) => role.permissions?.[p.id]).map((p) => p.label).join(' · ')
                || 'Sem permissões'}
            </p>
          </li>
        ))}
      </ul>

      {draft && (
        <div className="rounded-xl border border-white/[0.1] bg-black/25 p-4 space-y-3.5">
          <p className="text-[12px] font-semibold text-strong">
            {creating ? 'Novo cargo' : 'Editar cargo'}
          </p>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Nome do cargo"
            maxLength={32}
            className="w-full h-9 px-3 rounded-lg bg-black/30 border border-white/10 text-[13px] text-strong placeholder:text-muted outline-none focus:border-accent/50"
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {ROLE_COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, color: c }))}
                aria-label={`Cor ${c}`}
                className={[
                  'w-6 h-6 rounded-full border-2 transition-transform',
                  draft.color === c ? 'scale-110 border-white' : 'border-transparent opacity-80',
                ].join(' ')}
                style={{ background: c }}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            {SPACE_PERMISSIONS.map((perm) => {
              const on = !!draft.permissions[perm.id]
              return (
                <button
                  key={perm.id}
                  type="button"
                  onClick={() => togglePerm(perm.id)}
                  aria-pressed={on}
                  className={[
                    'w-full flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    on ? 'border-accent/35 bg-accent/10' : 'border-white/[0.06] hover:bg-white/[0.03]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold shrink-0',
                      on ? 'bg-accent border-accent text-strong' : 'border-white/25 text-transparent',
                    ].join(' ')}
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-semibold text-strong">{perm.label}</span>
                    <span className="block text-[11px] text-muted mt-0.5">{perm.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy || !draft.name.trim()}
              onClick={save}
              className="h-9 px-3.5 rounded-lg text-[12.5px] font-semibold bg-accent text-strong disabled:opacity-40"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={cancel}
              className="h-9 px-3 rounded-lg text-[12.5px] font-medium text-muted hover:text-strong"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted mb-3">
      {children}
    </p>
  )
}
