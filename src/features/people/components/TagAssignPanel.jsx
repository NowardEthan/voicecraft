import { useEffect, useRef, useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
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
  removeCustomTag,
  setUserTagDisplayOrder,
  setUserTags,
  subscribeTagCatalog,
  subscribeUserTags,
} from '../model/userTagsStore'
import { usePrincipal } from '../hooks/usePrincipal'
import { flashToast } from '../../../shared/utils/toast'
import { UserTagChips } from './UserTagChips'

function contrastOn(hex) {
  const h = String(hex || '#888').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return '#fff'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.62 ? '#0b0b0f' : '#ffffff'
}

/**
 * Principal: + opens tag picker (toggle / create / delete custom).
 * Tag owner (self): reorder display order on the chip row.
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLOR_PRESETS[0])
  const menuRef = useRef(null)

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

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
        setCreating(false)
      }
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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

  const sectionPad = compact ? 'mt-3' : 'mt-4'

  if (!ready || claiming) {
    return (
      <div className={sectionPad}>
        {tags.length > 0 && (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80 mb-2">
              {isSelf ? 'Suas tags' : 'Tags'}
            </p>
            <UserTagChips tags={tags} reorderable={isSelf} onReorder={isSelf ? handleReorder : undefined} />
          </>
        )}
        {!isSelf && (
          <p className="text-[11px] text-muted mt-1">Preparando tags…</p>
        )}
      </div>
    )
  }

  if (!isPrincipal) {
    if (isSelf) {
      if (tags.length === 0) return null
      return (
        <div className={sectionPad}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80 mb-2">
            Suas tags
          </p>
          <UserTagChips tags={tags} reorderable onReorder={handleReorder} />
          <p className="text-[10.5px] text-muted mt-1.5">Arraste para reordenar</p>
        </div>
      )
    }
    if (!looksLikePrincipalProfile(meProfile)) {
      if (tags.length === 0) return null
      return (
        <div className={sectionPad}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80 mb-2">
            Tags
          </p>
          <UserTagChips tags={tags} />
        </div>
      )
    }
    return (
      <div className={sectionPad}>
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

  const deleteCustom = async (tag) => {
    if (busy || !tag?.custom) return
    if (!window.confirm(`Excluir a tag “${tag.label}” do catálogo?`)) return
    setBusy(true)
    try {
      await removeCustomTag(tag.id)
      setCatalog((prev) => prev.filter((t) => t.id !== tag.id))
      if (active.has(tag.id)) {
        const updated = await setUserTags(
          targetUserId,
          tags.filter((t) => t.id !== tag.id),
          { assignedBy: currentUserId || auth.currentUser?.uid },
        )
        setTags(updated)
      }
      flashToast(`Tag “${tag.label}” excluída`)
    } catch (err) {
      flashToast(err?.message || 'Não deu pra excluir')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={sectionPad}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/80">
          {isSelf ? 'Suas tags' : 'Tags'}
        </p>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMenuOpen((o) => !o)
              setCreating(false)
            }}
            title="Gerenciar tags"
            aria-label="Gerenciar tags"
            aria-expanded={menuOpen}
            className={[
              'w-7 h-7 rounded-lg inline-flex items-center justify-center transition-colors',
              'border border-white/[0.1] text-muted hover:text-strong hover:bg-white/[0.06]',
              menuOpen ? 'bg-white/[0.08] text-strong border-white/20' : '',
              'disabled:opacity-50',
            ].join(' ')}
          >
            {menuOpen ? <X size={14} strokeWidth={2.2} /> : <Plus size={14} strokeWidth={2.2} />}
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-[calc(100%+6px)] z-30 w-[240px] rounded-xl border border-white/[0.1] bg-[#12141a] shadow-2xl shadow-black/50 overflow-hidden"
              role="dialog"
              aria-label="Gerenciar tags"
            >
              <div className="px-3 py-2 border-b border-white/[0.06]">
                <p className="text-[11px] font-semibold text-strong">Gerenciar tags</p>
                <p className="text-[10px] text-muted mt-0.5">Toque pra atribuir · lixeira remove custom</p>
              </div>

              <div className="max-h-[220px] overflow-y-auto overscroll-contain py-1">
                {catalog.map((tag) => {
                  const on = active.has(tag.id)
                  const isCustom = !!tag.custom || String(tag.id || '').startsWith('c_')
                  return (
                    <div
                      key={tag.id}
                      className="flex items-center gap-1 px-1.5"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggle(byId[tag.id] || tag)}
                        className={[
                          'flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                          'hover:bg-white/[0.05] disabled:opacity-50',
                        ].join(' ')}
                      >
                        <span
                          className="shrink-0 inline-flex items-center justify-center h-[18px] px-1.5 rounded-md text-[8.5px] font-bold uppercase tracking-wider"
                          style={{
                            background: tag.color,
                            color: contrastOn(tag.color),
                          }}
                        >
                          {tag.label}
                        </span>
                        <span className="flex-1 min-w-0" />
                        <span
                          className={[
                            'shrink-0 w-4 h-4 rounded-md border inline-flex items-center justify-center',
                            on ? 'border-transparent bg-accent text-strong' : 'border-white/20 text-transparent',
                          ].join(' ')}
                        >
                          <Check size={10} strokeWidth={3} />
                        </span>
                      </button>
                      {isCustom && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => deleteCustom(tag)}
                          title={`Excluir “${tag.label}”`}
                          aria-label={`Excluir tag ${tag.label}`}
                          className="shrink-0 w-7 h-7 rounded-lg text-muted hover:text-danger hover:bg-danger/10 inline-flex items-center justify-center disabled:opacity-40"
                        >
                          <Trash2 size={12} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-white/[0.06] p-2">
                {!creating ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setCreating(true)}
                    className="w-full h-8 rounded-lg text-[12px] font-semibold text-muted hover:text-strong hover:bg-white/[0.05] inline-flex items-center justify-center gap-1.5 border border-dashed border-white/15"
                  >
                    <Plus size={12} />
                    Nova tag
                  </button>
                ) : (
                  <form onSubmit={submitCustom} className="space-y-2">
                    <input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Nome da tag"
                      maxLength={24}
                      className="w-full h-8 px-2.5 rounded-lg bg-black/35 border border-white/10 text-[12.5px] text-strong placeholder:text-muted outline-none focus:border-accent/50"
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-1">
                      {TAG_COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewColor(c)}
                          aria-label={`Cor ${c}`}
                          className={[
                            'w-5 h-5 rounded-full border-2 transition-transform',
                            newColor === c ? 'scale-110 border-white' : 'border-transparent opacity-80 hover:opacity-100',
                          ].join(' ')}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="submit"
                        disabled={busy || !newLabel.trim()}
                        className="flex-1 h-8 rounded-lg text-[12px] font-semibold bg-accent text-strong disabled:opacity-40"
                      >
                        Criar
                      </button>
                      <button
                        type="button"
                        onClick={() => { setCreating(false); setNewLabel('') }}
                        className="h-8 px-2.5 rounded-lg text-[12px] font-medium text-muted hover:text-strong"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {tags.length > 0 ? (
        <>
          <UserTagChips
            tags={tags}
            reorderable={isSelf}
            onReorder={isSelf ? handleReorder : undefined}
          />
          {isSelf && (
            <p className="text-[10.5px] text-muted mt-1.5">Arraste para reordenar</p>
          )}
        </>
      ) : (
        <p className="text-[12px] text-muted">Nenhuma tag ainda — use o + pra adicionar</p>
      )}
    </div>
  )
}
