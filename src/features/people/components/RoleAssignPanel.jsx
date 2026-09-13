import { useEffect, useMemo, useState } from 'react'
import { Shield, Lock } from 'lucide-react'
import {
  subscribeSpaceRoles,
  toggleMemberRole,
} from '../../spaces/model/spaceRolesStore'
import { roleAssignCapabilities, sortRolesByRank } from '../../spaces/model/spaceRoles'
import { flashToast } from '../../../shared/utils/toast'

/**
 * Show Space cargos on a profile.
 * Always visible (read-only). Assign toggles only for roles below the actor's rank.
 */
export function RoleAssignPanel({
  space,
  member,
  currentUserId,
  canAssign = false,
  actorPerms = null,
  actorRoleIds = null,
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

  const caps = useMemo(() => roleAssignCapabilities({
    space,
    actorUid: currentUserId,
    actorRoleIds: actorRoleIds || [],
    targetUid: member?.userId,
    targetRoleIds: member?.roleIds || [],
    roles,
  }), [space, currentUserId, actorRoleIds, member?.userId, member?.roleIds, roles])

  if (!space?.id || !member?.userId) return null
  if (space.createdBy === member.userId) {
    return (
      <div className={compact ? 'mt-3' : 'mt-4'}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-1.5">
          Cargo neste Space
        </p>
        <p className="text-[12px] text-muted leading-snug">
          O criador está acima de todos os cargos.
        </p>
      </div>
    )
  }

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

  const heldRoles = sortRolesByRank(roles.filter((r) => selected.has(r.id)))
  const showAssignUi = canAssign && caps.canManageTarget && caps.assignable.length > 0

  const toggle = async (roleId) => {
    if (busy || !showAssignUi) return
    const next = new Set(selected)
    if (next.has(roleId)) next.delete(roleId)
    else next.add(roleId)
    setSelected(next)
    setBusy(true)
    try {
      await toggleMemberRole(space.id, member.userId, roleId, {
        actorUid: currentUserId,
        actorPerms,
        actorRoleIds: actorRoleIds || [],
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
        {showAssignUi
          ? 'Só pode mexer em cargos abaixo do seu nível.'
          : `Só vale dentro de ${space.name || 'este Space'}.`}
      </p>

      {/* Always show held cargos so you and others can see them */}
      {heldRoles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {heldRoles.map((role) => {
            const locked = !caps.assignable.some((r) => r.id === role.id)
            return (
              <span
                key={`held-${role.id}`}
                className="h-7 px-2.5 rounded-full text-[11.5px] font-semibold border inline-flex items-center gap-1"
                style={{
                  borderColor: role.color,
                  background: `${role.color}33`,
                  color: role.color,
                }}
                title={locked && canAssign ? 'Acima ou no seu nível — só o criador / alguém acima pode alterar' : role.name}
              >
                {locked && canAssign ? <Lock size={10} /> : null}
                {role.name}
              </span>
            )
          })}
        </div>
      )}

      {!heldRoles.length && !showAssignUi && (
        <p className="text-[12px] text-muted mb-1">Sem cargo neste Space.</p>
      )}

      {showAssignUi && (
        <div className="flex flex-wrap gap-2">
          {caps.assignable.map((role) => {
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
      )}

      {canAssign && !caps.canManageTarget && heldRoles.length === 0 && (
        <p className="text-[11.5px] text-muted leading-snug">
          Esta pessoa está no seu nível ou acima — você não pode alterar os cargos dela.
        </p>
      )}
    </div>
  )
}
