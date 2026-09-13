import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Hash, ImagePlus, Loader2, DoorOpen, X, Upload, ChevronDown, User,
} from 'lucide-react'
import {
  LOBBY_ACCENTS,
  LOBBY_AUTHOR_MODES,
  LOBBY_PLACEHOLDERS,
  emptyLobbyConfig,
  normalizeLobby,
  htmlToPlainText,
  wrapLobbyPlaceholders,
  unwrapLobbyPlaceholders,
  lobbyPlaceholderChipHtml,
  applyLobbyTemplateChips,
  sanitizeAnnounceHtml,
} from '../lobbySchema'
import { LobbyJoinCard } from '../LobbyCards'
import AnnounceRichText from './AnnounceRichText'
import { EmojiTextInput } from './EmojiInsertButton'
import { flashToast } from '../../../shared/utils/toast'
import { DEFAULT_COVER_FIT } from '../../spaces/model/spaceCover'
import {
  SpaceCoverFitControls,
  SpaceCoverLayer,
} from '../../spaces/components/SpaceCoverLayer'
import { SpaceIconPicker } from '../../spaces/components/SpaceIconPicker'
import { SpaceIcon, getRecentIcons, pushRecentIcon } from '../../spaces/model/spaceIcons'

function roomSlug(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
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

export default function LobbySettings({
  room,
  space,
  signaling,
  canModerateChat = false,
  currentUserId = null,
  currentUserName = '',
  currentUserPhoto = '',
  members = [],
}) {
  const [draft, setDraft] = useState(() => normalizeLobby(room?.lobby))
  const [saving, setSaving] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [authorIconPickerOpen, setAuthorIconPickerOpen] = useState(false)
  const [iconRecents, setIconRecents] = useState(() => getRecentIcons())

  const bannerRef = useRef(null)
  const iconUploadRef = useRef(null)
  const iconButtonRef = useRef(null)
  const avatarUploadRef = useRef(null)
  const authorAvatarRef = useRef(null)
  const richApiRef = useRef(null)
  const captionRef = useRef(null)

  const authorUsesIconPicker = draft.authorMode === 'system' || draft.authorMode === 'custom'

  useEffect(() => {
    setDraft(normalizeLobby(room?.lobby))
  }, [room?.id, room?.lobby])

  const previewUser = useMemo(() => {
    const self = members.find((m) => m.userId === currentUserId)
    return {
      displayName: self?.displayName || currentUserName || 'você',
      photoURL: self?.photoURL || currentUserPhoto || '',
    }
  }, [members, currentUserId, currentUserName, currentUserPhoto])

  const rooms = useMemo(
    () => (Array.isArray(space?.rooms) ? space.rooms : []).filter((r) => r?.id && r?.name),
    [space?.rooms],
  )

  const resolveRoom = useMemo(() => {
    const bySlug = new Map()
    for (const r of rooms) {
      const slug = roomSlug(r.name)
      if (slug) bySlug.set(slug, r)
    }
    return (slug) => bySlug.get(String(slug || '').toLowerCase()) || null
  }, [rooms])

  if (!canModerateChat) {
    return (
      <div className="rounded-xl border border-line bg-surface1/60 p-4 text-[12.5px] text-muted leading-relaxed">
        Só quem tem <span className="text-ink font-medium">Moderar chat</span> ou
        {' '}é criador pode configurar o lobby.
      </div>
    )
  }

  const patch = (partial) => {
    setDraft((prev) => normalizeLobby({ ...prev, ...partial }))
  }

  const insertRoomMention = (slug) => {
    const token = `#${slug}`
    if (richApiRef.current?.insertText) {
      richApiRef.current.insertText(`${token} `)
      return
    }
    const html = draft.bodyHtml || ''
    const nextHtml = html
      ? `${html.replace(/(<br\s*\/?>)?$/i, '')} ${token}`
      : token
    const plain = htmlToPlainText(unwrapLobbyPlaceholders(nextHtml)) || `${draft.body || ''} ${token}`.trim()
    patch({ bodyHtml: unwrapLobbyPlaceholders(nextHtml), body: plain })
  }

  const insertPlaceholder = (id) => {
    const html = lobbyPlaceholderChipHtml(id)
    if (richApiRef.current?.insertHtml) {
      richApiRef.current.insertHtml(html)
      return
    }
    const ph = LOBBY_PLACEHOLDERS.find((p) => p.id === id)
    if (!ph) return
    patch({
      bodyHtml: `${draft.bodyHtml || ''}${ph.token}`,
      body: `${draft.body || ''}${ph.token}`,
    })
  }

  const insertCaptionPlaceholder = (id) => {
    const ph = LOBBY_PLACEHOLDERS.find((p) => p.id === id)
    if (!ph) return
    const el = captionRef.current
    const value = draft.bannerCaption || ''
    if (!el) {
      patch({ bannerCaption: `${value}${ph.token}` })
      return
    }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = `${value.slice(0, start)}${ph.token}${value.slice(end)}`
    patch({ bannerCaption: next })
    requestAnimationFrame(() => {
      try {
        el.focus()
        const caret = start + ph.token.length
        el.setSelectionRange(caret, caret)
      } catch { /* ignore */ }
    })
  }

  const editorDisplayHtml = wrapLobbyPlaceholders(
    draft.bodyHtml || (draft.body ? draft.body.replace(/\n/g, '<br>') : ''),
  )

  const captionPreview = sanitizeAnnounceHtml(applyLobbyTemplateChips(draft.bannerCaption, {
    user: previewUser.displayName,
    space: space?.name || 'Space',
    count: space?.memberCount || members.length || 1,
  }))

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
          : 'Lobby',
        authorPhoto: draft.authorMode === 'system' ? draft.authorPhoto : '',
        authorIcon: draft.authorMode === 'system' ? draft.authorIcon : '🚪',
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

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = normalizeLobby({
        ...draft,
        body: draft.body || htmlToPlainText(draft.bodyHtml),
      })
      await signaling.updateRoomLobby(room?.id, payload)
      flashToast(payload.enabled ? 'Lobby ativado' : 'Lobby desativado')
    } catch (err) {
      flashToast(err?.message || 'Falha ao salvar lobby')
    } finally {
      setSaving(false)
    }
  }

  const handleTestPost = async () => {
    if (saving || !draft.enabled) return
    setSaving(true)
    try {
      const payload = normalizeLobby({
        ...draft,
        body: draft.body || htmlToPlainText(draft.bodyHtml),
      })
      await signaling.updateRoomLobby(room?.id, payload)
      const posted = await signaling.sendLobbyEvent(room?.id, 'join', null, { force: true })
      flashToast(posted ? 'Card de teste postado' : 'Não foi possível postar')
    } catch (err) {
      flashToast(err?.message || 'Falha ao postar teste')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <Section>
        <label className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-strong inline-flex items-center gap-1.5">
              <DoorOpen size={14} className="text-muted" />
              Usar esta sala como lobby
            </div>
            <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
              Card compacto quando alguém entra no Space.
            </p>
          </div>
          <Toggle checked={draft.enabled} onChange={(v) => patch({ enabled: v })} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] text-ink">Cards de entrada</div>
            <p className="text-[11px] text-muted mt-0.5">Banner + avatar de quem entrou.</p>
          </div>
          <Toggle
            checked={draft.showJoins}
            onChange={(v) => patch({ showJoins: v })}
            disabled={!draft.enabled}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12.5px] text-ink">Avisos de saída</div>
          </div>
          <Toggle
            checked={draft.showLeaves}
            onChange={(v) => patch({ showLeaves: v })}
            disabled={!draft.enabled}
          />
        </label>
      </Section>

      <div className={draft.enabled ? 'space-y-3' : 'space-y-3 opacity-50 pointer-events-none'}>
        <Section title="Identidade">
          <div className="flex items-start gap-2">
            <div className="relative shrink-0">
              <button
                ref={iconButtonRef}
                type="button"
                onClick={() => setIconPickerOpen((v) => !v)}
                className="w-11 h-11 rounded-xl border border-line bg-[#1a1e28] flex items-center justify-center overflow-hidden hover:border-white/20"
                title="Escolher ícone"
                style={{ color: draft.accent || '#38bdf8' }}
              >
                {draft.iconImage ? (
                  <img src={draft.iconImage} alt="" className="w-full h-full object-cover" />
                ) : draft.iconValue ? (
                  <SpaceIcon value={draft.iconValue} size={22} />
                ) : (
                  <span className="text-[20px]">{draft.icon || '👋'}</span>
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
              <EmojiTextInput
                value={draft.title}
                onChange={(title) => patch({ title })}
                placeholder="Boas-vindas! 🎊"
                inputClassName="flex-1 min-w-0 h-11 rounded-xl bg-[#1a1e28] border border-line px-3 text-[13px] text-ink outline-none"
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
            patch({ iconValue: next, iconImage: null, icon: '👋' })
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

        <Section title="Mensagem">
          <AnnounceRichText
            editorApiRef={richApiRef}
            valueHtml={editorDisplayHtml}
            onChange={({ html }) => {
              const stored = unwrapLobbyPlaceholders(html)
              patch({
                bodyHtml: stored,
                body: htmlToPlainText(stored),
              })
            }}
            placeholder="Escreva a mensagem de boas-vindas…"
          />
          <div className="space-y-1.5">
            <div className="text-[10.5px] text-muted">Inserir na mensagem</div>
            <div className="flex flex-wrap gap-1.5">
              {LOBBY_PLACEHOLDERS.map((ph) => (
                <button
                  key={ph.id}
                  type="button"
                  title={ph.hint}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertPlaceholder(ph.id)}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-sky-400/30 bg-sky-400/10 text-[11px] text-sky-200 hover:bg-sky-400/20"
                >
                  + {ph.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted leading-relaxed">
              Toque em <span className="text-ink/80">+ Nome</span>, <span className="text-ink/80">+ Space</span> ou <span className="text-ink/80">+ Membros</span> — vira um chip e preenche sozinho quando alguém entra.
            </p>
          </div>
          {rooms.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[10.5px] text-muted">Marcar sala</div>
              <div className="flex flex-wrap gap-1.5">
                {rooms.slice(0, 16).map((r) => {
                  const slug = roomSlug(r.name)
                  if (!slug) return null
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertRoomMention(slug)}
                      className="inline-flex items-center gap-1 h-7 px-2 rounded-lg border border-line bg-[#1a1e28] text-[11px] text-ink hover:border-white/20"
                    >
                      <Hash size={11} className="text-muted" />
                      {r.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </Section>

        <Section title="Autor do card">
          <label className="block space-y-1">
            <span className="text-[10.5px] text-muted">Tipo</span>
            <div className="relative">
              <select
                value={draft.authorMode}
                onChange={(e) => applyAuthorMode(e.target.value)}
                className="w-full appearance-none h-9 rounded-lg bg-[#1a1e28] border border-line px-3 pr-8 text-[12.5px] text-ink outline-none"
              >
                {LOBBY_AUTHOR_MODES.map((opt) => (
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
              className="w-9 h-9 rounded-full border border-line overflow-hidden bg-[#1a1e28] flex items-center justify-center shrink-0"
              style={authorUsesIconPicker ? { color: draft.accent || '#38bdf8' } : undefined}
            >
              {draft.authorPhoto ? (
                <img src={draft.authorPhoto} alt="" className="w-full h-full object-cover" />
              ) : draft.authorIconValue ? (
                <SpaceIcon value={draft.authorIconValue} size={18} />
              ) : draft.authorIcon ? (
                <span className="text-[16px] leading-none">{draft.authorIcon}</span>
              ) : (
                <User size={14} className="text-muted" />
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
                  patch({ authorPhoto: dataUrl, authorIcon: '', authorIconValue: null })
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
              placeholder="Nome do autor"
              className="flex-1 h-9 rounded-lg bg-[#1a1e28] border border-line px-3 text-[12.5px] text-ink outline-none"
            />
          </div>
          {authorUsesIconPicker && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
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
                  onClick={() => patch({ authorPhoto: '', authorIcon: '', authorIconValue: null })}
                  className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-1"
                >
                  <X size={11} /> Limpar
                </button>
              )}
            </div>
          )}
          <SpaceIconPicker
            open={authorIconPickerOpen}
            current={draft.authorIconValue}
            currentEmoji={!draft.authorIconValue && !draft.authorPhoto ? draft.authorIcon : null}
            recents={iconRecents}
            enableEmojis
            onPick={(next) => {
              patch({ authorIconValue: next, authorPhoto: '', authorIcon: '' })
              setIconRecents(pushRecentIcon(next))
              setAuthorIconPickerOpen(false)
            }}
            onPickEmoji={(em) => {
              patch({ authorIcon: em, authorIconValue: null, authorPhoto: '' })
              setAuthorIconPickerOpen(false)
            }}
            onClose={() => setAuthorIconPickerOpen(false)}
            anchorRef={authorAvatarRef}
          />
        </Section>

        <Section title="Cores">
          <div className="grid grid-cols-2 gap-2">
            <label className="block space-y-1 min-w-0">
              <span className="text-[10.5px] text-muted">Badge</span>
              <input
                value={draft.badge}
                onChange={(e) => patch({ badge: e.target.value })}
                className="w-full h-9 rounded-lg bg-[#1a1e28] border border-line px-3 text-[12.5px] text-ink outline-none"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10.5px] text-muted">Cor do badge</span>
              <input
                type="color"
                value={draft.badgeColor}
                onChange={(e) => patch({ badgeColor: e.target.value })}
                className="w-full h-9 rounded-lg border border-line bg-transparent cursor-pointer"
              />
            </label>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10.5px] text-muted shrink-0">Acento</span>
            <input
              type="color"
              value={draft.accent}
              onChange={(e) => patch({ accent: e.target.value })}
              className="w-9 h-8 rounded-lg border border-line bg-transparent cursor-pointer"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {LOBBY_ACCENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => patch({ accent: c.value, badgeColor: draft.badgeColor === draft.accent ? c.value : draft.badgeColor })}
                  className={[
                    'w-5 h-5 rounded-full border-2',
                    draft.accent === c.value ? 'border-white scale-110' : 'border-transparent opacity-80',
                  ].join(' ')}
                  style={{ background: c.value }}
                />
              ))}
            </div>
          </div>
        </Section>

        <Section title="Banner do card">
          {!draft.banner ? (
            <button
              type="button"
              onClick={() => bannerRef.current?.click()}
              className="w-full h-20 rounded-xl border border-dashed border-white/15 bg-[#1a1e28] flex flex-col items-center justify-center gap-1.5 text-muted hover:text-ink hover:border-white/25"
            >
              <ImagePlus size={16} />
              <span className="text-[11.5px]">Adicionar banner</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="relative h-24 rounded-xl overflow-hidden border border-line">
                <SpaceCoverLayer src={draft.banner} fit={draft.bannerFit} className="absolute inset-0" />
              </div>
              <SpaceCoverFitControls
                fit={draft.bannerFit}
                onFitChange={(fit) => patch({ bannerFit: fit })}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => bannerRef.current?.click()}
                  className="h-8 px-2.5 rounded-lg border border-line text-[11.5px] text-ink"
                >
                  Trocar
                </button>
                <button
                  type="button"
                  onClick={() => patch({ banner: null, bannerFit: { ...DEFAULT_COVER_FIT } })}
                  className="h-8 px-2.5 rounded-lg border border-line text-[11.5px] text-muted inline-flex items-center gap-1"
                >
                  <X size={12} /> Remover
                </button>
              </div>
            </div>
          )}
          <input
            ref={bannerRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                const dataUrl = await readImageFile(file)
                patch({ banner: dataUrl, bannerFit: { ...DEFAULT_COVER_FIT } })
              } catch (err) {
                flashToast(err.message || 'Falha no banner')
              }
            }}
          />
          <label className="block space-y-1 mt-2">
            <span className="text-[10.5px] text-muted">Legenda no banner</span>
            <EmojiTextInput
              inputRef={captionRef}
              value={draft.bannerCaption}
              onChange={(bannerCaption) => patch({ bannerCaption })}
              placeholder="Bem-vindo(a) a…"
              inputClassName="flex-1 min-w-0 h-9 rounded-lg bg-[#1a1e28] border border-line px-3 text-[12.5px] text-ink outline-none"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {LOBBY_PLACEHOLDERS.map((ph) => (
                <button
                  key={`cap-${ph.id}`}
                  type="button"
                  title={ph.hint}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertCaptionPlaceholder(ph.id)}
                  className="inline-flex items-center h-6 px-2 rounded-md border border-sky-400/25 bg-sky-400/10 text-[10.5px] text-sky-200 hover:bg-sky-400/20"
                >
                  + {ph.label}
                </button>
              ))}
            </div>
            {captionPreview ? (
              <p className="text-[10.5px] text-muted pt-0.5">
                Preview:{' '}
                <span
                  className="text-ink/85 announce-html lobby-html"
                  dangerouslySetInnerHTML={{ __html: captionPreview }}
                />
              </p>
            ) : null}
          </label>
        </Section>
      </div>

      {draft.enabled && (
        <div className="space-y-1.5">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted px-0.5">
            Preview
          </div>
          <div className="rounded-xl border border-dashed border-white/10 overflow-hidden bg-[#0d0f14] -mx-0.5">
            <LobbyJoinCard
              preview
              lobby={draft}
              spaceName={space?.name || 'Space'}
              memberCount={space?.memberCount || members.length || 1}
              resolveRoom={resolveRoom}
              msg={{
                lobbyEvent: {
                  type: 'join',
                  displayName: previewUser.displayName,
                  photoURL: previewUser.photoURL,
                },
              }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setDraft(emptyLobbyConfig())}
          className="h-9 px-3 rounded-xl border border-line text-[12px] text-muted hover:text-ink"
        >
          Resetar
        </button>
        <button
          type="button"
          disabled={saving || !draft.enabled}
          onClick={handleTestPost}
          className="h-9 px-3 rounded-xl border border-line text-[12px] text-ink disabled:opacity-40"
        >
          Postar teste
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="flex-1 min-w-[8rem] h-9 inline-flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold disabled:opacity-40"
          style={{ background: draft.accent || '#38bdf8', color: '#0a0a0a' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Salvar lobby
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="rounded-xl border border-line bg-[#14171f] p-3 space-y-2.5">
      {title ? (
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
          {title}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={[
        'relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-40',
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
