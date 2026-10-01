import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createAnnouncementCardViewModel,
  createFeatureCardViewModel,
  createLobbyCardViewModel,
  createMessageCardViewModel,
  createRulesCardViewModel,
  createSystemCardViewModel,
  resolveFeatureCardPublisher,
  truncateFeatureCardText,
} from '../../src/features/chat/cards/featureCardViewModels.js'

const cardsDir = new URL('../../src/features/chat/cards/', import.meta.url)

test('shared text helpers produce bounded plain card copy', () => {
  assert.equal(truncateFeatureCardText('<b>Aviso</b> &amp; detalhes', 14), 'Aviso & detal…')
  assert.equal(truncateFeatureCardText('<script>bad()</script>Seguro', 20), 'Seguro')
})

test('announcement view model separates editorial author from verifiable publisher', () => {
  const vm = createAnnouncementCardViewModel({
    id: 'a-1',
    authorId: 'publisher-7',
    author: 'Mara',
    ts: Date.UTC(2026, 8, 30, 20, 5),
    status: 'scheduled',
    publishAt: Date.UTC(2026, 9, 1, 12, 0),
    announce: {
      title: '<b>Plantão</b>',
      bodyHtml: '<p>Uma atualização importante.</p>',
      authorMode: 'custom',
      authorName: 'Redação',
      cover: 'https://cdn.test/cover.png',
      coverFit: { x: 25, y: 75, zoom: 1.5 },
    },
  }, { timeZone: 'UTC' })

  assert.equal(vm.kind, 'announcement')
  assert.equal(vm.title, 'Plantão')
  assert.equal(vm.snippet, 'Uma atualização importante.')
  assert.deepEqual(vm.author, {
    id: null,
    name: 'Redação',
    photo: '',
    icon: '',
    iconValue: null,
    mode: 'custom',
  })
  assert.equal(vm.publisher.id, 'publisher-7')
  assert.equal(vm.publisher.verifiable, true)
  assert.equal(vm.media.src, 'https://cdn.test/cover.png')
  assert.deepEqual(vm.media.fit, { x: 25, y: 75, zoom: 1.5 })
  assert.equal(vm.status.id, 'scheduled')
  assert.equal(vm.time.timestamp, Date.UTC(2026, 9, 1, 12, 0))
})

test('rules and lobby view models resolve contextual content and state', () => {
  const rules = createRulesCardViewModel({
    title: 'Regras de {{space}}',
    body: 'Olá {{user}}, somos {{count}}.',
    authorMode: 'system',
    authorName: 'Moderação',
    banner: 'https://cdn.test/rules.png',
  }, {
    id: 'rules-card',
    accepted: true,
    context: { space: 'Voice', user: 'Ana', count: 42 },
  })
  assert.equal(rules.title, 'Regras de Voice')
  assert.equal(rules.snippet, 'Olá Ana, somos 42.')
  assert.equal(rules.status.id, 'accepted')

  const lobby = createLobbyCardViewModel({
    id: 'join-1',
    ts: 1234,
    lobbyEvent: {
      title: 'Boas-vindas, {{user}}',
      config: { body: '{{user}} entrou em {{space}}', authorName: 'Portaria' },
    },
  }, { context: { user: 'Bia', space: 'Voice' } })
  assert.equal(lobby.title, 'Boas-vindas, Bia')
  assert.equal(lobby.snippet, 'Bia entrou em Voice')
  assert.equal(lobby.author.name, 'Portaria')
})

test('system and compact/pinned/highlight message variants share one shape', () => {
  const system = createSystemCardViewModel({ id: 's', kind: 'sys', text: 'Manutenção hoje', ts: 1000 })
  assert.equal(system.kind, 'system')
  assert.equal(system.status.id, 'system')

  for (const variant of ['compact', 'pinned', 'highlight']) {
    const vm = createMessageCardViewModel({ id: variant, text: 'Mensagem curta', ts: 1000 }, { variant })
    assert.equal(vm.kind, 'message')
    assert.equal(vm.variant, variant)
    assert.equal(vm.title, 'Mensagem curta')
  }
  assert.equal(createMessageCardViewModel({ pinned: true }).status.id, 'pinned')
  assert.equal(createMessageCardViewModel({}, { variant: 'highlight' }).status.id, 'highlight')
  assert.equal(createFeatureCardViewModel({ announce: { title: 'Auto' } }).kind, 'announcement')
  assert.equal(resolveFeatureCardPublisher({ author: 'Sem id' }).verifiable, false)
})

test('frame and token stylesheet expose every slot and flat responsive contract', async () => {
  const [frame, css] = await Promise.all([
    readFile(new URL('ChatFeatureCardFrame.jsx', cardsDir), 'utf8'),
    readFile(new URL('featureCards.css', cardsDir), 'utf8'),
  ])
  for (const slot of ['media', 'badge', 'icon', 'content', 'title', 'body', 'identity', 'status', 'actions']) {
    assert.match(frame, new RegExp(`data-slot=["']${slot}["']`))
  }
  for (const token of ['width', 'radius', 'gap', 'title-size', 'body-size', 'surface', 'border']) {
    assert.match(css, new RegExp(`--vc-feature-card-${token}:`))
  }
  assert.match(css, /@media \(max-width: 639px\)/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /--vc-feature-card-surface:\s*var\(--vc-conversation-card,\s*var\(--vc-surface-1,\s*#141922\)\)/)
  assert.match(css, /background-color:\s*var\(--vc-feature-card-surface,\s*var\(--vc-conversation-card/)
  assert.match(css, /border-top:\s*1px solid var\(--vc-conversation-line/)
  assert.match(css, /\.vc-feature-card__media[\s\S]*?border-bottom:\s*1px solid var\(--vc-conversation-line-strong/)
  assert.match(css, /\.vc-system-card\s*\{[\s\S]*?margin-inline:\s*0/)
  assert.doesNotMatch(css, /linear-gradient|radial-gradient|box-shadow/)
})
test('manager previews reuse production card renderers and fitted covers', async () => {
  const root = new URL('../../', import.meta.url)
  const [editor, rulesSettings, lobbySettings, manager] = await Promise.all([
    readFile(new URL('src/features/chat/commands/AnnounceEditor.jsx', root), 'utf8'),
    readFile(new URL('src/features/chat/commands/RulesSettings.jsx', root), 'utf8'),
    readFile(new URL('src/features/chat/commands/LobbySettings.jsx', root), 'utf8'),
    readFile(new URL('src/features/chat/commands/AnnounceManager.jsx', root), 'utf8'),
  ])

  assert.match(editor, /<AnnouncementCard msg=\{previewMsg\} preview/)
  assert.match(editor, /ANNOUNCE_SIZES\.map/)
  assert.match(rulesSettings, /<RulesCard[\s\S]*?preview/)
  assert.match(lobbySettings, /<LobbyJoinCard[\s\S]*?preview/)
  assert.match(lobbySettings, /Postar teste real/)
  assert.match(lobbySettings, /persiste um card real/)
  assert.match(manager, /<SpaceCoverLayer src=\{a\.cover\} fit=\{a\.coverFit\}/)
})

test('special renderers are explicit and compact surfaces reuse shared view models', async () => {
  const root = new URL('../../', import.meta.url)
  const [bubble, timeline, topics, pins, announcement, rules, lobby] = await Promise.all([
    readFile(new URL('src/components/views/MessageBubble.jsx', root), 'utf8'),
    readFile(new URL('src/components/views/chatTimeline.js', root), 'utf8'),
    readFile(new URL('src/components/views/TopicCardsRow.jsx', root), 'utf8'),
    readFile(new URL('src/features/chat/PinnedMessagesPanel.jsx', root), 'utf8'),
    readFile(new URL('src/features/chat/AnnouncementCard.jsx', root), 'utf8'),
    readFile(new URL('src/features/chat/RulesCards.jsx', root), 'utf8'),
    readFile(new URL('src/features/chat/LobbyCards.jsx', root), 'utf8'),
  ])

  assert.match(bubble, /createSystemCardViewModel\(msg\)/)
  assert.match(bubble, /msg\.kind === ['"]sys['"]/)
  assert.doesNotMatch(bubble, /text\.length\s*>\s*60|text\.includes\(['"]\\n['"]\)/)
  assert.match(timeline, /message\?\.kind === ['"]sys['"]\) return ['"]sys['"]/)
  assert.doesNotMatch(timeline, /length\s*>\s*60/)
  assert.match(topics, /createAnnouncementCardViewModel\(message/)
  assert.match(pins, /createAnnouncementCardViewModel\(message/)
  assert.match(pins, /createMessageCardViewModel\(message/)
  for (const source of [announcement, rules, lobby]) assert.match(source, /ChatFeatureCardFrame/)
})
