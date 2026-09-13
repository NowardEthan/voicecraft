# Contrato de Aceite — Chat estilo Discord completo (Fase 2 / Iteração de chat)

**Status:** CONGELADO (`criterios.congelado: true`)
**Data:** 2026-09-11
**Release de referência (preservar):** 0.2.2
**Escopo:** chat estilo Discord completo + remoção/substituição do dropdown "Mover para grupo" em `SpaceRoomsNav`.

---

## 0. Resumo executivo (TL;DR)

| Camada | O que muda | Onde |
|---|---|---|
| UI do chat | Action bar no hover (3 emojis + reação + responder + mais), editar com atalho ↑, cancelar com Esc, badge dourado de menção/resposta, linha de conexão curva, banner "Respondendo a", botão "Pular para o final", Markdown completo (bold/italic/strike/quote/code/spoiler), jumbomoji, typing indicator 3 pontinhos, pílula `@fulano` clicável, Ctrl+V de imagem, divisor de data, agrupamento temporal | `src/components/views/MessageBubble.jsx`, `MessageList.jsx`, `Composer.jsx`, novo `src/features/chat/markdown.jsx`, novo `src/features/chat/typing.js` |
| UX/Sidebar | Dropdown `<select>` "Mover para grupo" removido; substituído por menu de 3-pontos (popover) com "Mover para…" listando grupos | `src/features/rooms/views/SpaceRoomsNav.jsx` (linhas 386–398) |
| Backend / Regras | 1 linha de `firestore.rules` alterada: `resource.data.userId` → `resource.data.authorId` no update/delete de messages (Phase 2 §defaults) | `firestore.rules` linha do match `messages` |
| Compatibilidade | Data channel e `signaling.sendChatMessage` / `signaling.listenChat` mantidos; sem mudança de protocolo (Phase 2 §P0) | `src/hooks/useChat.js` |
| Release | Nada relacionado a release 0.2.2 é tocado (artefatos, latest.yml, package.json version) | `release/`, `package.json` |

---

## 1. Critérios de aceite (C1–C24)

Cada critério tem: **requisito** + **método de verificação** + **evidência necessária para APROVADO**.

### 1.1 Markdown completo no chat

#### C1 — Bold, italic, strikethrough, quote, code, code-block, spoiler e link renderizam no chat
**Requisito:** Texto de mensagem do chat renderiza os seguintes elementos Markdown **apenas no corpo da mensagem** (NUNCA em nome de sala, perfil ou header):
- `**negrito**` → `<strong>`
- `*itálico*` ou `_itálico_` → `<em>`
- `~~riscado~~` → `<s>`
- `> citação` (1 linha e bloco) → `<blockquote>` com **barrinha lateral esquerda**
- `` `código inline` `` → `<code>`
- ``` ```bloco``` ``` → `<pre><code>` com **syntax highlight** quando linguagem for reconhecível (js, ts, jsx, tsx, json, html, css, bash/sh, py, go, rs, java, c, cpp, sql, md)
- `||spoiler||` → bloco preto/blur **clicável** que revela ao clicar (estilo Discord)
- `[texto](url)` → link com hover-preview do destino

**Método:** Inspecionar HTML renderizado (DOM) após enviar `**x**`, `*x*`, `~~x~~`, `> x`, `` `x` ``, ` ```js\nx\n``` `, `||x||`, `[x](https://exemplo.com)`.

**Evidência APROVADO:**
- `data-testid` ou seletor único em cada tipo (`vc-md-strong`, `vc-md-em`, `vc-md-s`, `vc-md-quote`, `vc-md-code-inline`, `vc-md-code-block`, `vc-md-spoiler`, `vc-md-link`) presente no DOM.
- Spoiler renderiza com classe `vc-md-spoiler` e tem `role="button"` + `aria-expanded="false"` até clicar; após 1 clique, `aria-expanded="true"` e o conteúdo textual vira visível.
- Code-block tem `<pre data-lang="js"><code class="hljs language-js">…</code></pre>` (ou equivalente com classes highlight.js).
- Quote tem `<blockquote class="vc-md-quote">` com `border-left: 2px solid var(--vc-border)` (ou token equivalente).

**Não-objetivo:** Não renderiza Markdown em `room.name`, `room.description`, `member.displayName`, `space.name`, cabeçalho do chat, composer placeholder.

---

#### C2 — Jumbomoji: 1–3 emojis consecutivos sem texto = super-emojis grandes
**Requisito:** Quando uma mensagem for composta **apenas por 1 a 3 caracteres emoji** (sem texto adicional, sem espaços, sem pontuação, sem outros caracteres), a renderização usa tamanho "jumbo" (≥ 2.6× o tamanho base do texto, normalmente ~40px+). Fora dessa condição, texto normal.

**Detecção:**
- Strip de **todos** os caracteres que não são emojis (`\p{Extended_Pictographic}` + `\u{FE0F}` + ZWJ + VS16).
- Se a string restante for `>=1` e `<=3` grafemas E o texto original não tiver outros caracteres → jumbomoji.

**Método:** Enviar `"😀"`, `"🔥"`, `"❤️"`, `"😀🔥"`, `"😀🔥💯"`, `"😀🔥💯🚀"` (4 → não jumbo). Conferir tamanho da fonte.

**Evidência APROVADO:**
- Mensagem com 1 emoji: font-size ≥ 36px (ou classe `vc-jumbo` aplicada).
- Mensagem com 3 emojis: idem.
- Mensagem com 4 emojis ou com texto misturado: NÃO jumbo (renderização padrão ~14–15px).

**Restrição:** Apenas caracteres emoji unicode (sem `:joy:` / `:fire:` — Phase 2 §defaults). Shortcodes `:foo:` renderizam como texto literal por enquanto.

---

#### C3 — Menções `@<nome>` clicáveis com pílula azul
**Requisito:** Texto da forma `@fulano` (handle ou displayName) vira pílula clicável. Cor de fundo `var(--space-accent)` ou `bg-accent/[0.18]` com texto `text-accent` (ou token equivalente do accent), arredondada `rounded-pill` ou similar. Hover escurece (`hover:bg-accent/[0.28]` ou `hover:opacity-90`). Clique → abre `ProfilePopover` do autor (via `window.__vcOpenProfile`).

**Método:** Enviar `"oi @alice tudo bem?"` e clicar no chip `@alice`.

**Evidência APROVADO:**
- DOM contém `<button class="vc-mention" data-handle="alice">@alice</button>` (ou seletor equivalente).
- Após clique, `ProfilePopover` é aberto (estado global `accountOpen` muda, ou popover aparece).
- Texto não-mencionado fora do chip permanece em texto corrido normal.
- `@everyone` ou menção a si mesmo **NÃO** dispara notificação nesta iteração (NG).

---

### 1.2 Action bar no hover e menu "Mais"

#### C4 — Action bar no hover com 3 emojis rápidos + adicionar reação + responder + mais
**Requisito:** Toda mensagem (não-deletada) mostra, **ao hover do mouse OU foco do teclado**, uma barra de ação posicionada no canto superior direito da mensagem com:
1. Botão `+ Smile` (adicionar reação via picker)
2. Botão ↩ (responder)
3. Botão `•••` (Mais)

**Método:** Passar o mouse sobre uma mensagem, conferir a barra visível (`opacity-100`); mover o mouse para fora, conferir `opacity-0` (mas acessível via `focus-within` se algum botão recebeu foco).

**Evidência APROVADO:**
- DOM tem `<div data-msg-actionbar data-msg-id="…">` com `Smile`, `CornerUpLeft`, `MoreHorizontal` ícones.
- A barra é `opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity` (mesma forma que já existe na `MessageBubble.jsx` linhas 311–349).
- Em touch (`@media (hover: none)`), a barra fica visível por padrão (`opacity-100`) ou aparece no tap.

---

#### C5 — Menu "Mais" (•••) com Fixar, Copiar ID, Marcar não lida, Deletar
**Requisito:** Clicar em `•••` abre menu popover (mesmo padrão de portal já usado em `MessageBubble` linhas 354–378) com itens:
1. **Copiar texto** (já existe)
2. **Editar** (já existe; só quando `isMine`)
3. **Fixar mensagem** (toggle; só visível se `canModerate` ou em mensagens próprias; persiste flag `pinned: true` no doc)
4. **Copiar ID** (copia `msg.id` para clipboard)
5. **Marcar não lida** (atualiza `lastRead` no `unreadStore` para `< msg.ts`)
6. **Excluir** (já existe; só quando `isMine || canModerate`)

**Método:** Inspecionar DOM do menu popover quando aberto; clicar em "Copiar ID"; verificar clipboard = `msg.id`. Clicar "Marcar não lida"; verificar `getLastRead(...) < msg.ts`.

**Evidência APROVADO:**
- DOM do menu tem `data-action="copy-id"`, `data-action="mark-unread"`, `data-action="pin"` etc.
- `navigator.clipboard.writeText` é chamado com `msg.id` em "Copiar ID".
- `setLastRead(currentUserId, spaceId, roomId, { at: msg.ts - 1 })` é chamado em "Marcar não lida" — confirmado inspecionando `localStorage` `voicecraft:unread:<userId>` (ou estrutura equivalente usada por `unreadStore`).
- "Fixar" alterna estado e mostra ícone visivelmente (badge `📌` ou similar) na `MessageBubble` quando `msg.pinned === true`.

---

#### C6 — Edição de mensagem com Enter salva, Esc cancela
**Requisito:** Em modo de edição (acionado por **Clicar em "Editar"** OU **pressionar Seta para cima** sobre uma mensagem própria quando o composer está vazio e o foco está no composer — ver C10):
- Enter salva e sai do modo edição.
- Esc cancela e restaura o texto original.
- Mostrar botão `cancelar` / `salvar` (já existe nas linhas 414–446).

**Método:** Já parcialmente implementado. Verificar via teclado: focar mensagem, pressionar ↑ — entra em edição? (atalho novo), digitar texto, pressionar Enter — texto novo aparece com `(editada)`?

**Evidência APROVADO:**
- Após salvar com Enter, `msg.text` foi atualizado e `msg.edited === true`, `msg.editedAt` > 0.
- Após Esc, `msg.text` permanece com o valor original (sem `(editada)`).

---

#### C7 — Atalhos de teclado globais (Seta para cima = editar última, Esc = cancelar)
**Requisito:**
- **Seta para cima** quando o composer está focado e o texto do composer está vazio → entrar em modo de edição da **última mensagem própria** (mais recente com `direction === 'out'` ou `authorId === currentUserId`).
- **Esc** dentro do `EditBox` → cancelar edição.
- **Esc** quando o composer está focado e há um `replyTo` pendente → cancelar o reply.
- **Esc** quando há menu popover aberto → fechar o menu.

**Método:** Inspecionar listener `keydown` global no composer e na `MessageBubble` em modo edição.

**Evidência APROVADO:**
- Listener `keydown` em `Composer.jsx` captura `ArrowUp` quando `text === ''` e foca o textarea de edição da última mensagem própria.
- Listener no `EditBox` captura `Escape` e chama `onCancel()`.

---

### 1.3 Linha de conexão, badge dourado de menção/resposta

#### C8 — Linha de conexão curva (mini-avatar) na resposta
**Requisito:** Mensagens com `replyTo` mostram acima do corpo da mensagem:
- **Mini-avatar** (16–20 px) do autor da mensagem original.
- **Linha de conexão curva** à esquerda (estilo Discord) ligando o chip ao avatar da mensagem pai no scroll.

**Método:** Já existe `<ReplyThread>` (linhas 383–412). Verificar que o estilo da "linha" inclui um elemento visual curvo (não apenas uma barra reta). Pode ser implementado com um path SVG simples ou com `border-l border-t rounded-tl` (já existe) + um mini-avatar.

**Evidência APROVADO:**
- DOM da ReplyThread contém `<PersonAvatar size={14|16|18} />` E um elemento visual curva/conector.
- Clicar no chip pula para a mensagem original (`onJumpToReply` chama `jumpToMessage` em `MessageList.jsx` linhas 131–143).

---

#### C9 — Badge dourado de menção/resposta com borda lateral
**Requisito:** Quando uma mensagem **é resposta** OU **menciona o usuário atual**:
- **Borda lateral esquerda** de 2 px com cor `--vc-warning` (#F5B942) ou token dourado.
- **Badge no header**: ícone `@` pequeno dourado antes do nome do autor OU texto "respondendo a X" se for reply.

**Método:** Enviar mensagem com `@me` (substituir pelo próprio handle); observar borda e badge.

**Evidência APROVADO:**
- `<div data-msg-id="…" class="… vc-mentions-me vc-is-reply">` tem `border-left: 2px solid var(--vc-warning)` (estilo inline ou classe Tailwind customizada).
- Header tem badge `<span class="vc-mention-badge">@fulano</span>` próximo ao nome do autor.

---

### 1.4 Divisores de data, agrupamento, indicador "Nova mensagem"

#### C10 — Divisor de data entre mensagens de dias diferentes
**Requisito:** Já implementado (`formatDayLabel` em `MessageList.jsx` linhas 45–53, `DayDivider` linhas 300–308). Manter comportamento e estilo: linha horizontal + label centralizada.

**Método:** Inserir mensagens com timestamps de 2 dias diferentes e verificar divisor `Hoje / Ontem / dd de mês`.

**Evidência APROVADO:**
- Comportamento já passa em release 0.2.2 (mantido).
- Divisor tem `aria-hidden` ou `role="separator"` para leitores de tela.

---

#### C11 — Agrupamento temporal por autor (≥5 min quebra grupo)
**Requisito:** Já implementado (`GROUP_BREAK_MS = 5 * 60 * 1000` em `MessageList.jsx` linha 13; mesma lógica linhas 174–205). Manter.

**Evidência APROVADO:**
- 4 mensagens próprias em sequência dentro de 5 min viram 1 grupo com header único + 3 mensagens "filhas".
- 5ª mensagem 6 min depois começa novo grupo.

---

#### C12 — Indicador "Nova mensagem" + botão "Pular para o final"
**Requisito:** Já parcialmente implementado (`unseen` + pill `N mensagens novas ↓` linhas 280–295 do `MessageList`).
- Quando o usuário rola para cima e mensagens novas chegam, contador aparece.
- Pill azul (`bg-accent`) clica em `scrollToBottom` (linhas 149–155).

**Método:** Scrollar para o meio do histórico, receber nova mensagem via signaling, clicar no botão.

**Evidência APROVADO:**
- Pill com texto `1 mensagem nova` ou `N mensagens novas` aparece com `bg-accent text-strong`.
- Click → `scrollTop = scrollHeight` e contador volta a 0.

---

### 1.5 Composer avançado

#### C13 — Banner "Respondendo a @fulano" com botão Cancelar
**Requisito:** Já implementado em `Composer.jsx` linhas 149–172. Manter comportamento e visual. Adicionar:
- Quando o autor da mensagem reply tem `handle`, mostrar `@handle` em vez de `displayName`.
- Cor de destaque `text-accent` (já tem).

**Evidência APROVADO:**
- Clicar em "Responder" de uma mensagem com handle "alice" → banner mostra "respondendo a @alice".
- Botão × chama `onCancelReply()` (linha 164).

---

#### C14 — Ctrl+V de imagem com preview no composer
**Requisito:** Listener `paste` global no composer captura itens do `ClipboardEvent.clipboardData`. Se houver `items[i].kind === 'file'` e `type.startsWith('image/')`, o arquivo é adicionado ao `attachment` exatamente como o `+ Plus` já faz (chamar `handleFile` com um pseudo-input event). Preview mostra imagem (`dataUrl`) e botão × de remover (já existe).

**Método:** Copiar uma imagem (ex.: screenshot), focar o composer, Ctrl+V. Conferir que o preview aparece e a mensagem envia com a imagem anexada.

**Evidência APROVADO:**
- Listener `onPaste` em `<textarea>` chama `e.clipboardData.items`, itera, encontra `kind === 'file'` e cria um `File` via `getAsFile()`.
- Arquivo passa por `MAX_IMAGE_BYTES` (6MB) — se exceder, mostra `sizeError` (já existe).
- Se houver texto colado junto, ele vai para o textarea normalmente (não conflitar).

---

#### C15 — Typing indicator "Fulano está digitando…" com 3 pontinhos animados
**Requisito:** Quando outro peer está digitando (sinalizado via signaling/data channel), mostrar abaixo do composer (entre o composer e o fim da lista) o texto `fulano está digitando…` com 3 pontinhos animados (CSS keyframe `vc-anim-typing-dot`).

**Implementação:**
- Novo módulo `src/features/chat/typing.js` com `subscribeTyping(channel, peerId, cb)` e `broadcastTyping(channel)`.
- Throttle: emite no máx. 1 evento a cada 2s enquanto há texto; emite `{state: 'stop'}` ao composer perder foco ou ficar vazio por 2s.
- Listener no peer: ao receber `typing:start` do peer, mostrar UI por 4s (TTL); ao receber `typing:stop` ou timeout, esconder.

**Método:** Abrir 2 instâncias (`npm run dev:multi`). Em uma, começar a digitar; verificar que a outra mostra "fulano está digitando…" abaixo do composer com pontinhos animados.

**Evidência APROVADO:**
- DOM tem `<div data-typing-indicator class="vc-typing">fulano está digitando<span class="vc-typing-dots">…</span></div>` com `aria-live="polite"`.
- 3 spans `.vc-typing-dot` com `animation-delay: 0s, 0.15s, 0.3s` e keyframe de opacidade (0.2 → 1 → 0.2).
- Para de aparecer ≤ 4s após o peer parar de digitar.
- `prefers-reduced-motion: reduce` desativa a animação (estático `…`).

---

### 1.6 Substituição do dropdown "Mover para grupo"

#### C16 — Dropdown `<select>` removido; substituído por botão de 3-pontos e popover "Mover para…"
**Requisito:** Em `src/features/rooms/views/SpaceRoomsNav.jsx` (linhas 386–398), o `<select>` com `aria-label="Mover para grupo"` é **removido**. No lugar:
- Botão `•••` (ícone `MoreHorizontal` do Lucide) ao lado dos botões `Pencil` e `Trash2` que já existem.
- Click no `•••` abre **popover** (portal ou absolute) com lista de grupos: cada item é uma opção "Mover para <Nome do grupo>"; item "Sem grupo" / "Remover do grupo" quando a sala já está em algum grupo.

**Método:** Logar como usuário com `canManage = true`, criar 2 grupos, arrastar uma sala para um grupo, abrir o menu `•••`, escolher outro grupo.

**Evidência APROVADO:**
- Nenhum `<select aria-label="Mover para grupo">` no DOM (verificar via grep + inspetor).
- Botão `•••` abre popover com 2 botões (um por grupo) + opção "Sem grupo".
- Selecionar um grupo chama `moveRoomToGroup(room.id, gid)` (já existe linhas 104–114).
- Popover tem `role="menu"`, items com `role="menuitem"`, fecha ao clicar fora ou pressionar Esc.

**Invariante:** Drag-and-drop de salas entre grupos **continua funcionando** (`onRoomDrop`, `onDragStart`, `onDropAt` linhas 92–102, 215–254). Não foi removido.

---

### 1.7 Envio otimista e fluxo de mensagens

#### C17 — Envio otimista
**Requisito:** Ao enviar, a mensagem aparece **imediatamente** com `status: 'sending'` antes de ir ao servidor. Já implementado em `useChat.js` linhas 393–398 (`appendMessage({...msg, direction: 'out', status: 'sending'})`).

**Evidência APROVADO:**
- Comportamento já passa; manter. `MessageBubble.jsx` linhas 467–488 (StatusIndicator) mostra spinner durante `sending` e ícone de retry em `failed`.

---

#### C18 — Reconciliação de mensagens via Firestore
**Requisito:** O `useChat` já escuta via `signaling.listenChat(spaceId, roomId, cb)` (linhas 139–159). Ao receber lista do Firestore, a UI mescla:
- Mensagens remotas entram no array.
- Mensagens `pending` (status `sending` com id próprio) são preservadas se não estão na lista do servidor (evita piscar).
- Dedupe por `id`.

**Evidência APROVADO:**
- `next = [...remote, ...pending].sort((a, b) => (a.ts || 0) - (b.ts || 0))` (linha 154).
- IDs repetidos não causam duplicação visual.

---

### 1.8 Regras de chat (firestore)

#### C19 — `firestore.rules` libera update/delete de messages por `authorId`
**Requisito:** A linha do match `/messages/{messageId}`:
```
allow update, delete: if signedIn() && (
  resource.data.userId == request.auth.uid
  || canModChat(spaceId)
);
```
Deve ser alterada para:
```
allow update, delete: if signedIn() && (
  resource.data.authorId == request.auth.uid
  || canModChat(spaceId)
);
```

**Método:** Inspecionar `firestore.rules` linha do match de `messages`.

**Evidência APROVADO:**
- Diff entre release 0.2.2 e novo commit mostra exatamente 1 linha alterada nessa região.
- Teste manual: usuário A edita/deleta mensagem própria → OK; usuário B tenta editar/deleta de A → NEGADO pelo Firestore (log do Firebase).

---

### 1.9 Não-objetivos / comportamento

#### C20 — Markdown NÃO é processado fora do corpo da mensagem
**Requisito:** Confirmado no DEFAULT da Phase 2. Verificar que `room.name`, `room.description`, `member.displayName`, `space.name`, cabeçalho do chat e composer placeholder renderizam texto cru.

**Evidência APROVADO:**
- Sala com nome `**teste**` mostra literalmente `**teste**` (sem `<strong>`).
- Header da sala com descrição `> olá` mostra literalmente `> olá`.

---

#### C21 — Densidade do chat continua funcionando
**Requisito:** As 3 densidades (`compacto`, `confortavel`, `espacado`) de `chatDensity.js` continuam operacionais, e o `ChatDensityMenu` no header continua alternando.

**Evidência APROVADO:**
- Build passa; toggle no header altera `dens.row`, `dens.group`, `dens.listPy`, `dens.dividerPy` (já implementado).

---

#### C22 — Reações, edição, exclusão, reply, lightbox continuam funcionando
**Requisito:** Toda a paridade de comportamento já presente em release 0.2.2 (MessageBubble, MessageList, useChat) **continua passando** após a Fase 2. Nenhuma feature existente é quebrada.

**Evidência APROVADO:**
- Smoke manual com `npm run dev:multi`:
  - Enviar texto simples → OK
  - Enviar imagem (`+ Plus` e Ctrl+V) → OK
  - Adicionar reação (Smile + picker) → OK
  - Toggle `aria-pressed` na reação própria → OK
  - Editar (clicar Editar ou ↑+Enter) → OK com `(editada)`
  - Excluir própria → OK, mensagem vira "mensagem apagada"
  - Excluir de outro (com canModerate) → OK
  - Responder + click no chip → OK, scroll para pai
  - Lightbox de imagem → OK (Esc fecha)

---

#### C23 — Build, lint, smoke continuam passando
**Requisito:** `npx vite build` termina com 0 warnings; `npm run dev:multi` sobe 2 Electrons + signaling + vite sem erros.

**Evidência APROVADO:**
- Saída do `vite build` com `built in <ms>` e 0 warnings novos.
- Logs do `dev:multi` sem stack traces.

---

#### C24 — Sem regressões nos artefatos 0.2.2
**Requisito:** Os **6 arquivos do release 0.2.2** permanecem idênticos (binário SHA-512) ao estado pré-Fase-2:
1. `release/VoiceCraft Setup 0.2.2.exe`
2. `release/VoiceCraft Setup 0.2.2.exe.blockmap`
3. `release/VoiceCraft-Setup-0.2.2.exe`
4. `release/VoiceCraft-Setup-0.2.2.exe.blockmap`
5. `release/latest.yml`
6. `package.json` (campo `version: 0.2.2`)

**Método:** `sha512sum` antes e depois da Fase 3 (implementação). Comparar.

**Evidência APROVADO:**
- Os 6 arquivos têm **hashes idênticos** antes/depois.
- `package.json` mantém `"version": "0.2.2"` e `"appId": "com.voicecraft.app"` intactos.

> Esta é a **restrição de regressão** mais forte da Fase 2. Os instaladores já publicados não podem ser sobrescritos nem invalidados.

---

## 2. Invariantes (I1–I12)

Propriedades que **nunca** podem quebrar, mesmo em cenários não cobertos explicitamente pelos critérios.

### I1 — Protocolo de chat (data channel + Firestore) inalterado
Wire format dos `kind: 'msg'`, `kind: 'hello'`, `kind: 'file-meta'` e binário de 12 bytes permanece compatível com release 0.2.2. Nenhum peer precisa atualizar para entender as novas mensagens (apenas renderizar Markdown onde era texto cru).

### I2 — Identidade de mensagem (`msg.id`) preservada
`uid()` em `useChat.js` (linha 48–50) continua gerando IDs únicos não-colidentes. Nenhuma mensagem otimista pode perder seu ID durante reconciliação.

### I3 — Persistência local do chat por sala
`loadHistory` / `saveHistory` (linhas 56–76 de `useChat.js`) continuam chaveadas por `roomKey` = `${spaceId}:${roomId}`. Trocar de sala não polui o histórico de outra.

### I4 — `useChat` reage a `roomKey`
A effect que re-semeia `messages` quando `roomKey` muda (linhas 131–137) **não pode** ser removida. Sem ela, mensagens da sala anterior "vazam" para a nova.

### I5 — Deduplicação id-based
`appendMessage` (linhas 162–170) e a reconciliação Firestore (linhas 151–157) **não podem** introduzir duplicatas visuais. Reconexão e re-hello do servidor devem ser idempotentes.

### I6 — Tokens do Design System continuam sendo a única fonte de cores
Nenhum hex hardcoded novo em `MessageBubble`, `MessageList`, `Composer`, ou `SpaceRoomsNav`. Tokens: `bg-accent`, `bg-warning`, `text-accent`, `text-warning`, `border-warning`, `border-line`, `bg-surface1`, `bg-surface2`, `text-strong`, `text-ink`, `text-muted`.

### I7 — Focus rings e a11y preservados
Toda nova interação (botão `•••`, chip de menção, spoiler, ação do menu, banner de reply) tem `:focus-visible` com outline 2px e offset 2px (já implementado globalmente em `src/index.css`).

### I8 — `prefers-reduced-motion: reduce` desativa animações novas
- Pontinhos do typing indicator → estáticos `…`.
- Spoiler reveal → transição instantânea (sem fade).
- Action bar hover → sem transition de opacity (ou transition 0ms).

### I9 — Drag-and-drop de salas entre grupos permanece
A remoção do `<select>` (C16) **NÃO** pode remover o DnD (`onRoomDrop`, `onDragStart`, `onDropAt`). O DnD é a forma principal de mover salas; o popover é secundário.

### I10 — `canModerate` ainda é o gate para ações privilegiadas
- Excluir mensagem de outro: só com `canModerate`.
- Fixar mensagem: só com `canModerate` (ou criador da sala).
- Sem `canModerate`, o menu `•••` **NÃO** mostra "Fixar" nem "Excluir" de mensagens de outros.

### I11 — `firestore.rules` mantém 1 única linha alterada
Phase 2 §defaults autoriza **apenas** a linha `resource.data.userId` → `resource.data.authorId` na regra de update/delete de `messages`. Nenhuma outra regra é tocada.

### I12 — Componentes não desmontam desnecessariamente
A introdução do menu popover de "Mover para grupo" em `SpaceRoomsNav` **não pode** causar remount da lista de salas a cada hover. Estado do popover é local a `RoomRow`.

---

## 3. Não-objetivos (NG1–NG14)

Comportamentos explicitamente fora do escopo da Fase 2.

### NG1 — Persistência server-side de pinos, marca-não-lida por mensagem
"Pinar" mensagem é **flag local** (não escreve no Firestore nesta iteração). "Marcar não lida" atualiza só o `lastRead` local do usuário.

### NG2 — Notificações desktop (Electron Notification) ao ser mencionado
Menção `@fulano` clicável existe, mas não dispara notificação nativa nesta iteração.

### NG3 — Suporte a `:shortcode:` em jumbomoji
Apenas caracteres emoji unicode (`\p{Extended_Pictographic}`) viram jumbo. `:joy:` / `:fire:` permanecem texto literal.

### NG4 — Upload de imagens > 6MB
Limite duro `MAX_IMAGE_BYTES = 6MB`. Sem redimensionamento client-side nesta iteração.

### NG5 — Edição de mensagens de outros (mesmo com canModerate)
Moderadores podem **deletar** mensagens de outros, mas **não editar** conteúdo. Edição é exclusiva do autor.

### NG6 — Threads (sub-conversas por reply)
Reply atual é "ir para mensagem original", sem árvore.

### NG7 — Edição rich-text (formatação visual)
Markdown é fonte única. Não há toolbar bold/italic no composer.

### NG8 — Gravação de áudio no composer
Botão `Mic` permanece como placeholder "Áudio em breve".

### NG9 — Reações custom (emojis não-universais)
Apenas emojis do picker padrão. Sem upload de imagem-em-reação.

### NG10 — Pinned messages sidebar / canal dedicado
"Pinar" marca a mensagem com badge, mas não há lista lateral de pinos nesta iteração.

### NG11 — Sincronização de typing entre mais de 2 peers
Funciona para o caso P2P (2 peers). Em grupos maiores, o indicador mostra **qualquer** peer digitando, sem distinguir quem.

### NG12 — Search dentro do conteúdo Markdown
A busca atual (ConversationSearch no header) continua sendo busca textual em `msg.text`. Não filtra por tipo de formatação.

### NG13 — Internacionalização
Toda a UI permanece em pt-BR. Não há i18n nesta iteração.

### NG14 — Emojis animados / apng no jumbomoji
Renderização é estática. Animated emojis (Twemoji Animated, etc.) ficam para fase futura.

---

## 4. Restrições de regressão (preservar 6 arquivos)

Os **6 arquivos do release 0.2.2** abaixo devem ter `sha512` idêntico antes e depois da Fase 3:

| # | Caminho absoluto | Motivo |
|---|---|---|
| 1 | `release/VoiceCraft Setup 0.2.2.exe` | Instalador publicado |
| 2 | `release/VoiceCraft Setup 0.2.2.exe.blockmap` | Metadata do instalador |
| 3 | `release/VoiceCraft-Setup-0.2.2.exe` | Duplicado histórico (sem espaço) |
| 4 | `release/VoiceCraft-Setup-0.2.2.exe.blockmap` | Duplicado histórico (sem espaço) |
| 5 | `release/latest.yml` | Aponta versão atual 0.2.2 para auto-update |
| 6 | `package.json` (campo `version: 0.2.2` + `appId: com.voicecraft.app`) | Fonte da versão canônica |

**Procedimento de verificação:**

```bash
# ANTES da Fase 3 (snapshot)
cd "C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft"
certutil -hashfile "release\VoiceCraft Setup 0.2.2.exe" SHA512
certutil -hashfile "release\VoiceCraft Setup 0.2.2.exe.blockmap" SHA512
certutil -hashfile "release\VoiceCraft-Setup-0.2.2.exe" SHA512
certutil -hashfile "release\VoiceCraft-Setup-0.2.2.exe.blockmap" SHA512
certutil -hashfile "release\latest.yml" SHA512
# Para package.json: usar git diff ou sha256sum

# DEPOIS da Fase 3 (comparar)
# Todos os 5 hashes binários devem ser IDÊNTICOS
# `git diff package.json` deve mostrar APENAS as alterações da Fase 2 (markdown, typing, menu 3-pontos, firestore 1 linha)
```

**Qualquer divergência = FALHA na aceitação da Fase 3.** A Fase 3 (Implementador) **NÃO** deve:
- Rodar `npm version` (não bumpa para 0.2.3).
- Recompilar/republicar instaladores.
- Sobrescrever `release/latest.yml`.

---

## 5. Casos de borda (E1–E10)

Cenários que devem ser explicitamente tratados.

### E1 — Mensagem com texto vazio e anexo (imagem) só
- Markdown não deve quebrar. Anexos renderizam normalmente; texto vazio não gera `<p></p>`.
- Jumbomoji: imagem sozinha ≠ jumbomoji (emoji ≠ imagem).

### E2 — Mensagem com 1 emoji + espaço + texto
- `"😀 oi"` → render normal (NÃO jumbomoji). Jumbomoji só sem texto.

### E3 — Markdown dentro de reply (texto da reply tem `**negrito**`)
- O texto do corpo renderiza Markdown. O chip da reply (acima) mostra snippet cru (sem Markdown).

### E4 — Spoiler com markdown dentro (`||**negrito**||`)
- Spoiler revela o `<strong>` depois de clicado. Markdown é processado dentro do spoiler.

### E5 — Menção `@eu mesmo` (próprio usuário)
- Pílula renderiza igual a qualquer menção. Clique abre seu próprio `ProfilePopover`.
- NÃO dispara badge dourado "menção" (a menção é de si para si — sem semântica de notificação).

### E6 — Reply a mensagem deletada
- Chip mostra "mensagem apagada" (já em `MessageList` linhas 267, `ReplyThread` linhas 390–394).
- Botão "Pular para o final" continua funcionando.

### E7 — Editar mensagem já otimista mas ainda `sending`
- Se o usuário clicar Editar antes do `signaling.sendChatMessage` retornar, a edição é aplicada localmente e a próxima reconciliação do Firestore **deve preservar** o `text` editado (porque a versão otimista está com `id` próprio e a versão do servidor, ao chegar, vai ter o mesmo `id` e vai sobrescrever — risco a considerar).
- **Comportamento esperado:** editar mensagem `sending` é bloqueado (botão Editar desabilitado quando `status === 'sending'`), OU a edição é aplicada ao pending e o `replaceMessage` no callback de envio propaga.

### E8 — Ctrl+V quando o composer já tem texto + clipboard tem imagem
- Texto é **preservado**; imagem entra como anexo separado. Não substitui o texto.

### E9 — Drag de sala em grupo `Sem grupo` (não-grouped) com popover aberto
- Popover deve fechar antes do drag começar, OU drag deve cancelar o popover.

### E10 — Typing indicator com sinal perdido (peer caiu)
- TTL de 4s garante que o indicador desaparece mesmo sem `typing:stop`. Após 4s sem novo `typing:start`, indicador some.

---

## 6. Sinalização de congelamento

```yaml
criterios:
  congelado: true
  data: 2026-09-11
  fase: 2
  escopo: "Chat estilo Discord completo + substituição dropdown SpaceRoomsNav"
  release_referencia: 0.2.2
  versao_alvo: NAO_BUMPAR (manter 0.2.2 no package.json até decisão de release)
  protocolo_alterado: false
  regras_firestore_alteradas: 1
  arquivos_release_preservar: 6
  criterios_total: 24
  invariantes_total: 12
  nao_objetivos_total: 14
  casos_borda_total: 10

defaults:
  markdown_apenas_em: "corpo da mensagem"
  firestore_rules_alteracao: "userId → authorId (1 linha, match /messages)"
  substituir_dropdown_por: "menu de 3-pontos (popover) com 'Mover para…'"
  spoiler_sintaxe: "||texto||"
  jumbomoji_regra: "1-3 emojis seguidos, sem texto, sem :shortcode:"
  typing_indicator: "texto pequeno abaixo do composer com 3 pontinhos animados"
  escopo_protocolo: "P0 — sem mudança de protocolo (data channel + Firestore)"

proximos_agentes:
  fase_3_implementador:
    entrada: ["este contrato"]
    saida: ["diff com critérios C1-C24 implementados", "firestore.rules alterado", "novos módulos listados"]
    restricao: "NAO tocar nos 6 arquivos de release"
  fase_4_testador:
    entrada: ["este contrato", "diff da Fase 3"]
    saida: ["relatório de smoke com evidências para C1-C24"]
    ferramentas: ["vite build", "dev:multi", "inspetor DOM", "clipboard mock"]
  fase_5_verificador:
    entrada: ["este contrato", "relatório da Fase 4"]
    saida: ["APROVADO ou REPROVADO com lista de gaps"]
    gate_hard: "6 arquivos release 0.2.2 com sha512 idêntico"
```

**Este contrato é a entrada única e congelada para as Fases 3, 4 e 5.** Nenhum critério pode ser adicionado, removido ou reescrito após esta publicação sem reabrir a Fase 2.
