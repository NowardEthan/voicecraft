import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import {
  emptyAnnounceDraft,
  normalizeAnnounce,
  announcePreviewText,
  isAnnounceMessage,
  sanitizeAnnounceHtml,
} from '../../src/features/chat/announceSchema.js'
import {
  emptyLobbyConfig,
  normalizeLobby,
  wrapLobbyPlaceholders,
  unwrapLobbyPlaceholders,
  applyLobbyTemplate,
  applyLobbyTemplateChips,
  isLobbyEventMessage,
  isLobbyWelcomeMessage,
} from '../../src/features/chat/lobbySchema.js'
import {
  emptyRulesConfig,
  normalizeRules,
  rulesContentFingerprint,
  memberAcceptedRules,
  spaceRequiresRulesAccept,
} from '../../src/features/chat/rulesSchema.js'
import { buildConversationRows } from '../../src/components/views/chatTimeline.js'
import { SignalingClient } from '../../src/shared/connection/signalingClient.js'
import {
  ANNOUNCEMENT_PERSISTENCE_ACTIONS,
  buildAnnouncementPersistencePlan,
  persistAnnouncementPlan,
} from '../../src/features/chat/commands/announcementPersistence.js'
import {
  __getDocData,
  __getWrites,
  __resetFirestore,
  __seedDoc,
} from './.mocks/firebase_firestore.mjs'

const SPACE = 'space-special'
const ROOM = 'room-special'
const roomPath = `vc_spaces/${SPACE}/rooms/${ROOM}`
const messagePath = (id) => `${roomPath}/messages/${id}`
const schedulePath = (id) => `${roomPath}/scheduled_announcements/${id}`

function makeClient() {
  const client = new SignalingClient()
  client.spaceId = SPACE
  client.roomId = ROOM
  client.userId = 'moderator-1'
  client.displayName = 'Mara'
  client._profile = { photoURL: 'https://cdn.test/mara.png' }
  client._scheduledAnnouncementClientFallback = true
  client._spaceCache = {
    id: SPACE,
    name: 'Editorial',
    createdBy: client.userId,
    rooms: [],
    members: [{ userId: client.userId, displayName: 'Mara' }],
  }
  __seedDoc(`vc_spaces/${SPACE}`, { createdBy: client.userId, rulesRoomId: null, rulesVersion: 0, rulesLock: false })
  __seedDoc(roomPath, { name: 'geral', type: 'text' })
  return client
}

beforeEach(() => __resetFirestore())

test('announcement normalization freezes legacy text, cover fit and editorial identity', () => {
  assert.deepEqual(emptyAnnounceDraft().coverFit, { x: 50, y: 50, zoom: 1 })
  const announce = normalizeAnnounce({
    text: '<b>Plant?o</b>   agora',
    authorMode: 'unknown',
    authorName: 'Redação',
    authorPhoto: 'javascript:bad',
    iconValue: { id: 'megaphone', name: 'megaphone', collection: 'ph', style: 'invalid' },
    cover: 'https://cdn.test/cover.png',
    coverFit: { x: -10, y: 101.27, zoom: 9 },
    badgeColor: '#BADHEX',
    accent: '#112233',
    scheduledFor: '12345',
  })

  assert.equal(announce.body, 'Plant?o agora')
  assert.equal(announce.authorMode, 'custom')
  assert.equal(announce.authorName, 'Redação')
  assert.equal(announce.authorPhoto, '')
  assert.deepEqual(announce.iconValue, { id: 'megaphone', name: 'megaphone', collection: 'ph', style: 'outline' })
  assert.equal(announce.cover, 'https://cdn.test/cover.png')
  assert.deepEqual(announce.coverFit, { x: 0, y: 100, zoom: 2.5 })
  assert.equal(announce.badgeColor, '#f5b942')
  assert.equal(announce.accent, '#112233')
  assert.equal(announce.scheduledFor, 12345)
  assert.equal(announcePreviewText(announce), 'Plant?o agora')
  assert.equal(isAnnounceMessage({ announce: {} }), true)
})

test('rich text sanitizer structurally preserves editor output and strips hostile payloads', () => {
  const safe = sanitizeAnnounceHtml(
    '<div style="text-align: center; margin-left: 40px; position: fixed">'
      + '<b>Alerta</b><font face="Georgia, serif" size="4" color="#ff0000"> formatado</font>'
      + '<span class="lobby-ph" data-ph="user" contenteditable="false">Ana</span>'
      + '<img src=x onerror=alert(1)><a href="javascript:alert(2)">link</a>'
      + '<svg><script>alert(3)</script></svg><iframe srcdoc="<script>alert(4)</script>"></iframe>'
      + '</div>',
  )

  assert.match(safe, /<div style="[^"]*text-align:s*center;?[^"]*margin-left:s*40px;?[^"]*">/)
  assert.match(safe, /<b>Alerta<\/b>/)
  assert.match(safe, /<font face="Georgia, serif" size="4" color="#ff0000">/)
  assert.match(safe, /class="lobby-ph"/)
  assert.match(safe, /data-ph="user"/)
  assert.match(safe, /contenteditable="false"/)
  assert.match(safe, />link</)
  assert.doesNotMatch(safe, /script|iframe|svg|img|href|onerror|position|javascript/i)
})

test('announcement persistence plan publishes the current unsaved scheduled draft', async () => {
  const plan = buildAnnouncementPersistencePlan({
    draft: {
      title: 'Edi??o ainda n?o salva',
      bodyHtml: '<b>Texto atual</b>',
      scheduledFor: Date.now() + 120_000,
    },
    scheduleOn: false,
    scheduledId: 'schedule-draft',
  })
  assert.equal(plan.action, ANNOUNCEMENT_PERSISTENCE_ACTIONS.PUBLISH_SCHEDULED_NOW)
  assert.equal(plan.payload.title, 'Edi??o ainda n?o salva')
  assert.equal(plan.payload.body, 'Texto atual')
  assert.equal(plan.payload.scheduledFor, null)

  const calls = []
  const signaling = {
    publishScheduledAnnouncementNow: async (...args) => { calls.push(args); return { ok: true } },
  }
  await persistAnnouncementPlan({ signaling, roomId: ROOM, plan })
  assert.deepEqual(calls, [[ROOM, 'schedule-draft', plan.payload]])
})

test('lobby normalization freezes legacy join/leave flags, templates and cover fit', () => {
  assert.deepEqual(emptyLobbyConfig().bannerFit, { x: 50, y: 50, zoom: 1 })
  const legacy = normalizeLobby({
    enabled: 1,
    showJoinsLeaves: false,
    body: '<b>Ol?</b> {{username}}',
    bannerFit: { x: 12.34, y: 87.66, zoom: 1.234 },
    authorMode: 'invalid',
    authorName: 'Portaria',
  })
  assert.equal(legacy.showJoins, false)
  assert.equal(legacy.showLeaves, false)
  assert.equal(legacy.body, 'Ol? {{username}}')
  assert.deepEqual(legacy.bannerFit, { x: 12.3, y: 87.7, zoom: 1.23 })
  assert.equal(legacy.authorMode, 'system')
  assert.equal(legacy.authorName, 'Portaria')

  const wrapped = wrapLobbyPlaceholders('Oi {{NAME}}, {{server}} tem {{members}} pessoas')
  assert.match(wrapped, /data-ph="user"/)
  assert.match(wrapped, /data-ph="space"/)
  assert.match(wrapped, /data-ph="count"/)
  assert.equal(unwrapLobbyPlaceholders(wrapped), 'Oi {{user}}, {{space}} tem {{count}} pessoas')
  assert.equal(
    applyLobbyTemplate(wrapped, { user: 'Ana', space: 'Voice', count: 42 }),
    'Oi Ana, Voice tem 42 pessoas',
  )
  assert.match(applyLobbyTemplateChips('{{user}} em {{space}}', { user: 'Ana', space: 'Voice' }), /data-ph="user"[^>]*>Ana</)
  assert.equal(isLobbyEventMessage({ lobbyEvent: {} }), true)
  assert.equal(isLobbyWelcomeMessage({ id: '__lobby_welcome__' }), true)
})

test('rules normalization and acceptance freeze version and content semantics', () => {
  assert.deepEqual(emptyRulesConfig().bannerFit, { x: 50, y: 50, zoom: 1 })
  const rules = normalizeRules({
    enabled: true,
    lockSpace: true,
    version: '3.9',
    title: 'Conduta',
    body: '<b>Respeite</b> {{space}}',
    bannerFit: { x: 150, y: -3, zoom: 0 },
    authorMode: 'custom',
    authorName: 'Conselho',
  })
  assert.equal(rules.version, 3)
  assert.equal(rules.body, 'Respeite {{space}}')
  assert.deepEqual(rules.bannerFit, { x: 100, y: 0, zoom: 1 })
  assert.equal(rules.authorMode, 'custom')
  assert.equal(rules.authorName, 'Conselho')
  assert.equal(memberAcceptedRules({ rulesAcceptedVersion: 2 }, rules), false)
  assert.equal(memberAcceptedRules({ rulesAcceptedVersion: 3 }, rules), true)
  assert.equal(spaceRequiresRulesAccept({ space: { rooms: [{ rules }] }, member: { rulesAcceptedVersion: 2 } }), true)

  const cosmeticChange = { ...rules, accent: '#ffffff', badgeColor: '#000000', authorName: 'Outro' }
  assert.equal(rulesContentFingerprint(cosmeticChange), rulesContentFingerprint(rules))
  assert.notEqual(rulesContentFingerprint({ ...rules, body: 'Nova regra' }), rulesContentFingerprint(rules))
})

test('timeline classifies special cards and keeps adjacent ordinary messages separated', () => {
  const rows = buildConversationRows([
    { id: 'a', authorId: 'u', ts: 1_000, text: 'antes' },
    { id: 'legacy-sys', authorId: 'system', kind: 'sys', ts: 2_000, text: 'x'.repeat(61) },
    { firestoreId: 'announce-doc', authorId: 'u', ts: 3_000, announce: { title: 'A' } },
    { id: '__lobby_welcome__', kind: 'lobby_welcome', ts: 4_000 },
    { id: 'lobby-event', ts: 5_000, lobbyEvent: { type: 'join' } },
    { id: 'b', authorId: 'u', ts: 6_000, text: 'depois' },
  ], { hideInitialDay: true, groupBreakMs: 60_000 })

  assert.deepEqual(rows.map((row) => row.kind), [
    'msg', 'sys', 'announce', 'lobby_welcome', 'lobby_event', 'msg',
  ])
  assert.equal(rows[2].key, 'card-announce-doc')
  assert.deepEqual(rows.filter((row) => row.kind === 'msg').map((row) => row.items.map((item) => item.id)), [['a'], ['b']])
})

test('immediate publication supports legacy payload, preview and editorial identity', async () => {
  const client = makeClient()
  const published = await client.sendChatAnnouncement(ROOM, 'Aviso legado')

  assert.equal(published.kind, 'announce')
  assert.equal(published.text, 'Aviso legado')
  assert.equal(published.author, 'sistema')
  assert.equal(published.authorId, client.userId)
  assert.equal(published.announce.body, 'Aviso legado')
  assert.equal(published.announce.scheduledFor, null)
  assert.deepEqual(published.announce.coverFit, { x: 50, y: 50, zoom: 1 })
  assert.deepEqual(__getDocData(messagePath(published.id)), published)
  const room = __getDocData(roomPath)
  assert.equal(room.lastMessageId, published.id)
  assert.equal(room.lastMessagePreview, 'Aviso legado')
})

test('published announcement editing preserves message identity and original timestamp', async () => {
  const client = makeClient()
  __seedDoc(roomPath, { name: 'geral', type: 'text', lastMessageId: 'announcement-1', lastMessagePreview: 'Antigo' })
  __seedDoc(messagePath('announcement-1'), {
    id: 'announcement-1',
    kind: 'announce',
    authorId: client.userId,
    author: 'Redação antiga',
    ts: 777,
    announce: { title: 'Antigo' },
  })

  const edited = await client.updateChatAnnouncement(ROOM, 'announcement-1', {
    title: 'Novo t?tulo',
    bodyHtml: '<p>Texto</p><script>alert(1)</script>',
    authorMode: 'custom',
    authorName: 'Nova reda??o',
  })

  assert.equal(edited.id, 'announcement-1')
  assert.equal(edited.ts, 777)
  assert.equal(edited.text, 'Novo t?tulo')
  assert.equal(edited.author, 'Nova reda??o')
  assert.equal(edited.edited, true)
  assert.doesNotMatch(edited.announce.bodyHtml, /script/i)
  assert.equal(__getDocData(messagePath('announcement-1')).id, 'announcement-1')
  assert.equal(__getDocData(roomPath).lastMessagePreview, 'Novo t?tulo')
  assert.equal(__getDocData(roomPath).lastAuthorName, 'Nova reda??o')
})

test('scheduling and scheduled editing retain preview payload and schedule identity', async () => {
  const client = makeClient()
  const publishAt = Date.now() + 120_000
  const scheduled = await client.scheduleChatAnnouncement(ROOM, {
    title: 'Programado',
    body: 'Corpo',
    scheduledFor: publishAt,
    authorMode: 'custom',
    authorName: 'Agenda',
    coverFit: { x: 25, y: 75, zoom: 1.5 },
  })

  assert.equal(scheduled.status, 'scheduled')
  assert.equal(scheduled.publishAt, publishAt)
  assert.equal(scheduled.announce.scheduledFor, publishAt)
  assert.deepEqual(scheduled.announce.coverFit, { x: 25, y: 75, zoom: 1.5 })
  assert.deepEqual(__getDocData(schedulePath(scheduled.id)), scheduled)

  const nextAt = Date.now() + 240_000
  const edited = await client.updateScheduledAnnouncement(ROOM, scheduled.id, {
    title: 'Reprogramado',
    scheduledFor: nextAt,
    authorMode: 'system',
    authorName: 'Agenda oficial',
  })
  assert.equal(edited.id, scheduled.id)
  assert.equal(edited.publishAt, nextAt)
  assert.equal(edited.announce.title, 'Reprogramado')
  assert.equal(__getDocData(schedulePath(scheduled.id)).publishAt, nextAt)
})

test('publish-now creates one immediate card and marks the schedule published', async () => {
  const client = makeClient()
  __seedDoc(schedulePath('schedule-now'), {
    id: 'schedule-now',
    status: 'scheduled',
    publishAt: Date.now() + 60_000,
    announce: { title: 'Agora', authorMode: 'custom', authorName: 'Plant?o' },
  })

  const firstPublish = await client.publishScheduledAnnouncementNow(ROOM, 'schedule-now', {
    title: 'Agora editado',
    body: 'Rascunho atual',
    authorMode: 'custom',
    authorName: 'Plant?o',
  })
  assert.equal(firstPublish.ok, true)
  assert.equal(firstPublish.idempotent, false)
  assert.equal(firstPublish.messageId, 'scheduled_announce_schedule-now')
  const publishedSchedule = __getDocData(schedulePath('schedule-now'))
  assert.equal(publishedSchedule.status, 'published')
  assert.ok(publishedSchedule.publishedMessageId)
  const announcementWrites = __getWrites().filter((write) => write.op === 'set' && /\/messages\//.test(write.path))
  assert.equal(announcementWrites.length, 1)
  assert.equal(announcementWrites[0].data.text, 'Agora editado')
  assert.equal(announcementWrites[0].data.announce.body, 'Rascunho atual')
  const retry = await client.publishScheduledAnnouncementNow(ROOM, 'schedule-now')
  assert.equal(retry.idempotent, true)
  assert.equal(retry.messageId, firstPublish.messageId)
  assert.equal(__getWrites().filter((write) => write.op === 'set' && /\/messages\//.test(write.path)).length, 1)
})

test('rules updates increment only editorial content versions and preserve exclusive room behavior', async () => {
  const client = makeClient()
  const previous = normalizeRules({ enabled: true, version: 4, title: 'Regras', body: 'Seja gentil' })
  __seedDoc(roomPath, { name: 'regras', type: 'text', rules: previous })
  __seedDoc(`vc_spaces/${SPACE}/rooms/other-rules`, {
    name: 'outras',
    type: 'text',
    rules: normalizeRules({ enabled: true, version: 2, title: 'Outras', body: 'Outro texto' }),
  })

  const same = await client.updateRoomRules(ROOM, { ...previous, accent: '#ffffff', authorName: 'Conselho' })
  assert.equal(same.room.rules.version, 4)
  assert.equal(__getDocData(`vc_spaces/${SPACE}/rooms/other-rules`).rules.enabled, false)

  const changed = await client.updateRoomRules(ROOM, { ...same.room.rules, body: 'Seja muito gentil' })
  assert.equal(changed.room.rules.version, 5)
})

test('lobby join event deduplicates by member/day while forced preview publishes independently', async () => {
  const client = makeClient()
  const lobby = normalizeLobby({
    enabled: true,
    title: 'Boas-vindas, {{user}}',
    body: '{{user}} entrou em {{space}}; agora somos {{count}}',
    authorMode: 'system',
    authorName: 'Portaria',
  })
  __seedDoc(roomPath, { name: 'lobby', type: 'text', lobby })

  const first = await client.sendLobbyEvent(ROOM, 'join')
  const duplicate = await client.sendLobbyEvent(ROOM, 'join')
  const preview = await client.sendLobbyEvent(ROOM, 'join', null, { force: true })

  assert.match(first.id, /^lobby_join_moderator-1_\d{8}$/)
  assert.equal(first.kind, 'lobby_event')
  assert.equal(first.text, 'Mara entrou em Editorial; agora somos 1')
  assert.equal(first.lobbyEvent.authorName, 'Portaria')
  assert.deepEqual(first.lobbyEvent.config.bannerFit, { x: 50, y: 50, zoom: 1 })
  assert.equal(duplicate, null)
  assert.notEqual(preview.id, first.id)
  const lobbyWrites = __getWrites().filter((write) => write.op === 'set' && /\/messages\/lobby_join_/.test(write.path))
  assert.equal(lobbyWrites.length, 2)
})
