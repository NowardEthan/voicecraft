import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import {
  subscribeSpaceRoles,
  setMemberRoleIds,
} from '../../spaces/model/spaceRolesStore'
import { flashToast } from '../../../shared/utils/toast'

/**
 * Assign Space roles to a member (assign_roles permission).
 */
export function RoleAssignPanel({
  space,
  member,
  currentUserId,
  canAssign = false,
  actorPerms = null,
  compact = false,
}) {
  const [roles, setRoles] = useState([])
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(() => new Set(member?.roleIds || []))

  useEffect(() => {
    if (!space?.id) {
      setRoles([])
      return undefined
    }
    return subscribeSpaceRoles(space.id, setRoles)
  }, [space?.id])

  useEffect(() => {
    setSelected(new Set(member?.roleIds || []))
  }, [member?.userId, member?.roleIds])

  if (!space?.id || !member?.userId) return null
  if (space.createdBy === member.userId) return null
  if (!canAssign) return null
  if (roles.length === 0) {
    return (
      <div className={compact ? 'mt-3' : 'mt-4'}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-1.5">
          Cargo neste Space
        </p>
        <p className="text-[12px] text-muted leading-snug">
          Nenhum cargo criado ainda. Defina em Configurações → Cargos.
        </p>
      </div>
    )
  }

  const toggle = async (roleId) => {
    if (busy) return
    const next = new Set(selected)
    if (next.has(roleId)) next.delete(roleId)
    else next.add(roleId)
    const ids = [...next]
    setSelected(next)
    setBusy(true)
    try {
      await setMemberRoleIds(space.id, member.userId, ids, {
        actorUid: currentUserId,
        actorPerms,
        space,
      })
      flashToast('Cargos atualizados')
    } catch (err) {
      setSelected(new Set(member?.roleIds || []))
      flashToast(err?.message || 'Não deu pra atribuir')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={compact ? 'mt-3' : 'mt-4'}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
        Cargo neste Space
      </p>
      <p className="text-[11px] text-muted mb-2.5 leading-snug inline-flex items-center gap-1.5">
        <Shield size={11} className="opacity-70" />
        Só vale dentro de {space.name || 'este Space'}.
      </p>
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => {
          const on = selected.has(role.id)
          return (
            <button
              key={role.id}
              type="button"
              disabled={busy}
              onClick={() => toggle(role.id)}
              aria-pressed={on}
              className={[
                'h-8 px-3 rounded-full text-[12px] font-semibold border transition-[transform,background-color] duration-150',
                'hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50',
              ].join(' ')}
              style={{
                borderColor: on ? role.color : 'rgba(255,255,255,0.18)',
                background: on ? `${role.color}33` : 'rgba(255,255,255,0.04)',
                color: on ? role.color : 'rgba(255,255,255,0.75)',
              }}
            >
              {on ? '✓ ' : '+ '}{role.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
