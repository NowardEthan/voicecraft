import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ImagePlus, Loader2, CalendarClock, Send, X, Upload, ChevronDown, User,
} from 'lucide-react'
import {
  ANNOUNCE_ACCENTS,
  ANNOUNCE_AUTHOR_MODES,
  ANNOUNCE_COVER_HEIGHT,
  emptyAnnounceDraft,
  normalizeAnnounce,
  htmlToPlainText,
} from '../announceSchema.js'
import AnnouncementCard from '../AnnouncementCard'
import AnnounceRichText from './AnnounceRichText'
import {
  SpaceCoverFitControls,
  SpaceCoverLayer,
} from '../../spaces/components/SpaceCoverLayer'
import { SpaceIconPicker } from '../../spaces/components/SpaceIconPicker'
import { SpaceIcon, getRecentIcons, pushRecentIcon } from '../../spaces/model/spaceIcons'
import { DEFAULT_COVER_FIT } from '../../spaces/model/spaceCover'
import { flashToast } from '../../../shared/utils/toast'

function toLocalInputValue(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function readImageFile(file, { maxBytes = 2.5 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Arquivo de imagem inválido'))
      return
    }
    if (file.size > maxBytes) {
      reject(new Error('Imagem até 2.5MB'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}

export default function AnnounceEditor({
  signaling,
  space,
  room,
  members = [],
  currentUserId,
  currentUserName,
  currentUserPhoto,
  editingMessage = null,
  onBack,
  onPublished,
  onUpdated,
}) {
  const editingId = editingMessage?.id || editingMessage?.firestoreId || null
  const isEditing = !!editingId

  const [draft, setDraft] = useState(() => emptyAnnounceDraft(
    editingMessage?.announce
      ? normalizeAnnounce(editingMessage.announce)
      : {
        authorMode: 'me',
        authorUserId: currentUserId || null,
        authorName: currentUserName || '',
        authorPhoto: currentUserPhoto || '',
      },
  ))
  const [saving, setSaving] = useState(false)
  const [scheduleOn, setScheduleOn] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [authorIconPickerOpen, setAuthorIconPickerOpen] = useState(false)
  const [iconRecents, setIconRecents] = useState(() => getRecentIcons())

  const coverRef = useRef(null)
  const iconUploadRef = useRef(null)
  const avatarUploadRef = useRef(null)
  const iconButtonRef = useRef(null)
  const authorAvatarRef = useRef(null)

  const authorUsesIconPicker = draft.authorMode === 'system' || draft.authorMode === 'custom'

  useEffect(() => {
    if (!editingMessage?.announce) return
    setDraft(normalizeAnnounce(editingMessage.announce))
    setScheduleOn(false)
  }, [editingId]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (partial) => {
    setDraft((prev) => normalizeAnnounce({ ...prev, ...partial }))
  }

  useEffect(() => {
    setDraft((prev) => {
      if (isEditing || prev.authorMode !== 'me') return prev
      return normalizeAnnounce({
        ...prev,
        authorUserId: currentUserId || null,
        authorName: currentUserName || prev.authorName,
        authorPhoto: currentUserPhoto || prev.authorPhoto,
      })
    })
  }, [currentUserId, currentUserName, currentUserPhoto, isEditing])

  const previewMsg = useMemo(() => ({
    kind: 'announce',
    ts: editingMessage?.ts || draft.scheduledFor || Date.now(),
    announce: normalizeAnnounce(draft),
  }), [draft, editingMessage?.ts])

  const canPublish = !!(
    draft.title.trim()
    || draft.body.trim()
    || htmlToPlainText(draft.bodyHtml).trim()
  )

  const handlePublish = async () => {
    if (!canPublish || saving) return
    const payload = normalizeAnnounce({
      ...draft,
      body: draft.body || htmlToPlainText(draft.bodyHtml),
      scheduledFor: !isEditing && scheduleOn && draft.scheduledFor ? draft.scheduledFor : null,
    })
    if (!isEditing && scheduleOn && (!payload.scheduledFor || payload.scheduledFor <= Date.now() + 30_000)) {
      flashToast('Agende pelo menos 30s no futuro')
      return
    }
    setSaving(true)
    try {
      if (isEditing) {
        await signaling.updateChatAnnouncement(room?.id, editingId, payload)
        flashToast('Anúncio atualizado')
        onUpdated?.()
      } else if (payload.scheduledFor) {
        await signaling.scheduleChatAnnouncement(room?.id, payload)
        flashToast('Anúncio agendado')
        onPublished?.()
      } else {
        await signaling.sendChatAnnouncement(room?.id, payload)
        flashToast('Anúncio publicado')
        setDraft(emptyAnnounceDraft({
          authorMode: 'me',
          authorUserId: currentUserId || null,
          authorName: currentUserName || '',
          authorPhoto: currentUserPhoto || '',
        }))
        setScheduleOn(false)
        onPublished?.()
      }
    } catch (err) {
      flashToast(err?.message || (isEditing ? 'Falha ao atualizar' : 'Falha ao publicar'))
    } finally {
      setSaving(false)
    }
  }

  const applyAuthorMode = (mode) => {
    if (mode === 'me') {
      patch({
        authorMode: 'me',
        authorUserId: currentUserId || null,
        authorName: currentUserName || 'Você',
        authorPhoto: currentUserPhoto || '',
        authorIcon: '',
        authorIconValue: null,
      })
      setAuthorIconPickerOpen(false)
      return
    }
    if (mode === 'system') {
      patch({
        authorMode: 'system',
        authorUserId: null,
        authorName: draft.authorMode === 'system' && draft.authorName
          ? draft.authorName
          : 'Sistema VoiceCraft',
        authorPhoto: draft.authorMode === 'system' ? draft.authorPhoto : '',
        authorIcon: draft.authorMode === 'system' ? draft.authorIcon : '🤖',
        authorIconValue: draft.authorMode === 'system' ? draft.authorIconValue : null,
      })
      return
    }
    if (mode === 'member') {
      const first = members.find((m) => m.userId) || null
      patch({
        authorMode: 'member',
        authorUserId: first?.userId || null,
        authorName: first?.displayName || first?.name || '',
        authorPhoto: first?.photoURL || '',
        authorIcon: '',
        authorIconValue: null,
      })
      setAuthorIconPickerOpen(false)
      return
    }
    patch({
      authorMode: 'custom',
      authorUserId: null,
      authorName: draft.authorName || 'Equipe',
      authorPhoto: draft.authorMode === 'custom' ? draft.authorPhoto : '',
      authorIcon: draft.authorMode === 'custom' ? draft.authorIcon : '✨',
      authorIconValue: draft.authorMode === 'custom' ? draft.authorIconValue : null,
    })
  }

  const onSelectMember = (userId) => {
    const m = members.find((x) => x.userId === userId)
    if (!m) return
    patch({
      authorMode: 'member',
      authorUserId: m.userId,
      authorName: m.displayName || m.name || m.userId,
      authorPhoto: m.photoURL || '',
      authorIcon: '',
      authorIconValue: null,
    })
  }

  return (
    <div className="space-y-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-muted hover:text-ink inline-flex items-center gap-1"
        >
          ← Voltar à lista
        </button>
      )}
      <div className="text-[12px] font-semibold text-strong px-0.5">
        {isEditing ? 'Editar anúncio' : 'Novo anúncio'}
      </div>

      <Section title="Identidade">
        <div className="flex items-start gap-2">
          <div className="relative shrink-0">
            <button
              ref={iconButtonRef}
              type="button"
              onClick={() => setIconPickerOpen((v) => !v)}
              className="w-12 h-12 rounded-xl border border-line bg-[#1a1e28] flex items-center justify-center overflow-hidden hover:border-white/20"
              title="Escolher ícone"
              style={{ color: draft.accent || '#f5b942' }}
            >
              {draft.iconImage ? (
                <img src={draft.iconImage} alt="" className="w-full h-full object-cover" />
              ) : draft.iconValue ? (
                <SpaceIcon value={draft.iconValue} size={24} />
              ) : (
                <span className="text-[22px]">{draft.icon || '📣'}</span>
              )}
            </button>
            <input
              ref={iconUploadRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                try {
                  const dataUrl = await readImageFile(file)
                  patch({ iconImage: dataUrl, iconValue: null })
                  setIconPickerOpen(false)
                } catch (err) {
                  flashToast(err.message || 'Falha no ícone')
                }
              }}
            />
          </div>

          <label className="flex-1 min-w-0 block space-y-1">
            <span className="text-[10.5px] text-muted">Título</span>
            <input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Título do anúncio"
              className="w-full h-12 rounded-xl bg-[#1a1e28] border border-line px-3 text-[13px] text-ink outline-none focus:border-white/25"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => iconUploadRef.current?.click()}
            className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-1"
          >
            <Upload size={11} /> Upload PNG
          </button>
          {draft.iconImage && (
            <button
              type="button"
              onClick={() => patch({ iconImage: null })}
              className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-1"
            >
              <X size={11} /> Remover PNG
            </button>
          )}
        </div>
      </Section>

      <SpaceIconPicker
        open={iconPickerOpen}
        current={draft.iconValue}
        currentEmoji={!draft.iconValue && !draft.iconImage ? draft.icon : null}
        recents={iconRecents}
        enableEmojis
        onPick={(next) => {
          patch({ iconValue: next, iconImage: null, icon: '📣' })
          setIconRecents(pushRecentIcon(next))
          setIconPickerOpen(false)
        }}
        onPickEmoji={(em) => {
          patch({ icon: em, iconValue: null, iconImage: null })
          setIconPickerOpen(false)
        }}
        onClose={() => setIconPickerOpen(false)}
        anchorRef={iconButtonRef}
      />

      <Section title="Corpo">
        <AnnounceRichText
          valueHtml={draft.bodyHtml}
          onChange={({ html, text }) => patch({ bodyHtml: html, body: text })}
          placeholder="Escreva com formatação — negrito, cor, tamanho…"
        />
      </Section>

      <Section title="Autor">
        <label className="block space-y-1">
          <span className="text-[10.5px] text-muted">Tipo</span>
          <div className="relative">
            <select
              value={draft.authorMode}
              onChange={(e) => applyAuthorMode(e.target.value)}
              className="w-full appearance-none h-9 rounded-lg bg-[#1a1e28] border border-line px-3 pr-8 text-[12.5px] text-ink outline-none"
            >
              {ANNOUNCE_AUTHOR_MODES.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
        </label>

        {draft.authorMode === 'member' && (
          <label className="block space-y-1 mt-2">
            <span className="text-[10.5px] text-muted">Membro</span>
            <div className="relative">
              <select
                value={draft.authorUserId || ''}
                onChange={(e) => onSelectMember(e.target.value)}
                className="w-full appearance-none h-9 rounded-lg bg-[#1a1e28] border border-line px-3 pr-8 text-[12.5px] text-ink outline-none"
              >
                <option value="">Selecionar…</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName || m.name || m.userId}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            </div>
          </label>
        )}

        <div className="flex items-center gap-2 mt-2">
          <button
            ref={authorAvatarRef}
            type="button"
            onClick={() => {
              if (authorUsesIconPicker) {
                setAuthorIconPickerOpen((v) => !v)
                return
              }
              avatarUploadRef.current?.click()
            }}
            className="w-10 h-10 rounded-full border border-line overflow-hidden bg-[#1a1e28] flex items-center justify-center shrink-0"
            title={authorUsesIconPicker ? 'Ícone do autor' : 'Avatar do autor'}
            style={authorUsesIconPicker ? { color: draft.accent || '#f5b942' } : undefined}
          >
            {draft.authorPhoto ? (
              <img src={draft.authorPhoto} alt="" className="w-full h-full object-cover" />
            ) : draft.authorIconValue ? (
              <SpaceIcon value={draft.authorIconValue} size={20} />
            ) : draft.authorIcon ? (
              <span className="text-[18px] leading-none">{draft.authorIcon}</span>
            ) : (
              <User size={16} className="text-muted" />
            )}
          </button>
          <input
            ref={avatarUploadRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              try {
                const dataUrl = await readImageFile(file)
                patch({
                  authorPhoto: dataUrl,
                  authorIcon: '',
                  authorIconValue: null,
                })
                setAuthorIconPickerOpen(false)
              } catch (err) {
                flashToast(err.message || 'Falha no avatar')
              }
            }}
          />
          <input
            value={draft.authorName}
            onChange={(e) => patch({
              authorName: e.target.value,
              authorMode: draft.authorMode === 'member' ? 'member' : (
                draft.authorMode === 'me' ? 'custom' : draft.authorMode
              ),
            })}
            placeholder={draft.authorMode === 'system' ? 'Nome do sistema' : 'Nome do autor'}
            className="flex-1 h-10 rounded-lg bg-[#1a1e28] border border-line px-3 text-[12.5px] text-ink outline-none"
          />
        </div>
        {authorUsesIconPicker && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => avatarUploadRef.current?.click()}
              className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-1"
            >
              <Upload size={11} /> Upload PNG
            </button>
            {(draft.authorPhoto || draft.authorIconValue || draft.authorIcon) && (
              <button
                type="button"
                onClick={() => patch({
                  authorPhoto: '',
                  authorIcon: '',
                  authorIconValue: null,
                })}
                className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-1"
              >
                <X size={11} /> Limpar ícone
              </button>
            )}
          </div>
        )}
      </Section>

      {authorUsesIconPicker && (
        <SpaceIconPicker
          open={authorIconPickerOpen}
          current={draft.authorIconValue}
          currentEmoji={!draft.authorIconValue && !draft.authorPhoto ? (draft.authorIcon || null) : null}
          recents={iconRecents}
          enableEmojis
          onPick={(next) => {
            patch({
              authorIconValue: next,
              authorIcon: '',
              authorPhoto: '',
            })
            setIconRecents(pushRecentIcon(next))
            setAuthorIconPickerOpen(false)
          }}
          onPickEmoji={(em) => {
            patch({
              authorIcon: em,
              authorIconValue: null,
              authorPhoto: '',
            })
            setAuthorIconPickerOpen(false)
          }}
          onClose={() => setAuthorIconPickerOpen(false)}
          anchorRef={authorAvatarRef}
        />
      )}

      <Section title="Badge e cores">
        <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
          <label className="block space-y-1 min-w-0">
            <span className="text-[10.5px] text-muted">Texto do badge</span>
            <input
              value={draft.badge}
              onChange={(e) => patch({ badge: e.target.value })}
              placeholder="Novidade"
              className="w-full h-9 rounded-lg bg-[#1a1e28] border border-line px-3 text-[12.5px] text-ink outline-none"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10.5px] text-muted">Cor</span>
            <input
              type="color"
              value={draft.badgeColor || '#f5b942'}
              onChange={(e) => patch({ badgeColor: e.target.value })}
              className="w-11 h-9 rounded-lg border border-line bg-transparent cursor-pointer"
            />
          </label>
        </div>

        <div className="mt-2 space-y-1">
          <span className="text-[10.5px] text-muted">Cor de destaque</span>
          <div className="flex items-center gap-2 flex-wrap">
            {ANNOUNCE_ACCENTS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={c.label}
                onClick={() => patch({ accent: c.value })}
                className={[
                  'w-6 h-6 rounded-full border-2 transition-transform',
                  draft.accent === c.value ? 'scale-110 border-white' : 'border-transparent opacity-80',
                ].join(' ')}
                style={{ background: c.value }}
              />
            ))}
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted cursor-pointer">
              <input
                type="color"
                value={draft.accent}
                onChange={(e) => patch({ accent: e.target.value })}
                className="w-7 h-7 rounded-lg border border-line bg-transparent cursor-pointer"
              />
              Custom
            </label>
          </div>
        </div>
      </Section>

      <Section title="Cover">
        {!draft.cover ? (
          <button
            type="button"
            onClick={() => coverRef.current?.click()}
            className="w-full h-20 rounded-xl border border-dashed border-line bg-[#1a1e28]/80 inline-flex flex-col items-center justify-center gap-1 text-muted hover:text-ink hover:border-white/20"
          >
            <ImagePlus size={18} />
            <span className="text-[11.5px]">Adicionar cover</span>
          </button>
        ) : (
          <div className="space-y-2">
            <div
              className="relative w-full rounded-xl overflow-hidden border border-line"
              style={{ height: ANNOUNCE_COVER_HEIGHT }}
            >
              <SpaceCoverLayer
                src={draft.cover}
                fit={draft.coverFit}
                interactive
                showControls={false}
                onFitChange={(fit) => patch({ coverFit: fit })}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(to top, #151820 0%, rgba(21,24,32,0.45) 50%, transparent 100%)',
                }}
              />
              <div className="absolute bottom-2 right-2 z-10">
                <SpaceCoverFitControls
                  fit={draft.coverFit}
                  onFitChange={(fit) => patch({ coverFit: fit })}
                />
              </div>
            </div>
            <p className="text-[10.5px] text-muted">
              Arraste para encaixar · scroll para zoom — capa compacta (96px), igual ao chat
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => coverRef.current?.click()}
                className="text-[11.5px] text-ink hover:underline"
              >
                Trocar
              </button>
              <button
                type="button"
                onClick={() => patch({ cover: null, coverFit: { ...DEFAULT_COVER_FIT } })}
                className="text-[11.5px] text-muted hover:text-ink"
              >
                Remover
              </button>
            </div>
          </div>
        )}
        <input
          ref={coverRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            try {
              const dataUrl = await readImageFile(file)
              patch({ cover: dataUrl, coverFit: { ...DEFAULT_COVER_FIT } })
            } catch (err) {
              flashToast(err.message || 'Falha no cover')
            }
          }}
        />
      </Section>

      <Section title="Publicação">
        {!isEditing && (
          <>
            <label className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink">
                <CalendarClock size={13} className="text-muted" />
                Agendar
              </span>
              <Toggle
                checked={scheduleOn}
                onChange={(next) => {
                  setScheduleOn(next)
                  if (next && !draft.scheduledFor) {
                    patch({ scheduledFor: Date.now() + 60 * 60 * 1000 })
                  }
                  if (!next) patch({ scheduledFor: null })
                }}
              />
            </label>
            {scheduleOn && (
              <input
                type="datetime-local"
                value={toLocalInputValue(draft.scheduledFor)}
                onChange={(e) => {
                  const v = e.target.value
                  patch({ scheduledFor: v ? new Date(v).getTime() : null })
                }}
                className="w-full h-9 rounded-lg bg-[#1a1e28] border border-line px-3 text-[12px] text-ink outline-none"
              />
            )}
          </>
        )}
        <button
          type="button"
          disabled={!canPublish || saving}
          onClick={handlePublish}
          className="w-full h-10 inline-flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold disabled:opacity-40"
          style={{
            background: draft.accent || '#f5b942',
            color: '#0a0a0a',
          }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {isEditing
            ? 'Salvar alterações'
            : scheduleOn
              ? 'Agendar anúncio'
              : 'Publicar agora'}
        </button>
      </Section>

      <div className="space-y-1.5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted px-0.5">
          Preview
        </div>
        <div className="rounded-xl border border-dashed border-white/10 overflow-hidden bg-[#0d0f14] -mx-0.5">
          <AnnouncementCard msg={previewMsg} />
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="rounded-xl border border-line bg-[#14171f] p-3 space-y-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </div>
      {children}
    </section>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative w-10 h-6 rounded-full transition-colors',
        checked ? 'bg-[var(--vc-positive)]' : 'bg-[#1a1e28] border border-line',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : '',
        ].join(' ')}
      />
    </button>
  )
}
