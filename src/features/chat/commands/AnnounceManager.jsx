import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Trash2, Megaphone, Image as ImageIcon, ChevronRight,
  CalendarClock, Send,
} from 'lucide-react'
import AnnounceEditor from './AnnounceEditor'
import { normalizeAnnounce, announcePreviewText } from '../announceSchema.js'
import { SpaceIcon } from '../../spaces/model/spaceIcons'
import { flashToast } from '../../../shared/utils/toast'

function isAnnounceMsg(m) {
  if (!m || m.deleted) return false
  return m.kind === 'announce' || !!m.announce
}

function formatWhen(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function AnnounceRow({
  a,
  subtitle,
  busy,
  onEdit,
  onDelete,
  deleteLabel = 'Apagar',
  extraActions = null,
}) {
  return (
    <li className="rounded-xl border border-line bg-[#14171f] overflow-hidden">
      {a.cover ? (
        <div className="h-16 w-full relative overflow-hidden">
          <img
            src={a.cover}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#14171f] to-transparent" />
        </div>
      ) : null}
      <div className="p-3 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden border border-line"
            style={{
              background: `color-mix(in srgb, ${a.accent || '#f5b942'} 18%, #1a1e28)`,
              color: a.accent || '#f5b942',
            }}
          >
            {a.iconImage ? (
              <img src={a.iconImage} alt="" className="w-full h-full object-cover" />
            ) : a.iconValue ? (
              <SpaceIcon value={a.iconValue} size={18} />
            ) : (
              <span className="text-[16px]">{a.icon || '📣'}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {a.badge ? (
                <span
                  className="inline-flex h-4 px-1.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
                  style={{
                    color: a.badgeColor || a.accent,
                    background: `color-mix(in srgb, ${a.badgeColor || a.accent} 22%, #111)`,
                  }}
                >
                  {a.badge}
                </span>
              ) : null}
              {!a.cover && (
                <span className="text-muted inline-flex items-center gap-0.5 text-[10px]">
                  <ImageIcon size={10} /> sem cover
                </span>
              )}
            </div>
            <div className="text-[13px] font-semibold text-strong truncate mt-0.5">
              {a.title || announcePreviewText(a) || 'Anúncio'}
            </div>
            <div className="text-[10.5px] text-muted truncate">{subtitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            className="flex-1 min-w-[7rem] h-8 inline-flex items-center justify-center gap-1.5 rounded-lg border border-line bg-[#1a1e28] text-[11.5px] font-medium text-ink hover:bg-[#222833] disabled:opacity-40"
          >
            <Pencil size={12} />
            Editar
            <ChevronRight size={12} className="opacity-50" />
          </button>
          {extraActions}
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-[var(--vc-danger)]/30 text-[var(--vc-danger)] hover:bg-[var(--vc-danger)]/10 disabled:opacity-40"
            aria-label={deleteLabel}
            title={deleteLabel}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </li>
  )
}

/**
 * Hub for room announcements: scheduled + published, edit / cancel / publish.
 */
export default function AnnounceManager({
  signaling,
  space,
  room,
  members = [],
  chat,
  currentUserId,
  currentUserName,
  currentUserPhoto,
}) {
  const [mode, setMode] = useState('list') // list | create | edit | edit-scheduled
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [scheduled, setScheduled] = useState([])
  const [loadingScheduled, setLoadingScheduled] = useState(false)

  const published = useMemo(() => {
    const list = (chat?.messages || []).filter(isAnnounceMsg)
    return [...list].sort((a, b) => (b.ts || 0) - (a.ts || 0))
  }, [chat?.messages])

  const refreshScheduled = useCallback(async () => {
    if (!signaling?.listScheduledAnnouncements || !room?.id) {
      setScheduled([])
      return
    }
    setLoadingScheduled(true)
    try {
      const list = await signaling.listScheduledAnnouncements(room.id)
      setScheduled(Array.isArray(list) ? list : [])
    } catch (err) {
      console.warn('[AnnounceManager] scheduled', err)
      setScheduled([])
    } finally {
      setLoadingScheduled(false)
    }
  }, [signaling, room?.id])

  useEffect(() => {
    if (mode !== 'list') return undefined
    refreshScheduled()
    return undefined
  }, [mode, refreshScheduled])

  const openCreate = () => {
    setEditing(null)
    setMode('create')
  }

  const openEditPublished = (msg) => {
    setEditing(msg)
    setMode('edit')
  }

  const openEditScheduled = (item) => {
    setEditing(item)
    setMode('edit-scheduled')
  }

  const backToList = () => {
    setEditing(null)
    setMode('list')
  }

  const handleDeletePublished = async (msg) => {
    const id = msg?.id || msg?.firestoreId
    if (!id || busyId) return
    const title = normalizeAnnounce(msg.announce).title || announcePreviewText(msg.announce) || 'este anúncio'
    if (!window.confirm(`Apagar “${title}”?`)) return
    setBusyId(id)
    try {
      await chat?.deleteMessage?.(id, { moderate: true })
      flashToast('Anúncio apagado')
    } catch (err) {
      flashToast(err?.message || 'Falha ao apagar')
    } finally {
      setBusyId(null)
    }
  }

  const handleCancelScheduled = async (item) => {
    const id = item?.id || item?.firestoreId
    if (!id || busyId) return
    const a = normalizeAnnounce(item.announce || {})
    const title = a.title || announcePreviewText(a) || 'este anúncio'
    if (!window.confirm(`Cancelar o agendamento de “${title}”?`)) return
    setBusyId(id)
    try {
      await signaling.cancelScheduledAnnouncement(room?.id, id)
      flashToast('Agendamento cancelado')
      await refreshScheduled()
    } catch (err) {
      flashToast(err?.message || 'Falha ao cancelar')
    } finally {
      setBusyId(null)
    }
  }

  const handlePublishNow = async (item) => {
    const id = item?.id || item?.firestoreId
    if (!id || busyId) return
    setBusyId(id)
    try {
      await signaling.publishScheduledAnnouncementNow(room?.id, id)
      flashToast('Anúncio publicado')
      await refreshScheduled()
    } catch (err) {
      flashToast(err?.message || 'Falha ao publicar')
    } finally {
      setBusyId(null)
    }
  }

  if (mode === 'create' || mode === 'edit' || mode === 'edit-scheduled') {
    return (
      <AnnounceEditor
        signaling={signaling}
        space={space}
        room={room}
        members={members}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserPhoto={currentUserPhoto}
        editingMessage={mode === 'edit' ? editing : null}
        editingScheduled={mode === 'edit-scheduled' ? editing : null}
        onBack={backToList}
        onPublished={backToList}
        onUpdated={backToList}
      />
    )
  }

  const empty = scheduled.length === 0 && published.length === 0 && !loadingScheduled

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={openCreate}
        className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-line bg-[#1a1e28] text-[12.5px] font-semibold text-strong hover:bg-[#222833] transition-colors"
      >
        <Plus size={15} strokeWidth={2.2} />
        Novo anúncio
      </button>

      {empty ? (
        <div className="rounded-xl border border-dashed border-line bg-[#14171f]/80 px-4 py-8 text-center space-y-2">
          <div className="mx-auto w-10 h-10 rounded-full bg-[#1a1e28] border border-line flex items-center justify-center text-muted">
            <Megaphone size={18} />
          </div>
          <div className="text-[13px] font-semibold text-strong">Nenhum anúncio ainda</div>
          <p className="text-[11.5px] text-muted leading-relaxed">
            Crie o primeiro card com cover, rich text e badge — ou agende para depois.
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 px-0.5">
              <CalendarClock size={12} className="text-muted" />
              <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                Agendados
                {scheduled.length > 0 ? ` · ${scheduled.length}` : ''}
              </h3>
            </div>
            {loadingScheduled ? (
              <p className="text-[11.5px] text-muted px-0.5">Carregando agendamentos…</p>
            ) : scheduled.length === 0 ? (
              <p className="text-[11.5px] text-muted px-0.5 leading-relaxed">
                Nenhum anúncio na fila. Ao agendar, ele aparece aqui pra editar, adiar ou cancelar.
              </p>
            ) : (
              <ul className="space-y-2">
                {scheduled.map((item) => {
                  const a = normalizeAnnounce(item.announce || {})
                  const id = item.id || item.firestoreId
                  const busy = busyId === id
                  return (
                    <AnnounceRow
                      key={id}
                      a={a}
                      busy={busy}
                      subtitle={`${a.authorName || 'Equipe'} · sai em ${formatWhen(item.publishAt)}`}
                      onEdit={() => openEditScheduled(item)}
                      onDelete={() => handleCancelScheduled(item)}
                      deleteLabel="Cancelar agendamento"
                      extraActions={(
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handlePublishNow(item)}
                          className="h-8 px-2.5 inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-[#1a1e28] text-[11.5px] font-medium text-ink hover:bg-[#222833] disabled:opacity-40"
                          title="Publicar agora"
                        >
                          <Send size={12} />
                          Agora
                        </button>
                      )}
                    />
                  )
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-1.5 px-0.5">
              <Megaphone size={12} className="text-muted" />
              <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                Publicados
                {published.length > 0 ? ` · ${published.length}` : ''}
              </h3>
            </div>
            {published.length === 0 ? (
              <p className="text-[11.5px] text-muted px-0.5">Nenhum anúncio publicado neste canal.</p>
            ) : (
              <ul className="space-y-2">
                {published.map((msg) => {
                  const a = normalizeAnnounce(msg.announce || {})
                  const id = msg.id || msg.firestoreId
                  const busy = busyId === id
                  return (
                    <AnnounceRow
                      key={id}
                      a={a}
                      busy={busy}
                      subtitle={`${a.authorName || msg.author || 'Equipe'}${msg.ts ? ` · ${formatWhen(msg.ts)}` : ''}${msg.edited ? ' · editado' : ''}`}
                      onEdit={() => openEditPublished(msg)}
                      onDelete={() => handleDeletePublished(msg)}
                    />
                  )
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
