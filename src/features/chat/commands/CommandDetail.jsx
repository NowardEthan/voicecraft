import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ChevronDown, Loader2, Lock, Trash2, UserX, Clock, Eraser, Info,
  Download, Megaphone, BarChart3, Timer, ShieldOff, UserMinus, DoorOpen, ScrollText,
} from 'lucide-react'
import AutopurgeSettings from './AutopurgeSettings'
import AnnounceManager from './AnnounceManager'
import LobbySettings from './LobbySettings'
import RulesSettings from './RulesSettings'
import { listVisibleCommands, canUseCommand, computeChatStats, SLOWMODE_PRESETS } from './registry'

const ICONS = {
  purge_room: Trash2,
  purge_author: UserX,
  purge_older: Clock,
  autopurge: Clock,
  clear_local: Eraser,
  help: Info,
  export_chat: Download,
  announce: Megaphone,
  lobby: DoorOpen,
  rules: ScrollText,
  chat_stats: BarChart3,
  slowmode: Timer,
  lock_channel: ShieldOff,
  kick_member: UserMinus,
}

export default function CommandDetail({
  command,
  members = [],
  busy = false,
  canModerateChat = false,
  canKick = false,
  space,
  room,
  signaling,
  chat,
  currentUserId,
  onRun,
}) {
  const perms = { canModerateChat, canKick }
  const [confirmText, setConfirmText] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [hours, setHours] = useState(24)
  const [announceText, setAnnounceText] = useState('')
  const [chatLocked, setChatLocked] = useState(!!room?.chatLocked)
  const [slowModeSeconds, setSlowModeSeconds] = useState(Number(room?.slowModeSeconds) || 0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    setChatLocked(!!room?.chatLocked)
    setSlowModeSeconds(Number(room?.slowModeSeconds) || 0)
  }, [room?.id, room?.chatLocked, room?.slowModeSeconds])

  const allowed = canUseCommand(command, perms)
  const Icon = ICONS[command.id] || Info
  const needsConfirm = !!command.danger
  const word = command.confirmWord || 'CONFIRMAR'
  const confirmOk = !needsConfirm || confirmText.trim().toUpperCase() === word
  const authorOk = !command.needsAuthor || !!authorId
  const hoursOk = !command.needsHours || (Number(hours) >= 1 && Number(hours) <= 720)
  const textOk = !command.needsText || String(announceText).trim().length > 0
  const canSubmit = allowed && confirmOk && authorOk && hoursOk && textOk && !running && !busy

  const author = members.find((m) => m.userId === authorId)
  const kickableMembers = useMemo(
    () => members.filter((m) => m.userId
      && m.userId !== currentUserId
      && m.userId !== space?.createdBy),
    [members, currentUserId, space?.createdBy],
  )
  const memberOptions = command.id === 'kick_member' ? kickableMembers : members

  const stats = useMemo(
    () => computeChatStats(chat?.messages || []),
    [chat?.messages],
  )

  if (command.id === 'autopurge') {
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        <AutopurgeSettings
          space={space}
          room={room}
          signaling={signaling}
          canModerateChat={canModerateChat}
        />
      </div>
    )
  }

  if (command.id === 'help') {
    const visible = listVisibleCommands(perms)
    const userHelp = visible.filter((c) => c.audience === 'user')
    const adminHelp = visible.filter((c) => c.audience === 'admin')
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        <div className="rounded-xl border border-line bg-surface1/80 p-3.5 space-y-3">
          <HelpGroup title="Seus comandos" items={userHelp} />
          {adminHelp.length > 0 && <HelpGroup title="Administração" items={adminHelp} />}
        </div>
      </div>
    )
  }

  if (command.id === 'announce') {
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        {!allowed ? <LockedNotice permission={command.permission} /> : (
          <AnnounceManager
            signaling={signaling}
            space={space}
            room={room}
            members={members}
            chat={chat}
            currentUserId={currentUserId}
            currentUserName={members.find((m) => m.userId === currentUserId)?.displayName
              || space?.name
              || 'Equipe'}
            currentUserPhoto={members.find((m) => m.userId === currentUserId)?.photoURL || ''}
          />
        )}
      </div>
    )
  }

  if (command.id === 'lobby') {
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        {!allowed ? <LockedNotice permission={command.permission} /> : (
          <LobbySettings
            room={room}
            space={space}
            signaling={signaling}
            canModerateChat={canModerateChat}
            currentUserId={currentUserId}
            currentUserName={
              members.find((m) => m.userId === currentUserId)?.displayName
              || space?.name
              || 'Equipe'
            }
            currentUserPhoto={members.find((m) => m.userId === currentUserId)?.photoURL || ''}
            members={members}
          />
        )}
      </div>
    )
  }

  if (command.id === 'rules') {
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        {!allowed ? <LockedNotice permission={command.permission} /> : (
          <RulesSettings
            room={room}
            space={space}
            signaling={signaling}
            canModerateChat={canModerateChat}
            currentUserId={currentUserId}
            currentUserName={
              members.find((m) => m.userId === currentUserId)?.displayName
              || space?.name
              || 'Equipe'
            }
            currentUserPhoto={members.find((m) => m.userId === currentUserId)?.photoURL || ''}
            members={members}
          />
        )}
      </div>
    )
  }

  if (command.id === 'chat_stats') {
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        <div className="rounded-xl border border-line bg-surface1/80 p-3.5 grid grid-cols-2 gap-2.5">
          <Stat label="Carregadas" value={stats.total} />
          <Stat label="Ativas" value={stats.active} />
          <Stat label="Apagadas (stub)" value={stats.deleted} />
          <Stat label="Autores" value={stats.authors} />
          <Stat label="Anexos" value={stats.attachments} />
        </div>
        <p className="text-[11px] text-muted px-0.5">
          Contagem com base nas mensagens já carregadas neste cliente.
        </p>
      </div>
    )
  }

  if (command.id === 'lock_channel') {
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        {!allowed ? <LockedNotice /> : (
          <div className="rounded-xl border border-line bg-surface1/80 p-3.5 space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] text-ink">Canal trancado</span>
              <Toggle checked={chatLocked} onChange={setChatLocked} />
            </label>
            <p className="text-[11px] text-muted leading-snug">
              Com o canal trancado, só quem tem Moderar chat consegue enviar.
            </p>
            <RunButton
              running={running}
              busy={busy}
              danger={false}
              label="Salvar"
              disabled={running || busy}
              onClick={async () => {
                setRunning(true)
                try { await onRun({ chatLocked }) } finally { setRunning(false) }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  if (command.id === 'slowmode') {
    return (
      <div className="space-y-3">
        <DetailHeader command={command} Icon={Icon} />
        {!allowed ? <LockedNotice /> : (
          <div className="rounded-xl border border-line bg-surface1/80 p-3.5 space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] text-muted">Intervalo</span>
              <div className="relative">
                <select
                  value={slowModeSeconds}
                  onChange={(e) => setSlowModeSeconds(Number(e.target.value))}
                  className="w-full appearance-none rounded-lg bg-surface2 border border-line px-3 py-2 pr-8 text-[12.5px] text-ink outline-none"
                >
                  {SLOWMODE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </label>
            <RunButton
              running={running}
              busy={busy}
              danger={false}
              label="Salvar"
              disabled={running || busy}
              onClick={async () => {
                setRunning(true)
                try { await onRun({ slowModeSeconds }) } finally { setRunning(false) }
              }}
            />
          </div>
        )}
      </div>
    )
  }

  const handleRun = async () => {
    if (!canSubmit) return
    setRunning(true)
    try {
      await onRun({
        authorId: authorId || undefined,
        authorName: author?.displayName || author?.name || undefined,
        hours: Number(hours) || 24,
        text: announceText,
      })
      setConfirmText('')
      setAuthorId('')
      setAnnounceText('')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-3">
      <DetailHeader command={command} Icon={Icon} />

      {!allowed && <LockedNotice permission={command.permission} />}

      {allowed && (
        <div className="rounded-xl border border-line bg-surface1/80 p-3.5 space-y-3">
          {command.needsAuthor && (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted">
                {command.id === 'kick_member' ? 'Membro' : 'Autor'}
              </span>
              <div className="relative">
                <select
                  value={authorId}
                  onChange={(e) => setAuthorId(e.target.value)}
                  className="w-full appearance-none rounded-lg bg-surface2 border border-line px-3 py-2 pr-8 text-[12.5px] text-ink outline-none focus:border-[var(--space-accent)]"
                >
                  <option value="">Selecionar…</option>
                  {memberOptions.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName || m.name || m.userId}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              </div>
            </label>
          )}

          {command.needsHours && (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted">Mais velhas que (horas)</span>
              <input
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full rounded-lg bg-surface2 border border-line px-3 py-2 text-[12.5px] text-ink outline-none"
              />
            </label>
          )}

          {command.needsText && (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted">Aviso</span>
              <textarea
                value={announceText}
                onChange={(e) => setAnnounceText(e.target.value.slice(0, 500))}
                rows={3}
                className="w-full rounded-lg bg-surface2 border border-line px-3 py-2 text-[12.5px] text-ink outline-none resize-none"
                placeholder="Escreva o anúncio…"
              />
            </label>
          )}

          {needsConfirm && (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted inline-flex items-center gap-1">
                <AlertTriangle size={12} className="text-[var(--vc-danger)]" />
                Digite <span className="font-semibold text-strong mx-0.5">{word}</span> para confirmar
              </span>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full rounded-lg bg-surface2 border border-line px-3 py-2 text-[12.5px] text-ink outline-none focus:border-[var(--vc-danger)]"
                placeholder={word}
                autoFocus
              />
            </label>
          )}

          <RunButton
            running={running}
            busy={busy}
            danger={!!command.danger}
            label={command.danger ? 'Confirmar' : 'Executar'}
            disabled={!canSubmit}
            onClick={handleRun}
          />
        </div>
      )}
    </div>
  )
}

function LockedNotice({ permission }) {
  const label = permission === 'kick' ? 'Expulsar membros' : 'Moderar chat'
  return (
    <div className="rounded-xl border border-line bg-surface1/60 p-3.5 flex items-start gap-2 text-[12.5px] text-muted">
      <Lock size={14} className="mt-0.5 shrink-0" />
      Precisa da permissão <span className="text-ink font-medium mx-1">{label}</span>.
    </div>
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
        checked ? 'bg-[var(--vc-positive)]' : 'bg-surface2 border border-line',
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

function RunButton({ running, busy, danger, label, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={[
        'w-full h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-semibold transition-colors disabled:opacity-40',
        danger
          ? 'bg-[var(--vc-danger)] text-white'
          : 'bg-surface2 border border-line text-strong hover:bg-white/[0.06]',
      ].join(' ')}
    >
      {running && <Loader2 size={14} className="animate-spin" />}
      {label}
    </button>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-surface2/80 border border-line px-2.5 py-2">
      <div className="text-[10.5px] text-muted uppercase tracking-wide">{label}</div>
      <div className="text-[16px] font-semibold text-strong tabular-nums mt-0.5">{value}</div>
    </div>
  )
}

function HelpGroup({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="space-y-1.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      <ul className="space-y-1.5">
        {items.map((c) => (
          <li key={c.id} className="text-[11.5px] text-muted leading-snug">
            <span className="text-ink font-medium">{c.label}</span>
            {' — '}
            {c.description}
          </li>
        ))}
      </ul>
    </div>
  )
}

function DetailHeader({ command, Icon }) {
  return (
    <div className="flex items-start gap-2.5 px-0.5">
      <div
        className={[
          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border',
          command.danger
            ? 'bg-[var(--vc-danger)]/10 border-[var(--vc-danger)]/30 text-[var(--vc-danger)]'
            : 'bg-surface2 border-line text-ink',
        ].join(' ')}
      >
        <Icon size={16} strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-semibold text-strong">{command.label}</div>
        <p className="text-[11.5px] text-muted leading-snug mt-0.5">{command.description}</p>
      </div>
    </div>
  )
}
