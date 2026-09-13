# Contrato de Aceite — Visual flat-solid gold premium (Fase 2)

**Status:** CONGELADO (`criterios.congelado: true`)
**Data:** 2026-09-12
**Release de referência (preservar):** 0.2.2
**Escopo:** replicar o estilo do mockup Cavaleiros — backgrounds flat pretos sólidos (sem blur/glass em demasia), item ativo da sidebar/canais em dourado, cards de membros com anel rosa/laranja, composer arredondado com placeholder `#canal-slug` e botão enviar dourado, glows **apenas** em pontos estratégicos, mantendo a identidade rosa do voice/banner/CTA Convidar.

---

## 0. Resumo executivo (TL;DR)

| Camada | O que muda | Onde |
|---|---|---|
| Backgrounds | Remover os 4 radiais decorativos de `body.vc-app-bg-decor`, os 3 radiais + ruído SVG de `.vc-chat-bg-decor`. Body e chat passam a ser `#0d0f14` (var(--vc-bg-canvas)) flat sólido. | `src/index.css` |
| Sidebar (Início/Spaces) | Item ativo de **canais** vira dourado (`bg-warning/15 text-warning` + barrinha esquerda gold + glow sutil). Início (SpacesRail) **decisão abaixo em C4**. | `src/index.css` + `src/features/rooms/views/SpaceRoomsNav.jsx` (classe) |
| Composer (enviar) | Botão enviar vira sólido `--vc-warning` com box-shadow dourado (sem gradient rosa→pink). | `src/index.css` `.vc-composer-send` |
| Composer (placeholder) | `Conversar em <room>` vira `#<room-slug>` (slug = `room.name.toLowerCase().replace(/\s+/g,'-')`). | `src/components/views/TextRoomView.jsx` |
| Anéis de avatar | Trocar o gradiente do `.vc-people-avatar` de rosa→roxo (`#7c3aed`) para rosa→laranja (`#fb923c`). | `src/index.css` `.vc-people-avatar::before` |
| Glows | **Manter** composer-send, anéis, dot online, day-divider dot. **Remover** todos os outros (radiais, ruído, spin). | `src/index.css` |
| Avatar account (rodapé) | Remover `vc-account-spin 8s linear infinite`. Mantém o conic-gradient estático (`vc-account-ring-static` ou sem rotação). | `src/index.css` `.vc-account-ring` |
| Self online ring | Remover `vc-self-ring-spin 6s linear infinite`. | `src/index.css` `.vc-self-online-ring::before` |
| CTA "Chame mais alguém" | **Decisão abaixo em C8.** | `src/index.css` `.vc-people-invite-cta` |
| Jump-to-bottom pill | **Decisão abaixo em C10.** | `src/index.css` `.vc-jump-bottom` |
| Banner do channel header | **Não adicionar** banner imersivo (NG1). O `vc-channel-header` atual permanece (já existe). | n/a — decisão |
| Identidade preservada | Voice ring/speaking pulse continua rosa (`--space-accent`). Banner SpaceContextPanel intacto. Botão "Convidar pro Space" continua coral. Markdown/typing/Ctrl+V imagem continuam funcionando. | n/a — invariante |

---

## 1. Critérios de aceite (C1–C18)

Cada critério tem **requisito** + **método de verificação** + **evidência necessária para APROVADO**.

---

### C1 — Background geral da app é flat preto sólido (sem radiais)
**Requisito:** O `body.vc-app-bg-decor` (e o seletor `.vc-app-bg-decor` equivalente) deixa de aplicar **nenhum** `radial-gradient`. O fundo da aplicação passa a ser `var(--vc-bg-canvas)` (#0d0f14) **flat sólido**, sem `background-image` decorativo. Os 4 radiais hoje presentes (cantos 0%0%, 100%0%, 100%100%, 0%100%) precisam ser removidos.

**Método:** Inspecionar `body` em runtime (DevTools → Computed → `background-image`). Esperar valor `none`.

**Evidência APROVADO:**
- `getComputedStyle(document.body).backgroundImage === 'none'`
- `getComputedStyle(document.body).backgroundColor === 'rgb(13, 15, 20)'` (var(--vc-bg-canvas))
- Em `src/index.css`, **nenhum** bloco declara `radial-gradient(...)` dentro de `body.vc-app-bg-decor` ou `.vc-app-bg-decor`.
- Screenshot full-viewport mostra fundo plano sem "aurora" nos cantos.

---

### C2 — Background do chat é flat preto sólido (sem radiais/ruído)
**Requisito:** O `.vc-chat-bg-decor` (atualmente com 2 ou 3 radiais + ruído SVG inline) passa a ser um wrapper **sem nenhum** `radial-gradient` e **sem** o `::before` com ruído SVG (data-URI). O container pode existir como wrapper estrutural (`position: relative`) mas seu `background-image` deve ser `none`.

**Método:** Inspecionar o elemento raiz do chat (procurar `.vc-chat-bg-decor` no DevTools). Esperar `background-image: none` e nenhum `::before` com `url(data:image/svg+xml...)`.

**Evidência APROVADO:**
- `getComputedStyle(el).backgroundImage === 'none'` para o nó `.vc-chat-bg-decor`.
- `getComputedStyle(el, '::before').backgroundImage === 'none'` (ou o `::before` foi removido do CSS).
- Mensagens permanecem legíveis, divisores de data permanecem visíveis.
- `src/index.css` linha ~2150–2172 deixa de conter `radial-gradient` e o data-URI do `feTurbulence`.

---

### C3 — Item ativo da sidebar (canal atual) é dourado/âmbar flat com glow sutil + barrinha esquerda gold
**Requisito:** Quando o usuário navega para uma **sala** (canal), o item correspondente em `SpaceRoomsNav` é renderizado com:
1. Fundo `bg-warning/15` (`color-mix(in srgb, var(--vc-warning) 15%, transparent)`) — flat, sem gradient.
2. Texto `text-warning` (`var(--vc-warning)` = `#f5b942`).
3. **Barrinha esquerda gold** (`width: 3px`, `background: var(--vc-warning)`, `border-radius: 0 999px 999px 0`).
4. **Glow sutil** dourado (`box-shadow: 0 0 12px color-mix(in srgb, var(--vc-warning) 35%, transparent)` ou equivalente), sem animação de pulse.
5. O quadradinho do ícone continua com `background: color-mix(in srgb, var(--vc-warning) 18%, transparent)` e `color: var(--vc-warning)`.

**Método:** Selecionar uma sala no SpaceRoomsNav. Inspecionar o `<button>` do item ativo no DevTools.

**Evidência APROVADO:**
- O `<button aria-current="true">` (linha 234 do SpaceRoomsNav) tem computed background que casa com `color-mix(in srgb, var(--vc-warning) 15%, transparent)`.
- A `<span class="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full">` tem `background: rgb(245, 185, 66)` (var(--vc-warning)).
- O `<button>` tem `box-shadow` com tom âmbar (não rosa).
- A cor de texto é `rgb(245, 185, 66)` (não rosa `#ff3f6c`).
- Trocar de sala move o estado ativo: a classe/barrinha acompanha.

---

### C4 — Item ativo da sidebar (Início/Spaces no rail) — DECIDIDO: MANTÉM CORAL
**Requisito:** O botão "Início" no `SpacesRail.jsx` (a faixa estreita de 72px) **mantém** o accent coral (`bg-accent text-white shadow-[0_0_0_2px_var(--space-accent-glow-24)]`). Isso preserva a identidade do app no nível do rail (acesso rápido), enquanto o dourado fica restrito ao contexto de **canal/sala** (C3).

**Método:** Inspecionar o botão "Início" no SpacesRail com `aria-pressed="true"` (nenhum Space ativo).

**Evidência APROVADO:**
- O `<button>` "Início" (linha ~87 do SpacesRail) com `aria-pressed="true"` tem computed background derivado de `var(--space-accent)` (#ff3f6c), não `var(--vc-warning)`.
- Texto/cor é branco/coral, não dourado.
- O mesmo vale para o estado ativo do tile de Space quando `currentSpaceId === space.id` no nível do rail (rosa, com glow rosa, sem dourado).
- **Inverso:** os canais dentro de `SpaceRoomsNav` (C3) seguem dourado.

---

### C5 — Botão enviar do Composer é dourado sólido com glow dourado
**Requisito:** `.vc-composer-send` passa de `linear-gradient(135deg, var(--space-accent), #f472b6 90%)` para **`background: var(--vc-warning)`** flat sólido. O `box-shadow` mantém glow dourado (`0 6px 22px -8px color-mix(in srgb, var(--vc-warning) 35%, transparent)` ou equivalente) + `inset 0 1px 0 rgba(255,255,255,0.18)`. O estado `:hover:not(:disabled)` ganha `filter: brightness(1.06)` e sombra maior (dourada). O estado `:disabled` continua com tom âmbar dessaturado, sem glow.

**Método:** Inspecionar o botão "Enviar" do Composer no DevTools.

**Evidência APROVADO:**
- `getComputedStyle(.vc-composer-send).backgroundImage === 'none'`
- `getComputedStyle(.vc-composer-send).backgroundColor === 'rgb(245, 185, 66)'` (var(--vc-warning)).
- `getComputedStyle(.vc-composer-send).boxShadow` contém tom âmbar (rgb(245, 185, 66, α)).
- Em `:disabled`, `background-image: none` e `box-shadow: none`.
- Ícone `Send` (lucide) continua visível em branco.

---

### C6 — Placeholder do Composer inclui `#canal-slug`
**Requisito:** O placeholder do Composer em `src/components/views/TextRoomView.jsx` (linha 346) muda de ``Conversar em ${room.name}`` para ``#${room.name.toLowerCase().replace(/\s+/g, '-')}``. Caracteres especiais além de espaços (acentos, etc.) **não são normalizados nesta iteração** — o objetivo é mostrar o slug legível do canal no estilo mockup Cavaleiros.

**Método:** Selecionar uma sala chamada `"Sala Geral"`. Inspecionar o `<textarea placeholder="...">` no Composer.

**Evidência APROVADO:**
- `textarea.placeholder === "#sala-geral"` para `room.name === "Sala Geral"`.
- Para `room.name === "Café da Tarde"`: placeholder é `"#café-da-tarde"` (espaços viram `-`, acentos permanecem).
- Para `room.name === "Geral"`: placeholder é `"#geral"`.
- Placeholder não muda quando há reply pendente.
- Nenhuma mudança no `Composer.jsx` em si (apenas a prop `placeholder` vinda de `TextRoomView.jsx`).

---

### C7 — Anel dos avatares no PeoplePanel em gradient rosa→laranja (não rosa→roxo)
**Requisito:** O conic-gradient atual do `.vc-people-avatar::before` (linhas ~2117–2121) está documentado como rosa→roxo. Esta iteração **troca** o roxo `#7c3aed` por laranja `#fb923c` (mais quente, casa com o dourado do sidebar sem virar a mesma cor). O anel permanece como conic-gradient, sem animação (sem `animation`).

**Método:** Inspecionar `.vc-people-avatar::before` no DevTools quando um membro está visível no PeoplePanel.

**Evidência APROVADO:**
- O `background-image` do `::before` contém `rgb(251, 146, 60)` (#fb923c), não `rgb(124, 58, 237)` (#7c3aed).
- O conic-gradient continua entre tons de rosa (`var(--space-accent)`) e laranja (#fb923c), produzindo um anel quente.
- `[data-status="online"]` aplica `--vc-status-color: var(--vc-positive)` (verde) **dentro** do mesmo mecanismo de `--vc-status-color` — o anel muda para verde quando online (já era assim), mantendo o comportamento.

---

### C8 — Card "Chame mais alguém" (CTA) com fundo dourado — DECIDIDO: MANTÉM ROSA
**Requisito:** O CTA `.vc-people-invite-cta` em `PeoplePanel.jsx` (linha 302) **mantém** o gradient rosa (`color-mix(in srgb, var(--space-accent) 28%, ...)` + glow rosa). **Decisão:** a identidade do CTA "Convidar" continua rosa/coral porque é um convite (não um canal). O dourado é exclusivo do contexto de **canal ativo** e do botão **Enviar**.

**Método:** Inspecionar o `<button class="vc-people-invite-cta">` no PeoplePanel.

**Evidência APROVADO:**
- `getComputedStyle(.vc-people-invite-cta).backgroundImage` contém tom rosa (`rgb(255, 63, 108, α)` ou `color-mix` com `var(--space-accent)`).
- `box-shadow` contém tom rosa (não dourado).
- Texto `Convidar pessoas` permanece branco/`text-strong`.
- Não há mistura de dourado no CTA (mantém unidade visual com o botão "Convidar pro Space" do SpaceContextPanel — invariante I3).

---

### C9 — Day dividers flat (sem glass/blur)
**Requisito:** `.vc-day-divider` (linha ~2291) **remove** qualquer `backdrop-filter`, `background-image: linear-gradient(...)` no divider em si (mantém o gradient nas linhas `::before/::after`, que são parte do desenho). Mantém o dot pulsante (decisão estratégica de glow — item 7 do escopo da Fase 1) e o label rosa.

**Método:** Inspecionar `.vc-day-divider` no DevTools.

**Evidência APROVADO:**
- `getComputedStyle(.vc-day-divider).backdropFilter === 'none'` (ou `unset`).
- `getComputedStyle(.vc-day-divider).backgroundImage === 'none'` (o divider em si, não suas linhas).
- As linhas `::before/::after` continuam com gradient horizontal (desenho do divider, não fundo).
- O dot `.vc-day-divider__dot` continua pulsando (`animation: vc-divider-glow 2.4s ease-in-out infinite`).
- `prefers-reduced-motion: reduce` desliga a animação (já respeitado).

---

### C10 — Jump-to-bottom pill flat — DECIDIDO: MANTÉM ROSA
**Requisito:** `.vc-jump-bottom` (linha ~2361) **mantém** o gradient rosa (`linear-gradient(135deg, var(--space-accent), #f472b6)`) e o pulse. **Decisão:** o jump-to-bottom é um elemento de navegação rápida no chat — mantém rosa para preservar a identidade do app (rosa = "ação de chat"). Glows mantidos (decisão estratégica de glow — item 7).

**Método:** Inspecionar `.vc-jump-bottom` no DevTools.

**Evidência APROVADO:**
- `getComputedStyle(.vc-jump-bottom).backgroundImage` contém gradient rosa (var(--space-accent) → #f472b6).
- `box-shadow` contém glow rosa (`var(--space-accent-glow-24)`).
- `animation: vc-jump-pulse 2.4s ease-in-out infinite` permanece.
- `prefers-reduced-motion: reduce` desliga o pulse (já respeitado).

---

### C11 — Voice ring continua rosa (`vc-speaking-pulse` intacto)
**Requisito:** A regra `.vc-speaking-pulse` (linha ~178) **permanece inalterada**: `box-shadow: 0 0 0 2px var(--space-accent), 0 0 16px var(--space-accent-glow-24)`. Identidade do voice preservada — quem está falando continua marcado com anel rosa pulsante.

**Método:** Em uma voice room ativa, fazer um participante falar e inspecionar o `ParticipantCard` correspondente.

**Evidência APROVADO:**
- O `box-shadow` do card falante contém tom rosa (`rgb(255, 63, 108, α)`), não dourado.
- `animation: vc-speaking-pulse 0.8s ease-in-out infinite` ativa.
- O token `--space-accent` segue como `#ff3f6c` (não foi trocado para dourado).

---

### C12 — Speaking pulse/waveform do voice continua coral
**Requisito:** `.vc-wave-bar` (linha ~190) **permanece inalterada**: `background: var(--space-accent)`, animação `vc-wave-bar 0.9s ease-in-out infinite`. As barrinhas do waveform visualizam o volume em rosa.

**Método:** Em uma voice room ativa, inspecionar o elemento `.vc-wave-bar` no `SpeakingIndicator`.

**Evidência APROVADO:**
- `getComputedStyle(.vc-wave-bar).backgroundColor === 'rgb(255, 63, 108)'` (var(--space-accent)).
- `animation: vc-wave-bar 0.9s ease-in-out infinite` ativa.
- Nenhuma das duas barras tem cor diferente (são todas rosa).

---

### C13 — Avatar do account (rodapé) sem spin animation infinito
**Requisito:** `.vc-account-ring` (linha ~2405) **remove** `animation: vc-account-spin 8s linear infinite`. O conic-gradient fica **estático**. O glow `box-shadow` do `.vc-account-mic-on` é preservado (decisão estratégica de glow).

**Método:** Inspecionar `.vc-account-ring` no DevTools no rodapé.

**Evidência APROVADO:**
- `getComputedStyle(.vc-account-ring).animationName === 'none'` (ou nenhum `animation` shorthand).
- O conic-gradient continua visível (rosa + info + positive → rosa) — só não gira mais.
- A keyframe `@keyframes vc-account-spin` pode ser removida do CSS (sem efeito colateral), mas não é obrigatório — basta a regra não referenciá-la.
- Mic-on continua com `box-shadow: 0 0 12px ... var(--vc-positive) ...`.

---

### C14 — Banner do SpaceContextPanel intacto
**Requisito:** O banner do SpaceContextPanel (capa do Space, capa da sala ativa, avatar do Space) **permanece visualmente intacto**. Nenhuma mudança de JSX ou CSS que afete o hero/banner. O `SpaceHero` já cumpre o papel de banner imersivo — não duplicar (NG1).

**Método:** Abrir um Space com cover e inspecionar `SpaceContextPanel`.

**Evidência APROVADO:**
- A capa do Space continua renderizando (`<img>` ou `background-image` com `coverUrl`).
- O avatar do Space continua sobreposto ao banner (com o ring rosa).
- Nenhuma regressão visual no banner entre release 0.2.2 e este commit.
- Não há banner imersivo **adicional** no `vc-channel-header` (NG1).

---

### C15 — Botão "Convidar pro Space" continua coral (identidade)
**Requisito:** O CTA "Convidar pro Space" no `SpaceContextPanel.jsx` **mantém** accent coral (`var(--space-accent)`) e gradient rosa. Identidade preservada (invariante I3).

**Método:** Inspecionar o botão "Convidar pro Space" no SpaceContextPanel.

**Evidência APROVADO:**
- `background-image` do botão contém tom rosa (`rgb(255, 63, 108, α)`), não dourado.
- Texto branco ou accent, contraste ok.
- Hover state continua com sombra rosa.

---

### C16 — Build verde
**Requisito:** `npx vite build` termina com sucesso, exit code 0, sem warnings novos.

**Método:** Rodar `npx vite build` na raiz do projeto.

**Evidência APROVADO:**
- Exit code 0.
- Output contém `built in <tempo>` e a árvore de assets gerados.
- Nenhum warning de "deprecation", "size limit" ou "module not found".
- `dist/` é gerado/atualizado.

---

### C17 — 37 testes do `test_signaling_cache.mjs` ainda passando
**Requisito:** `node scripts/tests/test_signaling_cache.mjs` retorna `37 passed · 0 failed`.

**Método:** Rodar `node scripts/tests/test_signaling_cache.mjs` na raiz.

**Evidência APROVADO:**
- Exit code 0.
- Última linha: `37 passed · 0 failed`.
- Nenhum teste `skip` ou `todo`.

---

### C18 — 6 arquivos protegidos intactos
**Requisito:** Os **6 arquivos do release 0.2.2** permanecem idênticos (sha512) ao estado pré-Fase-2:

| # | Caminho | Motivo |
|---|---|---|
| 1 | `release/VoiceCraft Setup 0.2.2.exe` | Instalador publicado |
| 2 | `release/VoiceCraft Setup 0.2.2.exe.blockmap` | Metadata do instalador |
| 3 | `release/VoiceCraft-Setup-0.2.2.exe` | Duplicado histórico |
| 4 | `release/VoiceCraft-Setup-0.2.2.exe.blockmap` | Duplicado histórico |
| 5 | `release/latest.yml` | Auto-update |
| 6 | `package.json` campo `version: 0.2.2` + `appId: com.voicecraft.app` | Versão canônica |

**Método:** `certutil -hashfile <caminho> SHA512` (PowerShell: `Get-FileHash -Algorithm SHA512`) **antes** e **depois** da Fase 2. Comparar.

**Evidência APROVADO:**
- Hash SHA-512 idêntico para os 5 artefatos de release.
- `git diff package.json` retorna vazio (campos `version` e `appId` inalterados).

---

## 2. Invariantes (I1–I7)

Invariantes são propriedades que precisam permanecer verdadeiras em qualquer execução válida, mesmo em cenários não cobertos explicitamente pelos critérios.

### I1 — Voice ring/speaking pulse permanece rosa (identidade)
`vc-speaking-pulse`, `vc-wave-bar`, o ring de quem está falando no VoiceRoom — **tudo continua rosa** (`var(--space-accent) = #ff3f6c`). **Verificação estática + comportamental** (C11, C12).

### I2 — Banner do SpaceContextPanel continua intacto
O hero/banner do SpaceContextPanel (capa, avatar, gradient sobreposto) **não é tocado** em JSX nem em CSS nesta Fase. **Verificação comportamental** (C14).

### I3 — Botão "Convidar pro Space" continua coral
O CTA "Convidar pro Space" no `SpaceContextPanel.jsx` permanece com accent rosa e gradient coral. **Verificação estática** (C15).

### I4 — Build/testes passam
`vite build` exit 0, `test_signaling_cache.mjs` 37/37. **Verificação automatizada** (C16, C17).

### I5 — 6 arquivos protegidos intactos
Os 6 arquivos listados em C18 têm SHA-512 idêntico antes/depois. **Verificação por hash** (C18).

### I6 — Markdown, mentions, typing, Ctrl+V imagem ainda funcionam
Todas as features de chat entregues na Fase 2 (`CONTRATO_CHATDISCORD.md`) continuam operacionais: Markdown bold/italic/strike/quote/code/spoiler/link, mentions `@fulano`, typing indicator, Ctrl+V de imagem, jumbomoji, day-divider, jump-to-bottom. **Verificação funcional por smoke test**:
- Enviar `**negrito**` → `<strong>` no DOM.
- Enviar `@alice` → `<button class="vc-mention">`.
- Digitar por 2s → 3 pontinhos rosa aparecem (`vc-typing-dot`).
- Ctrl+V com imagem → `<img>` aparece no preview do Composer.
- 4+ emojis → renderização padrão; 1–3 → jumbomoji.

### I7 — Chat scrollável normalmente (sem perda de viewport por banner)
Sem banner imersivo no header do canal (NG1), o chat mantém viewport normal. **Verificação comportamental**: 100+ mensagens renderizam, scroll funciona, `MessageList` virtualiza se já virtualizava.

---

## 3. Não-objetivos (NG1–NG4)

Comportamentos que **não** fazem parte do escopo desta Fase. Não precisam ser testados e não devem ser considerados pendências.

### NG1 — Banner imersivo no header do canal
Rejeitado pelo usuário (Fase 1). O `vc-channel-header` permanece como está (gradient sutil + backdrop-blur + gradient-text no h1). O `SpaceHero` no SpaceContextPanel **já cumpre** o papel de banner imersivo — não duplicar.

### NG2 — Trocar accent default de coral para gold
Rejeitado (identidade). `--space-accent` continua `#ff3f6c` (coral/rosa). Tokens relacionados (`--space-accent-glow-24`, `--space-accent-soft`, `--space-on-accent`) inalterados.

### NG3 — Criar novo token `--vc-gold`
Rejeitado. Reutilizar `--vc-warning: #f5b942` que já existe. Não criar variável nova — não há razão para dois dourados no sistema.

### NG4 — Mudanças em JSX dos 6 arquivos protegidos
Os 6 arquivos do release 0.2.2 (`CONTRATO_CHATDISCORD.md` §4) **não podem** ter JSX alterado. Mudanças permitidas: `src/index.css`, `src/components/views/TextRoomView.jsx` (apenas a linha do placeholder), `src/index.css` (anéis, glows). Nada além disso.

---

## 4. Restrições de regressão (preservar 6 arquivos)

Os **6 arquivos do release 0.2.2** abaixo devem ter `sha512` idêntico antes e depois desta Fase 2:

| # | Caminho absoluto | Motivo |
|---|---|---|
| 1 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\release\VoiceCraft Setup 0.2.2.exe` | Instalador publicado |
| 2 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\release\VoiceCraft Setup 0.2.2.exe.blockmap` | Metadata do instalador |
| 3 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\release\VoiceCraft-Setup-0.2.2.exe` | Duplicado histórico |
| 4 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\release\VoiceCraft-Setup-0.2.2.exe.blockmap` | Duplicado histórico |
| 5 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\release\latest.yml` | Auto-update |
| 6 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\package.json` (campos `version: 0.2.2` + `appId: com.voicecraft.app`) | Versão canônica |

**Procedimento de verificação:**

```powershell
# ANTES da Fase 2 (snapshot — em PowerShell)
cd "C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft"
Get-FileHash -Algorithm SHA512 "release\VoiceCraft Setup 0.2.2.exe"
Get-FileHash -Algorithm SHA512 "release\VoiceCraft Setup 0.2.2.exe.blockmap"
Get-FileHash -Algorithm SHA512 "release\VoiceCraft-Setup-0.2.2.exe"
Get-FileHash -Algorithm SHA512 "release\VoiceCraft-Setup-0.2.2.exe.blockmap"
Get-FileHash -Algorithm SHA512 "release\latest.yml"
Get-FileHash -Algorithm SHA512 "package.json"

# DEPOIS da Fase 2 — comparar linha a linha.
```

**Critério:** todos os hashes idênticos. Em `package.json`, apenas `version` e `appId` precisam estar inalterados — outras mudanças no `package.json` (dependências, scripts) podem ocorrer se forem necessárias para o build, mas **não** devem alterar `version` nem `appId`.

---

## 5. Casos de borda (E1–E6)

### E1 — Space sem cover → banner continua sem imagem
Se o Space ativo não tem `coverUrl`, o `SpaceHero` mostra o gradient fallback (sem `<img>`). **Comportamento idêntico** ao release 0.2.2. **Não adicionar** placeholder dourado/rosa no espaço vazio — manter o gradient atual.

### E2 — Mobile/narrow viewport → sidebar colapsável não muda
O comportamento de colapso da sidebar (botão hamburger, drawer mobile) **permanece**. Nenhuma mudança nesta Fase deve afetar a navegação mobile. **Smoke test:** abrir DevTools em 400×800, verificar que o rail colapsa e o drawer abre.

### E3 — Voice room ativo → ring continua rosa
Em uma voice room, o `ParticipantCard` de quem está falando tem anel rosa pulsante (`vc-speaking-pulse`), **nunca** dourado. Mesmo se o canal ativo da sidebar for dourado, o voice room **não** muda para dourado. **Verificação:** entrar em voice room durante uma chamada, falar, inspecionar.

### E4 — 100+ mensagens → sem perda de viewport por banner
Como NG1 foi aplicado (sem banner no header do canal), o `MessageList` mantém o viewport normal. Carregar 100+ mensagens sintéticas, scroll até o final, verificar que `MessageList` (e qualquer virtualização já existente) funciona como antes. **Não exigir** virtualização nova — só não regredir a que existe.

### E5 — Light mode (se existir) → manter
Se houver tema claro em algum lugar do código (não detectado em `index.css` — só `color-scheme: dark`), ele **permanece** sem mudanças. Esta Fase não toca light mode. **Verificação:** `prefers-color-scheme: light` não deve causar regressão visual. Como não foi detectado suporte, este caso é **NG implícito** — não há o que regredir.

### E6 — Token `--vc-warning` já existe e é usado (não regredir)
`--vc-warning: #f5b942` é o token reutilizado para dourado. Antes da Fase 2, ele já é usado em:
- `border-left: 2px solid var(--vc-warning)` em `.vc-mentions-me, .vc-is-reply` (linha 1557).
- `color-mix(in srgb, var(--space-accent) 65%, var(--vc-warning))` em algum contexto (linha 1839).
- `--vc-status-color: var(--vc-warning)` em `.vc-people-avatar[data-status="idle"]` (linha 2130).

**Nenhum desses usos deve regredir.** Verificação estática: as três referências acima permanecem intactas.

---

## 6. Procedimento de aceitação

1. Snapshot dos 6 arquivos protegidos (PowerShell, vide §4).
2. Aplicar mudanças propostas (`src/index.css`, `src/components/views/TextRoomView.jsx`).
3. Rodar `node scripts/tests/test_signaling_cache.mjs` — esperar `37 passed · 0 failed`.
4. Rodar `npx vite build` — esperar exit 0.
5. Smoke test manual:
   - Abrir app, entrar em um Space, clicar em 2 salas diferentes — sidebar ativa muda de canal (C3).
   - Verificar botão Início do rail continua coral (C4).
   - Clicar no Composer, verificar placeholder `#canal-slug` (C6).
   - Hover no botão Enviar — verificar tom dourado + glow (C5).
   - Entrar em PeoplePanel — verificar anel rosa→laranja (C7).
   - Rolar para cima no chat, verificar jump-to-bottom rosa (C10).
   - Verificar fundo do body e do chat flat (C1, C2).
6. Snapshot dos 6 arquivos protegidos — comparar com o snapshot inicial. Devem ser idênticos (C18).
7. Marcar este contrato como aceito. Não reabrir critérios sem nova rodada da Fase 1.

---

## 7. Sinalização de congelamento

```yaml
criterios.congelado: true
data_congelamento: 2026-09-12
fase: 2 — Visual flat-solid gold premium
release_protegido: 0.2.2
total_criterios: 18   # C1-C18
total_invariantes: 7  # I1-I7
total_nao_objetivos: 4 # NG1-NG4
total_casos_borda: 6  # E1-E6
arquivos_protegidos: 6
```

**Este documento está congelado.** Qualquer alteração posterior (re-abertura de critério, mudança de decisão C4/C8/C10) requer:
1. Nova rodada da Fase 1 (decisão do engenheiro-de-decisão).
2. Aprovação do usuário.
3. Bump do campo `fase` ou `data_congelamento` e justificativa por escrito.

**Decisões registradas nesta iteração (não reabrir sem nova Fase 1):**
- **C4 (Início/Spaces rail):** MANTÉM CORAL.
- **C8 (CTA Chame mais alguém):** MANTÉM ROSA.
- **C10 (Jump-to-bottom):** MANTÉM ROSA.
- **C7 (anel avatar):** rosa→laranja (#fb923c), não rosa→roxo.
- **Token gold:** reutilizar `--vc-warning: #f5b942` (NG3).
- **Banner imersivo no header:** rejeitado (NG1).
