import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { auth } from '../../../shared/firebase/app'
import {
  TAG_CATALOG,
  TAG_COLOR_PRESETS,
  looksLikePrincipalProfile,
} from '../model/userTags'
import {
  claimPrincipalAccount,
  createCustomTag,
  loadPrincipalUid,
  setUserTagDisplayOrder,
  setUserTags,
  subscribeTagCatalog,
  subscribeUserTags,
} from '../model/userTagsStore'
import { usePrincipal } from '../hooks/usePrincipal'
import { flashToast } from '../../../shared/utils/toast'
import { UserTagChips } from './UserTagChips'

/**
 * Principal: toggle / create tags.
 * Tag owner (self): reorder display order.
 */
export function TagAssignPanel({
  targetUserId,
  currentUserId,
  selfProfile = null,
  compact = false,
}) {
  const [tags, setTags] = useState([])
  const [catalog, setCatalog] = useState(TAG_CATALOG)
  const [busy, setBusy] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLOR_PRESETS[0])
  const meProfile = selfProfile || {
    displayName: auth.currentUser?.displayName || '',
    handle: '',
  }
  const { isPrincipal, canClaim, claim, ready } = usePrincipal(currentUserId, meProfile)
  const isSelf = !!(targetUserId && currentUserId && targetUserId === currentUserId)

  useEffect(() => {
    if (!targetUserId) {
      setTags([])
      return undefined
    }
    return subscribeUserTags(targetUserId, setTags)
  }, [targetUserId])

  useEffect(() => subscribeTagCatalog(setCatalog), [])

  useEffect(() => {
    if (!ready || isPrincipal || !canClaim || !currentUserId) return undefined
    let cancelled = false
    ;(async () => {
      try {
        setClaiming(true)
        await claim()
      } catch {
        /* toast already shown */
      } finally {
        if (!cancelled) setClaiming(false)
      }
    })()
    return () => { cancelled = true }
  }, [ready, isPrincipal, canClaim, currentUserId, claim])

  if (!targetUserId) return null

  const handleReorder = async (ids) => {
    if (!isSelf || busy) return
    setBusy(true)
    const prev = tags
    setTags((list) => {
      const byId = Object.fromEntries(list.map((t) => [t.id, t]))
      return ids.map((id) => byId[id]).filter(Boolean)
    })
    try {
      const updated = await setUserTagDisplayOrder(targetUserId, ids)
      setTags(updated)
    } catch (err) {
      setTags(prev)
      flashToast(err?.message || 'Não deu pra reordenar')
    } finally {
      setBusy(false)
    }
  }

  const selfOrderBlock = isSelf && tags.length > 0 ? (
    <div className={compact ? 'mt-3' : 'mt-4'}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
        Ordem das tags
      </p>
      <p className="text-[11px] text-muted mb-2.5 leading-snug">
        Arraste para escolher o que aparece primeiro no seu perfil.
      </p>
      <UserTagChips tags={tags} reorderable onReorder={handleReorder} />
    </div>
  ) : null

  if (!ready || claiming) {
    return (
      <>
        {selfOrderBlock}
        {!isSelf && (
          <div className={compact ? 'mt-3' : 'mt-4'}>
            <p className="text-[11px] text-muted">Preparando tags…</p>
          </div>
        )}
      </>
    )
  }

  if (!isPrincipal) {
    if (isSelf) return selfOrderBlock
    if (!looksLikePrincipalProfile(meProfile)) return null
    return (
      <div className={compact ? 'mt-3' : 'mt-4'}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-2">
          Gerenciar tags
        </p>
        <p className="text-[12px] text-muted mb-2 leading-snug">
          Ative a conta principal (Ethan) para atribuir tags.
        </p>
        <button
          type="button"
          disabled={claiming}
          onClick={async () => {
            setClaiming(true)
            try {
              await claimPrincipalAccount(meProfile)
            } catch (err) {
              flashToast(err?.message || 'Não deu pra ativar')
            } finally {
              setClaiming(false)
            }
          }}
          className="h-9 px-3.5 rounded-xl text-[12.5px] font-semibold bg-accent text-strong hover:opacity-90 disabled:opacity-50"
        >
          Ativar conta principal
        </button>
      </div>
    )
  }

  const active = new Set(tags.map((t) => t.id))
  const byId = Object.fromEntries(catalog.map((t) => [t.id, t]))

  const toggle = async (tag) => {
    if (busy || !tag?.id) return
    setBusy(true)
    try {
      await loadPrincipalUid()
      const turningOn = !active.has(tag.id)
      const next = turningOn
        ? [...tags.filter((t) => t.id !== tag.id), tag]
        : tags.filter((t) => t.id !== tag.id)
      const updated = await setUserTags(targetUserId, next, {
        assignedBy: currentUserId || auth.currentUser?.uid,
      })
      setTags(updated)
      flashToast(turningOn ? `Tag “${tag.label}” adicionada` : 'Tag removida')
    } catch (err) {
      const code = err?.code || ''
      const msg = code.includes('permission')
        ? 'Sem permissão — ative a conta principal em Configurações → Conta'
        : (err?.message || 'Não deu pra salvar a tag')
      flashToast(msg)
      console.warn('[tags]', err)
    } finally {
      setBusy(false)
    }
  }

  const submitCustom = async (e) => {
    e?.preventDefault?.()
    if (busy) return
    setBusy(true)
    try {
      const created = await createCustomTag({ label: newLabel, color: newColor })
      setCatalog((prev) => {
        if (prev.some((t) => t.id === created.id)) return prev
        return [...prev, created]
      })
      setNewLabel('')
      setCreating(false)
      flashToast(`Tag “${created.label}” criada`)
      await toggle(created)
    } catch (err) {
      flashToast(err?.message || 'Não deu pra criar a tag')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {selfOrderBlock}
      <div className={compact ? 'mt-3' : 'mt-4'}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted mb-1">
          Gerenciar tags
        </p>
        <p className="text-[11px] text-muted mb-2.5 leading-snug">
          Clique para ligar ou desligar. Crie tags novas se quiser.
        </p>
        {tags.length > 0 && !isSelf && (
          <div className="mb-2.5">
            <UserTagChips tags={tags} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {catalog.map((tag) => {
            const on = active.has(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                disabled={busy}
                onClick={() => toggle(byId[tag.id] || tag)}
                title={on ? `Remover ${tag.label}` : `Atribuir ${tag.label}`}
                aria-pressed={on}
                className={[
                  'h-8 px-3 rounded-full text-[12px] font-semibold border transition-[transform,background-color,border-color,color] duration-150',
                  'hover:scale-[1.03] active:scale-[0.97] cursor-pointer',
                  'disabled:opacity-50 disabled:pointer-events-none',
                ].join(' ')}
                style={{
                  borderColor: on ? tag.color : 'rgba(255,255,255,0.18)',
                  background: on ? `${tag.color}33` : 'rgba(255,255,255,0.04)',
                  color: on ? tag.color : 'rgba(255,255,255,0.75)',
                }}
              >
                {on ? '✓ ' : '+ '}{tag.label}
              </button>
            )
          })}
          {!creating && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setCreating(true)}
              className="h-8 px-3 rounded-full text-[12px] font-semibold border border-dashed border-white/25 text-muted hover:text-strong hover:border-white/40 inline-flex items-center gap-1"
            >
              <Plus size={12} />
              Nova tag
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={submitCustom} className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2.5">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nome da tag"
              maxLength={24}
              className="w-full h-9 px-3 rounded-lg bg-black/30 border border-white/10 text-[13px] text-strong placeholder:text-muted outline-none focus:border-accent/50"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={`Cor ${c}`}
                  className={[
                    'w-6 h-6 rounded-full border-2 transition-transform',
                    newColor === c ? 'scale-110 border-white' : 'border-transparent opacity-80 hover:opacity-100',
                  ].join(' ')}
                  style={{ background: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busy || !newLabel.trim()}
                className="h-8 px-3 rounded-lg text-[12px] font-semibold bg-accent text-strong disabled:opacity-40"
              >
                Criar e atribuir
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewLabel('') }}
                className="h-8 px-3 rounded-lg text-[12px] font-medium text-muted hover:text-strong"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
