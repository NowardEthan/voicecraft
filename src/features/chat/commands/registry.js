/**
 * Native chat command registry — UI-driven actions (no slash parser).
 *
 * audience:
 *   - 'user'  → any member (visible + usable)
 *   - 'admin' → staff tools; hidden unless the viewer has the required permission
 *
 * permission: null | 'mod_chat' | 'kick'
 */

export const SLOWMODE_PRESETS = [
  { value: 0, label: 'Desligado' },
  { value: 5, label: '5 segundos' },
  { value: 10, label: '10 segundos' },
  { value: 30, label: '30 segundos' },
  { value: 60, label: '1 minuto' },
  { value: 120, label: '2 minutos' },
  { value: 300, label: '5 minutos' },
]

export const COMMAND_CATEGORIES = [
  { id: 'utility', label: 'Utilidades' },
  { id: 'cleanup', label: 'Limpeza' },
  { id: 'channel', label: 'Canal' },
  { id: 'members', label: 'Membros' },
  { id: 'info', label: 'Info' },
  { id: 'automation', label: 'Automação' },
]

export const COMMANDS = [
  {
    id: 'clear_local',
    label: 'Limpar histórico local',
    description: 'Remove só o cache deste dispositivo. Não altera o Firestore.',
    audience: 'user',
    category: 'utility',
    permission: null,
    danger: false,
    source: 'native',
  },
  {
    id: 'export_chat',
    label: 'Exportar conversa',
    description: 'Baixa um .txt com as mensagens carregadas nesta sala.',
    audience: 'user',
    category: 'utility',
    permission: null,
    danger: false,
    source: 'native',
  },
  {
    id: 'help',
    label: 'Ajuda',
    description: 'Lista os comandos disponíveis para você.',
    audience: 'user',
    category: 'info',
    permission: null,
    danger: false,
    source: 'native',
  },
  {
    id: 'purge_room',
    label: 'Purgar sala',
    description: 'Remove todas as mensagens desta sala, inclusive stubs de “mensagem apagada”.',
    audience: 'admin',
    category: 'cleanup',
    permission: 'mod_chat',
    danger: true,
    confirmWord: 'PURGAR',
    source: 'native',
  },
  {
    id: 'purge_author',
    label: 'Purgar por autor',
    description: 'Remove mensagens de um membro (incluindo já apagadas) nesta sala.',
    audience: 'admin',
    category: 'cleanup',
    permission: 'mod_chat',
    danger: true,
    needsAuthor: true,
    confirmWord: 'PURGAR',
    source: 'native',
  },
  {
    id: 'purge_older',
    label: 'Purgar mensagens antigas',
    description: 'Remove mensagens mais velhas que o intervalo escolhido.',
    audience: 'admin',
    category: 'cleanup',
    permission: 'mod_chat',
    danger: true,
    needsHours: true,
    confirmWord: 'PURGAR',
    source: 'native',
  },
  {
    id: 'lock_channel',
    label: 'Trancar canal',
    description: 'Só moderadores podem enviar mensagens enquanto estiver trancado.',
    audience: 'admin',
    category: 'channel',
    permission: 'mod_chat',
    danger: false,
    configurable: true,
    source: 'native',
  },
  {
    id: 'slowmode',
    label: 'Slowmode',
    description: 'Define um intervalo mínimo entre mensagens de cada pessoa.',
    audience: 'admin',
    category: 'channel',
    permission: 'mod_chat',
    danger: false,
    configurable: true,
    source: 'native',
  },
  {
    id: 'announce',
    label: 'Anunciar',
    description: 'Veja anúncios publicados, edite ou crie um novo card com cover e rich text.',
    audience: 'admin',
    category: 'channel',
    permission: 'mod_chat',
    danger: false,
    configurable: true,
    source: 'native',
  },
  {
    id: 'lobby',
    label: 'Lobby / Boas-vindas',
    description: 'Canal de boas-vindas estilo Discord: card com banner, avatar de quem entrou e mensagem com #salas.',
    audience: 'admin',
    category: 'channel',
    permission: 'mod_chat',
    danger: false,
    configurable: true,
    source: 'native',
  },
  {
    id: 'rules',
    label: 'Regras do Space',
    description: 'Define o canal de regras. Membros precisam aceitar para liberar o restante do Space.',
    audience: 'admin',
    category: 'channel',
    permission: 'mod_chat',
    danger: false,
    configurable: true,
    source: 'native',
  },
  {
    id: 'chat_stats',
    label: 'Estatísticas da sala',
    description: 'Resumo das mensagens carregadas (total, autores, anexos).',
    audience: 'admin',
    category: 'info',
    permission: 'mod_chat',
    danger: false,
    source: 'native',
  },
  {
    id: 'kick_member',
    label: 'Expulsar membro',
    description: 'Remove a pessoa deste Space (ela pode entrar de novo se tiver convite).',
    audience: 'admin',
    category: 'members',
    permission: 'kick',
    danger: true,
    needsAuthor: true,
    confirmWord: 'EXPULSAR',
    source: 'native',
  },
  {
    id: 'autopurge',
    label: 'Autopurge',
    description: 'Apaga mensagens antigas automaticamente no intervalo configurado.',
    audience: 'admin',
    category: 'automation',
    permission: 'mod_chat',
    danger: false,
    configurable: true,
    source: 'native',
  },
]

export function matchCommandQuery(cmd, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  const hay = [cmd.id, cmd.label, cmd.description, cmd.category, cmd.audience]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return q.split(/\s+/).every((token) => hay.includes(token))
}

export function filterCommands(commands, { query = '', category = 'all', scope = 'all' } = {}) {
  return (commands || []).filter((cmd) => {
    if (scope === 'user' && cmd.audience !== 'user') return false
    if (scope === 'admin' && cmd.audience !== 'admin') return false
    if (scope === 'danger' && !cmd.danger) return false
    if (scope === 'config' && !cmd.configurable) return false
    if (category !== 'all' && cmd.category !== category) return false
    return matchCommandQuery(cmd, query)
  })
}

export function permContext(opts = {}) {
  return {
    canModerateChat: !!opts.canModerateChat,
    canKick: !!opts.canKick,
  }
}

export function canUseCommand(cmd, opts = {}) {
  if (!cmd) return false
  const { canModerateChat, canKick } = permContext(opts)
  if (!cmd.permission) return true
  if (cmd.permission === 'mod_chat') return canModerateChat
  if (cmd.permission === 'kick') return canKick || canModerateChat
  return false
}

export function hasAnyAdminCommand(opts = {}) {
  return listAdminCommands(opts).length > 0
}

/** Commands this viewer is allowed to see. */
export function listVisibleCommands(opts = {}) {
  return COMMANDS.filter((cmd) => {
    if (cmd.source !== 'native') return false
    return canUseCommand(cmd, opts)
  })
}

export function listUserCommands() {
  return COMMANDS.filter((c) => c.source === 'native' && c.audience === 'user')
}

export function listAdminCommands(opts = {}) {
  return COMMANDS.filter(
    (c) => c.source === 'native' && c.audience === 'admin' && canUseCommand(c, opts),
  )
}

export function listNativeCommands() {
  return COMMANDS.filter((c) => c.source === 'native')
}

export function listCommands(opts) {
  return listVisibleCommands(opts)
}

export function getCommand(id) {
  return COMMANDS.find((c) => c.id === id) || null
}

export function getVisibleCommand(id, opts = {}) {
  const cmd = getCommand(id)
  if (!cmd || !canUseCommand(cmd, opts)) return null
  return cmd
}

export function exportMessagesTranscript(messages = [], { roomName = 'sala' } = {}) {
  const lines = [
    `# VoiceCraft — ${roomName}`,
    `# Exportado em ${new Date().toLocaleString()}`,
    '',
  ]
  for (const m of messages) {
    if (!m || m.kind === 'sys') {
      if (m?.text) lines.push(`[sistema] ${m.text}`)
      continue
    }
    if (m.kind === 'announce' || m.announce) {
      const title = m.announce?.title || 'Anúncio'
      const body = m.announce?.body || m.text || ''
      lines.push(`[anúncio] ${title}${body ? ` — ${body}` : ''}`)
      continue
    }
    if (m.deleted) continue
    const when = m.ts ? new Date(m.ts).toLocaleString() : ''
    const who = m.author || m.authorId || '?'
    const body = m.text || (m.attachment ? `[anexo: ${m.attachment.name || 'arquivo'}]` : '')
    if (!body) continue
    lines.push(`[${when}] ${who}: ${body}`)
  }
  return lines.join('\n')
}

export function computeChatStats(messages = []) {
  const list = Array.isArray(messages) ? messages : []
  const active = list.filter((m) => m && m.kind !== 'sys' && !m.deleted)
  const authors = new Set()
  let attachments = 0
  let deleted = 0
  for (const m of list) {
    if (!m) continue
    if (m.deleted) deleted += 1
    if (m.kind === 'sys') continue
    if (m.authorId) authors.add(m.authorId)
    else if (m.author) authors.add(m.author)
    if (m.attachment) attachments += 1
  }
  return {
    total: list.length,
    active: active.length,
    deleted,
    authors: authors.size,
    attachments,
  }
}

/**
 * @param {string} id
 * @param {object} ctx
 * @param {object} [params]
 */
export async function runCommand(id, ctx, params = {}) {
  const cmd = getVisibleCommand(id, ctx)
  if (!cmd) throw new Error('Comando indisponível')

  switch (id) {
    case 'purge_room': {
      const n = await ctx.chat.purgeMessages({})
      ctx.postSystem?.(`Sala purgada (${n} mensagem${n === 1 ? '' : 's'}).`)
      ctx.flashToast?.(n ? `${n} mensagens removidas` : 'Nada para remover')
      return { purged: n }
    }
    case 'purge_author': {
      const authorId = params.authorId
      if (!authorId) throw new Error('Selecione um autor')
      const n = await ctx.chat.purgeMessages({ authorId })
      const name = params.authorName || authorId
      ctx.postSystem?.(`Mensagens de ${name} purgadas (${n}).`)
      ctx.flashToast?.(n ? `${n} mensagens de ${name} removidas` : 'Nada para remover')
      return { purged: n }
    }
    case 'purge_older': {
      const hours = Math.min(720, Math.max(1, Number(params.hours) || 24))
      const beforeTs = Date.now() - hours * 60 * 60 * 1000
      const n = await ctx.chat.purgeMessages({ beforeTs })
      ctx.postSystem?.(`Purgadas msgs com mais de ${hours}h (${n}).`)
      ctx.flashToast?.(n ? `${n} mensagens antigas removidas` : 'Nada para remover')
      return { purged: n }
    }
    case 'lock_channel': {
      const locked = !!params.chatLocked
      await ctx.signaling.updateRoomChatModeration(ctx.roomId, { chatLocked: locked })
      ctx.postSystem?.(locked ? 'Canal trancado.' : 'Canal destrancado.')
      ctx.flashToast?.(locked ? 'Canal trancado' : 'Canal destrancado')
      return { chatLocked: locked }
    }
    case 'slowmode': {
      const sec = Math.min(3600, Math.max(0, Number(params.slowModeSeconds) || 0))
      await ctx.signaling.updateRoomChatModeration(ctx.roomId, { slowModeSeconds: sec })
      ctx.postSystem?.(sec ? `Slowmode: ${sec}s.` : 'Slowmode desligado.')
      ctx.flashToast?.(sec ? `Slowmode ${sec}s` : 'Slowmode off')
      return { slowModeSeconds: sec }
    }
    case 'announce':
      throw new Error('Use o editor de anúncios')
    case 'lobby':
      throw new Error('Use a tela de configuração do Lobby')
    case 'rules':
      throw new Error('Use a tela de configuração das Regras')
    case 'kick_member': {
      const authorId = params.authorId
      if (!authorId) throw new Error('Selecione um membro')
      await ctx.signaling.kickMember(authorId)
      const name = params.authorName || authorId
      ctx.postSystem?.(`${name} foi expulso do Space.`)
      ctx.flashToast?.(`${name} expulso`)
      return { ok: true }
    }
    case 'export_chat': {
      const body = exportMessagesTranscript(ctx.chat?.messages || [], {
        roomName: ctx.roomName || 'sala',
      })
      const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `voicecraft-${String(ctx.roomName || 'sala').replace(/\s+/g, '-').toLowerCase()}.txt`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      ctx.flashToast?.('Exportação iniciada')
      return { ok: true }
    }
    case 'clear_local': {
      ctx.chat.clear()
      ctx.flashToast?.('Histórico local limpo')
      return { ok: true }
    }
    case 'help':
    case 'chat_stats':
      return { ok: true }
    case 'autopurge':
      throw new Error('Use a tela de configuração do Autopurge')
    default:
      throw new Error('Comando não implementado')
  }
}
