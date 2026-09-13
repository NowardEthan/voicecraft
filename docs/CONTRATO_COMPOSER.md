# Contrato de Aceite — Ajuste visual do Composer (input de chat) (Fase 2)

**Status:** CONGELADO (`criterios.congelado: true`)
**Data:** 2026-09-12
**Release de referência (preservar):** 0.2.2
**Escopo:** exclusivamente o **Composer** do chat (`src/components/views/Composer.jsx` e o bloco de CSS `.vc-composer-pill` / `.vc-composer-send` em `src/index.css`). Header da sala, lista de mensagens, sidebar e banner do Space **não** são tocados.

> **Contexto:** este contrato é estritamente visual e cirúrgico — apenas o botão Enviar e o contêiner (pill) do Composer. Decisões já confirmadas na Fase 1 (botão dourado, borda neutra, foco rosa, GIF removido) estão aqui congeladas como critérios mensuráveis. Ele opera sobre o resultado já entregue pelo `CONTRATO_FLATGOLD.md` (release 0.2.2 protegido).

---

## 0. Resumo executivo (TL;DR)

| Camada | O que muda | Onde |
|---|---|---|
| Botão Enviar | Trocar **inline style** do JSX pela classe CSS já existente `.vc-composer-send` (gold flat + glow). | `src/components/views/Composer.jsx` linhas ~705-722 |
| Pill do Composer | Trocar **inline style** (`backgroundColor`/`border`/`boxShadow` do `accent`) pela classe CSS já existente `.vc-composer-pill` (gradient flat + borda neutra). | `src/components/views/Composer.jsx` linhas ~589-596 |
| Pílula GIF | Remover o botão `<button>GIF</button>` (estava "em breve", desabilitado). | `src/components/views/Composer.jsx` linhas ~687-702 |
| Foco do pill | **NÃO** muda — segue rosa (`color-mix(in srgb, var(--space-accent) …)`) conforme `.vc-composer-pill:focus-within` já existente. | n/a (já está certo) |
| API do Composer | A prop `accent` continua na assinatura (não quebramos consumidores), mas deixa de ser usada internamente. | `src/components/views/Composer.jsx` linhas ~32-46 |
| Arquivos protegidos | 6 arquivos listados em §4 devem permanecer **byte-idênticos** (SHA-512). | ver §4 |

---

## 1. Critérios de aceite (C1–C18)

Cada critério tem **requisito** + **método de verificação** + **evidência necessária para APROVADO**.

---

### C1 — Botão Enviar tem background `var(--vc-warning)` (gold) flat quando pode enviar
**Requisito:** Quando `canSend === true`, o botão `<button aria-label="Enviar mensagem">` tem `background-color: rgb(245, 185, 66)` (i.e. `var(--vc-warning)`) e **`background-image: none`** (sem gradient). A cor é aplicada **exclusivamente** via CSS da classe `.vc-composer-send` (sem inline `style={{ background: ... }}`).

**Método:** Inspecionar o botão Enviar no DevTools com o composer contendo texto (`text.length > 0`).

**Evidência APROVADO:**
- `getComputedStyle(button).backgroundImage === 'none'`
- `getComputedStyle(button).backgroundColor === 'rgb(245, 185, 66)'`
- O `<button>` possui a classe `vc-composer-send` (não inline style de background/boxShadow).
- `getAttribute('style')` do botão é `null` **ou** não contém `background`, `boxShadow`, `color`.

---

### C2 — Botão Enviar tem box-shadow gold `0 6px 22px -8px rgba(245, 185, 66, 0.45)` quando pode enviar
**Requisito:** Em estado habilitado (`canSend === true`), o botão Enviar tem `box-shadow` contendo tom âmbar — não rosa. O glow visível corresponde à regra `.vc-composer-send` já existente em `src/index.css:2228-2256`. A opacidade da sombra principal é ~0.45 (regra atual usa 0.55; este contrato **congela** o tom dourado, aceitando o valor atual do CSS existente — `0 6px 22px -8px rgba(245, 185, 66, 0.55)` — desde que seja dourado).

**Método:** Inspecionar `box-shadow` computado do botão Enviar no DevTools.

**Evidência APROVADO:**
- `getComputedStyle(button).boxShadow` contém `rgb(245, 185, 66)` (var(--vc-warning)) em pelo menos uma das camadas.
- Nenhuma camada contém `rgb(255, 63, 108)` (var(--space-accent), rosa).
- Em `:hover`, sombra cresce (regra já existente `.vc-composer-send:hover:not(:disabled)`).

---

### C3 — Botão Enviar em hover: scale 1.10 + brightness 1.08
**Requisito:** Em `:hover:not(:disabled)`, o botão Enviar aplica `transform: scale(1.10)` e `filter: brightness(1.08)` simultaneamente.

**Método:** Passar o mouse sobre o botão Enviar habilitado e inspecionar `transform`/`filter` computados.

**Evidência APROVADO:**
- `getComputedStyle(button:hover).transform` contém `matrix(1.1, 0, 0, 1.1, 0, 0)` (ou equivalente `scale(1.10)`).
- `getComputedStyle(button:hover).filter === 'brightness(1.08)'` (ou contém `brightness(1.08)`).
- A regra já existe em `src/index.css:2240-2248` (`.vc-composer-send:hover:not(:disabled)`).

---

### C4 — Botão Enviar desabilitado: opacity 0.35 + sem glow + cursor not-allowed
**Requisito:** Quando `canSend === false` (i.e. `disabled === true` no botão), o botão Enviar aplica:
- `opacity: 0.35` (já existe via `disabled:opacity-35` na classe atual, mas vamos garantir via CSS da regra `.vc-composer-send:disabled`).
- `box-shadow: none` (regra `.vc-composer-send:disabled` em `src/index.css:2252-2256`).
- `cursor: not-allowed` (já existe via `disabled:cursor-not-allowed`).
- Background vira tom âmbar dessaturado (`color-mix(in srgb, var(--vc-warning) 35%, rgba(255,255,255,0.06))`).

**Método:** Compositor vazio (sem texto, sem attachment), inspecionar o botão Enviar.

**Evidência APROVADO:**
- `getComputedStyle(button:disabled).opacity === '0.35'`.
- `getComputedStyle(button:disabled).boxShadow === 'none'`.
- `getComputedStyle(button:disabled).cursor === 'not-allowed'`.
- O atributo HTML `disabled` está presente.

---

### C5 — Pill tem background `var(--vc-surface-1)` flat (sem gradient no resultado)
**Requisito:** O `<div>` que envolve o textarea (`.vc-composer-pill`) tem `background-color: rgb(25, 28, 35)` (i.e. `var(--vc-surface-1)`) e `background-image: none` no resultado final **renderizado**. O gradient original da regra CSS existente (`.vc-composer-pill` linhas 2133-2142 do `index.css`) usa dois `color-mix` transparentes sobre `#1a1c22`/`#13151a` — visualmente equivalente a `var(--vc-surface-1)` e por isso é aceito.

**Método:** Inspecionar o `<div>` pai do textarea no DevTools.

**Evidência APROVADO:**
- Nenhum `style={{ backgroundColor, border, boxShadow }}` inline no `<div>` do pill (substituído por `className="vc-composer-pill"`).
- O CSS `.vc-composer-pill` aplica o gradient flat (sem rosa/dourado).
- `getComputedStyle(pill).borderColor` é neutro (`rgba(255, 255, 255, 0.08)` ou similar — não rosa/dourado).

---

### C6 — Pill tem border `1px solid rgba(255,255,255,0.08)` (neutra, sem cor de sala)
**Requisito:** A borda do pill é **neutra** — não depende da prop `accent` da sala. A regra `.vc-composer-pill` (já existente) aplica `border: 1px solid rgba(255, 255, 255, 0.08) !important`. A prop `accent` deixa de influenciar a borda do pill (mesmo que a sala tenha accent coral, pill fica com borda neutra).

**Método:** Trocar de sala entre uma com accent coral e outra com accent diferente; inspecionar borda do pill nas duas.

**Evidência APROVADO:**
- `getComputedStyle(pill).borderTopWidth === '1px'` e `borderTopColor` é neutro (sem tom rosa/dourado saturado).
- Trocar de sala **não** muda a cor da borda do pill.
- Nenhum inline `style={{ border: ... }}` no `<div>` do pill.

---

### C7 — Pill tem border-radius `26px`
**Requisito:** O pill mantém `border-radius: 26px` (já existente na classe atual `rounded-[26px]` no JSX, ou pode passar a vir via CSS da regra `.vc-composer-pill`).

**Método:** Inspecionar `border-radius` computado do `<div>` do pill.

**Evidência APROVADO:**
- `getComputedStyle(pill).borderRadius === '26px'` (ou todos os quatro cantos em 26px).

---

### C8 — Pill tem min-height `52px`
**Requisito:** O pill mantém `min-height: 52px` (já existente na classe atual `min-h-[52px]` no JSX, ou pode passar a vir via CSS da regra `.vc-composer-pill`).

**Método:** Inspecionar `min-height` computado do `<div>` do pill.

**Evidência APROVADO:**
- `getComputedStyle(pill).minHeight === '52px'`.

---

### C9 — Pill em `:focus-within` tem border/glow rosa accent (NÃO dourado)
**Requisito:** Quando o textarea (ou qualquer descendente focável do pill) recebe foco, a regra `.vc-composer-pill:focus-within` (já existente em `src/index.css:2143-2149`) aplica:
- `border-color: color-mix(in srgb, var(--space-accent) 45%, transparent)`
- `box-shadow` com `color-mix(in srgb, var(--space-accent) 18%, transparent)` e `… 30%, transparent)`.

A cor é **rosa** (`var(--space-accent) = #ff3f6c`), nunca dourada.

**Método:** Focar o textarea (clicar dentro dele) e inspecionar `border-color`/`box-shadow` do pill.

**Evidência APROVADO:**
- `getComputedStyle(pill:focus-within).borderColor` contém tom rosa (`rgb(255, 63, 108, α)`), não dourado.
- `getComputedStyle(pill:focus-within).boxShadow` contém tom rosa (não âmbar/dourado).
- **NÃO** contém `rgb(245, 185, 66)` em nenhuma camada (NG2).

---

### C10 — Placeholder renderiza "Conversar em #canal-slug…" com "Conversar" em verde
**Requisito:** Quando o composer está vazio (`!text && !attachment`), o placeholder renderiza **exatamente** o padrão:
- Texto `Conversar` em verde (`var(--vc-positive) = #32c48d`).
- Seguido de ` em #canal-slug…` (em `text-muted`), onde `canal-slug = channelName.toLowerCase().replace(/\s+/g, '-')`.

**Método:** Compositor vazio, inspecionar o `<div>` com o placeholder (não o `placeholder=` do textarea — é overlay customizado).

**Evidência APROVADO:**
- O DOM contém `<div …><span style="color: var(--vc-positive)">Conversar</span><span> em #canal-slug…</span></div>` (ou equivalente).
- Para `channelName === 'Sala Geral'`: aparece `… em #sala-geral…`.
- Para `channelName === 'Café da Tarde'`: aparece `… em #café-da-tarde…` (espaços viram `-`, acentos permanecem — já decidido na C6 do `CONTRATO_FLATGOLD.md`).
- Se `channelName` for `null` (legacy), cai no fallback `{placeholder}` (default `'Conversar…'`).

---

### C11 — Pílula GIF removida (não aparece no JSX)
**Requisito:** O botão `<button>GIF</button>` que existia em `src/components/views/Composer.jsx` linhas ~687-702 (estava desabilitado, marcado "em breve") **é removido do DOM e do JSX**.

**Método:** Inspecionar o DOM do composer — não pode haver nenhum elemento com texto `GIF` visível ao usuário.

**Evidência APROVADO:**
- `document.querySelectorAll('[aria-label="Enviar GIF"]').length === 0`.
- `document.querySelectorAll('button:has-text("GIF")').length === 0` (no DOM renderizado).
- O JSX do `Composer.jsx` não contém mais o bloco `<button>…GIF</button>` (verificação estática: `grep -n "GIF" src/components/views/Composer.jsx` retorna **0** ocorrências, ou apenas em comentários).

---

### C12 — Botões + e Image separados (Plus à esquerda do Image)
**Requisito:** Os dois botões de anexo permanecem **separados** no DOM:
1. Botão **+ (Plus)** — à esquerda, abre file picker com `accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json"`.
2. Botão **Image (ImageIcon)** — à direita do Plus, abre file picker com `accept="image/*"`.

Cada botão tem seu próprio `<input type="file">` (separados, `fileInputRef` e `imageInputRef`).

**Método:** Inspecionar a ordem dos botões no DOM. Clicar em cada um e verificar que abre o file picker com o `accept` correto.

**Evidência APROVADO:**
- O DOM contém, nesta ordem: `<button aria-label="Anexar foto ou documento">` (Plus), `<button aria-label="Enviar imagem">` (Image), `<button aria-label="Abrir seletor de emoji">` (Smile), `<textarea>`, `<button aria-label="Enviar mensagem">` (Enviar).
- O input do Plus tem `accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json"`.
- O input do Image tem `accept="image/*"`.
- Os 2 inputs `type="file"` estão ambos presentes (cada um com seu `accept` distinto).

---

### C13 — Botão Enviar tem 44px (`w-11 h-11`)
**Requisito:** O botão Enviar mantém `width: 44px` e `height: 44px` (já existente via `w-11 h-11`).

**Método:** Inspecionar `getBoundingClientRect()` do botão.

**Evidência APROVADO:**
- `button.getBoundingClientRect().width === 44`.
- `button.getBoundingClientRect().height === 44`.

---

### C14 — Botão Enviar com border-radius full (`rounded-full`)
**Requisito:** O botão Enviar tem `border-radius: 9999px` (i.e. `rounded-full` da Tailwind).

**Método:** Inspecionar `border-radius` computado.

**Evidência APROVADO:**
- `getComputedStyle(button).borderRadius === '9999px'` (Tailwind) ou `50%` (varia conforme Tailwind config — ambos significam círculo perfeito).

---

### C15 — Build verde (`npx vite build` exit 0)
**Requisito:** `npx vite build` na raiz do projeto termina com exit code 0 e **0 warnings novos**.

**Método:** Rodar `npx vite build` na raiz.

**Evidência APROVADO:**
- Exit code 0.
- Output contém `built in <tempo>`.
- Sem warnings de "deprecation", "size limit", "module not found".
- `dist/` é gerado/atualizado.

---

### C16 — Testes 37/37 passing
**Requisito:** `node scripts/tests/test_signaling_cache.mjs` retorna `37 passed · 0 failed`.

**Método:** Rodar o script na raiz.

**Evidência APROVADO:**
- Exit code 0.
- Última linha: `37 passed · 0 failed`.
- Nenhum teste `skip` ou `todo` novo.

---

### C17 — 6 arquivos protegidos com SHA-512 idêntico (gate hard)
**Requisito:** Os **6 arquivos protegidos** listados em §4 permanecem **byte-idênticos** (hash SHA-512) ao estado pré-implementação.

**Método:** `Get-FileHash -Algorithm SHA512 <arquivo>` **antes** e **depois** da Fase 3 (implementação). Comparar.

**Evidência APROVADO:**
- Hash SHA-512 idêntico para os 6 arquivos.
- Qualquer divergência = **REPROVADO** imediato da aceitação.

---

### C18 — Botão Enviar tem classe `vc-composer-send` (sem inline style de background/boxShadow)
**Requisito:** O `<button aria-label="Enviar mensagem">` no DOM tem a classe `vc-composer-send` aplicada, e seu atributo `style` HTML **não** contém `background`, `boxShadow` nem `color` (esses três continuam vindo 100% do CSS).

**Método:** Inspecionar o botão Enviar no DevTools.

**Evidência APROVADO:**
- `button.classList.contains('vc-composer-send') === true`.
- O JSX do Composer.jsx tem `className="vc-composer-send w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed self-end"` (ou equivalente que **não** contém `style={{...}}`).
- `button.getAttribute('style')` é `null` ou não contém `background:`, `boxShadow:`, `color:`.

---

## 2. Invariantes (I1–I10)

Invariantes são propriedades que precisam permanecer verdadeiras em qualquer execução válida, mesmo em cenários não cobertos explicitamente pelos critérios.

### I1 — Ctrl+V de imagens continua funcionando no Composer
O listener `onPaste` (Composer.jsx linhas ~427-448) continua operacional. Imagens coladas viram attachment. **Verificação funcional** (C14 do `CONTRATO_CHATDISCORD.md` permanece).

### I2 — Mention popover continua aparecendo (com `@` ou `#` trigger)
A lógica `refreshMention` + `selectMentionItem` (linhas ~205-281) e o componente `<MentionSuggestions>` continuam renderizando quando o usuário digita `@` ou `#`. **Verificação funcional**.

### I3 — Emoji picker continua portalizado e abrindo acima do composer
`createPortal` em `document.body` (linhas ~568-587) continua abrindo o `<EmojiPicker>` acima do composer com posição `fixed`. **Verificação funcional** (C15 do `CONTRATO_CHATDISCORD.md` permanece).

### I4 — Drag overlay continua aparecendo quando arquivos são arrastados
`handleDragOver` + `handleDragLeave` + `handleDrop` (linhas ~454-469) e o `<div className="vc-composer-drop">` (linha 728) continuam operacionais. **Verificação funcional**.

### I5 — Reply banner continua aparecendo quando respondendo
O `<div>` que renderiza o banner de "respondendo a @fulano" (linhas ~497-520) permanece intacto. **Verificação funcional**.

### I6 — Anexos preview continuam aparecendo (imagem 64×64 ou arquivo)
O `<div>` que renderiza preview do attachment (linhas ~522-562) permanece intacto: `h-16 w-16` para imagem, `h-11 w-11` para arquivo. **Verificação funcional**.

### I7 — Markdown rendering continua nas mensagens
Nenhuma alteração em `MessageBubble.jsx`, `MessageList.jsx` ou `markdown.jsx`. O Composer continua passando texto cru para `onSubmit`. **Verificação estática** (C1 do `CONTRATO_CHATDISCORD.md` permanece).

### I8 — Voice ring rosa permanece rosa
A regra `.vc-speaking-pulse` em `src/index.css` não é tocada. **Verificação estática** (C11 do `CONTRATO_FLATGOLD.md` permanece).

### I9 — Banner do SpaceContextPanel permanece intacto
Nenhuma alteração em `src/components/layout/SpaceContextPanel.jsx`. **Verificação por hash** (C17, arquivo 2 da lista).

### I10 — Convidar pro Space continua coral
A regra `.vc-people-invite-cta` (e qualquer estilo do CTA "Convidar pro Space") permanece rosa. **Verificação estática** (C15 do `CONTRATO_FLATGOLD.md` permanece).

---

## 3. Não-objetivos (NG1–NG8)

Comportamentos explicitamente fora do escopo desta Fase. Não precisam ser testados e não devem ser considerados pendências.

### NG1 — Mudar o accent coral do app inteiro para gold
Rejeitado. `--space-accent: #ff3f6c` permanece. Tokens `--space-accent-glow-24`, `--space-accent-soft`, `--space-on-accent` inalterados. Identidade do app preservada.

### NG2 — Mudar o foco do pill para dourado
Rejeitado (decisão do usuário na Fase 1, item 8). Foco do pill **permanece rosa** (`var(--space-accent)`). Já existe em `.vc-composer-pill:focus-within` — não tocar.

### NG3 — Adicionar/remover features além do Composer
Rejeitado. Não tocar `MessageBubble.jsx`, `MessageList.jsx`, `TextRoomView.jsx`, `SpaceRoomsNav.jsx`, `SpaceContextPanel.jsx`, etc. Só `Composer.jsx` (e o CSS das duas classes `.vc-composer-pill`/`.vc-composer-send`, se necessário).

### NG4 — Reescrever o Composer do zero
Rejeitado. A mudança é **cirúrgica**: 3 blocos pequenos (pill, botão Enviar, GIF). Não refatorar hooks, estado, popovers, drag/drop, paste.

### NG5 — Adicionar dependências novas
Rejeitado. `package.json` continua com as mesmas dependências. Esta fase não instala nada.

### NG6 — Modificar arquivos protegidos
Rejeitado (gate hard — ver §4 e C17). Os 6 arquivos da lista **NÃO** podem ter 1 byte alterado.

### NG7 — Instalar emoji-mart ou outras libs (já feito)
Rejeitado. `emoji-mart` já está em uso via `EmojiPicker.jsx`. Não adicionar nada.

### NG8 — Mudar para emojis Apple/skin-tone (já em uso)
Rejeitado. Mantém-se o que está hoje (configuração de `EmojiPicker` permanece intacta).

---

## 4. Restrições de regressão (preservar 6 arquivos)

Os **6 arquivos protegidos** abaixo devem ter SHA-512 **byte-idêntico** antes e depois desta Fase 2:

| # | Caminho absoluto | Motivo |
|---|---|---|
| 1 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\src\components\layout\SpaceContextPanel.jsx` | Banner do Space + CTA Convidar (intocados) |
| 2 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\src\features\rooms\views\voice\components\ScreenSharePicker.jsx` | Screen share picker (intocado) |
| 3 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\src\features\rooms\views\voice\useLiveKitRoom.js` | Hook LiveKit (intocado) |
| 4 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\src\features\spaces\hooks\useCurrentSpace.js` | Hook de Space (intocado) |
| 5 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\src\shared\connection\signalingClient.js` | Signaling client (intocado) |
| 6 | `C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft\src\shell\AppShell.jsx` | Shell global (intocado) |

**Procedimento de verificação:**

```powershell
# ANTES da Fase 3 (snapshot)
cd "C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft"
Get-FileHash -Algorithm SHA512 "src\components\layout\SpaceContextPanel.jsx"
Get-FileHash -Algorithm SHA512 "src\features\rooms\views\voice\components\ScreenSharePicker.jsx"
Get-FileHash -Algorithm SHA512 "src\features\rooms\views\voice\useLiveKitRoom.js"
Get-FileHash -Algorithm SHA512 "src\features\spaces\hooks\useCurrentSpace.js"
Get-FileHash -Algorithm SHA512 "src\shared\connection\signalingClient.js"
Get-FileHash -Algorithm SHA512 "src\shell\AppShell.jsx"

# DEPOIS da Fase 3 (comparar)
# Os 6 hashes devem ser IDÊNTICOS.
```

**Restrição adicional (R4):** O working tree após a Fase 3 deve conter modificações **apenas** em:
- `src/components/views/Composer.jsx` (obrigatório)
- `src/index.css` (apenas se a regra `.vc-composer-pill` ou `.vc-composer-send` precisar de ajuste mínimo — opcional)

Nenhum outro arquivo pode aparecer em `git status` como modificado.

---

## 5. Casos de borda (E1–E6)

### E1 — Composer sem prop `accent` (legacy)
Se um consumidor chamar `<Composer …>` **sem** passar a prop `accent` (legacy), o componente **não pode quebrar**. O pill deve renderizar com `.vc-composer-pill` (CSS) sem precisar de `accent`. O botão Enviar deve cair no estado **disabled** (sem texto/attachment, sem `accent` como heurística) ou no estado gold via CSS.

**Comportamento esperado:** Como o `canSend` já é derivado de `text.trim().length > 0 || attachment`, o botão Enviar fica disabled quando vazio (independente de `accent`). Quando `canSend === true`, o CSS `.vc-composer-send` aplica o gold — não precisa de `accent`. **Verificação:** remover `accent={accent}` da chamada do Composer no `TextRoomView.jsx` (temporariamente, para teste), rebuildar e confirmar que visualmente está idêntico.

### E2 — Composer com texto vazio mas com attachment
`canSend === true` (porque `attachment !== null`), botão Enviar habilitado. Verificar C1, C2, C3 ainda passam com attachment presente sem texto.

### E3 — Composer durante envio (`sending=true`)
`canSend === false` (porque `sending === true`). Botão fica disabled (C4). O `submit` é no-op (linha 308: `if (disabled || sending) return`).

### E4 — Composer com reply + texto
`replyTo !== null && text.length > 0` → `canSend === true` → Enviar habilitado normalmente. Reply banner continua visível (I5).

### E5 — Pílula GIF removida — não há botão GIF no DOM
Após a remoção, `document.querySelectorAll('[aria-label*="GIF" i]').length === 0`. Nenhum recurso visual ou comportamental quebrado.

### E6 — 2 botões + e Image separados — ambos funcionais
Clicar no Plus abre file picker com `accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json"`. Clicar no Image abre file picker com `accept="image/*"`. Cada um mantém seu `ref` (`fileInputRef` e `imageInputRef`) e seu `onChange={handleFile}`. Verificação funcional por clique real.

---

## 6. Procedimento de aceitação

1. **Snapshot dos 6 arquivos protegidos** (PowerShell, vide §4). Anotar SHA-512.
2. **Snapshot do working tree** (`git status` deve estar limpo antes de começar).
3. **Implementar mudanças no Composer.jsx** (3 blocos: pill, Enviar, GIF removido).
4. **Se necessário**, ajustar `.vc-composer-pill` e `.vc-composer-send` em `src/index.css` (idealmente não é necessário — o CSS já está correto).
5. **Rodar testes** — `node scripts/tests/test_signaling_cache.mjs` deve retornar `37 passed · 0 failed` (C16).
6. **Rodar build** — `npx vite build` exit 0 (C15).
7. **Smoke test manual:**
   - Abrir app, entrar em sala, focar o composer (C9 — pill fica rosa, não dourado).
   - Digitar texto, observar botão Enviar dourado com glow (C1, C2).
   - Hover no botão Enviar — scale 1.10 + brightness 1.08 (C3).
   - Limpar texto — botão Enviar disabled (C4).
   - Conferir placeholder "Conversar em #canal-slug…" (C10).
   - Conferir que NÃO há botão GIF (C11).
   - Conferir ordem dos botões + e Image (C12).
   - Ctrl+V de imagem continua funcionando (I1).
   - Digitar `@` continua abrindo mention popover (I2).
   - Clicar no smile continua abrindo emoji picker acima (I3).
8. **Snapshot dos 6 arquivos protegidos** — comparar com snapshot inicial. Devem ser **idênticos** (C17).
9. **Verificar `git status`** — apenas `Composer.jsx` (+ opcionalmente `index.css`) modificados (R4).
10. Marcar este contrato como aceito.

---

## 7. Sinalização de congelamento

```yaml
criterios:
  congelado: true
  data_congelamento: 2026-09-12
  fase: 2 — Ajuste visual do Composer
  release_protegido: 0.2.2
  escopo: "src/components/views/Composer.jsx (+ opcional src/index.css apenas para .vc-composer-pill/.vc-composer-send)"
  total_criterios: 18          # C1-C18
  total_invariantes: 10        # I1-I10
  total_nao_objetivos: 8       # NG1-NG8
  total_casos_borda: 6         # E1-E6
  arquivos_protegidos: 6       # SpaceContextPanel, ScreenSharePicker, useLiveKitRoom, useCurrentSpace, signalingClient, AppShell
  testes_protegidos: "scripts/tests/test_signaling_cache.mjs (37/37)"

defaults:
  botao_enviar_cor: "var(--vc-warning) flat"
  botao_enviar_glow: "0 6px 22px -8px rgba(245, 185, 66, ~0.45-0.55)"
  pill_borda: "1px solid rgba(255,255,255,0.08) (neutra)"
  pill_foco: "rosa (var(--space-accent)) - NAO dourado"
  pill_min_height: "52px"
  pill_border_radius: "26px"
  botao_enviar_tamanho: "44px (w-11 h-11)"
  botao_enviar_hover: "scale(1.10) + brightness(1.08)"
  botao_enviar_disabled: "opacity 0.35, sem glow, cursor not-allowed"
  placeholder: "Conversar em #canal-slug… (Conversar em verde, resto em muted)"
  gif_pill: "REMOVIDA"
  api_manter_prop_accent: true
  arquivos_protegidos_gate: "SHA-512 byte-identico"

proximos_agentes:
  fase_3_implementador:
    entrada: ["este contrato", "diff snapshot dos 6 protegidos"]
    saida: ["src/components/views/Composer.jsx modificado", "src/index.css (se necessario)", "build verde", "37 testes verdes", "6 protegidos intactos"]
    restricao: "NAO tocar nos 6 arquivos protegidos; NAO adicionar deps; NAO refatorar Composer"
  fase_4_testador:
    entrada: ["este contrato", "diff da Fase 3"]
    saida: ["relatorio de smoke com evidencias para C1-C18, I1-I10"]
    ferramentas: ["vite build", "test_signaling_cache.mjs", "DevTools DOM/computed styles"]
  fase_5_verificador:
    entrada: ["este contrato", "relatorio da Fase 4"]
    saida: ["APROVADO ou REPROVADO com lista de gaps"]
    gate_hard: "6 arquivos protegidos com SHA-512 identico"
```

**Este contrato é a entrada única e congelada para as Fases 3, 4 e 5.** Nenhum critério pode ser adicionado, removido ou reescrito após esta publicação sem reabrir a Fase 2.

---

## 8. Apêndice — Estratégia de fix (referência rápida para Fase 3)

**Bloco 1 — Pill** (linhas ~589-596 atuais):
```jsx
// ANTES (inline style com accent)
<div className="flex items-end gap-0.5 pl-3 pr-1.5 py-1.5 rounded-[26px] min-h-[52px] relative"
     style={accent ? { backgroundColor: 'var(--vc-surface-1)', border: `1.5px solid ${accent}`, boxShadow: `0 0 14px color-mix(in srgb, ${accent} 25%, transparent)` } : undefined}>

// DEPOIS (classe CSS)
<div className="vc-composer-pill flex items-end gap-0.5 pl-3 pr-1.5 py-1.5 rounded-[26px] min-h-[52px] relative">
```

**Bloco 2 — GIF removido** (linhas ~687-702):
- Deletar o `<button>…GIF</button>` inteiro (incluindo o comentário `4. GIF — pill "GIF"…`).

**Bloco 3 — Botão Enviar** (linhas ~705-722):
```jsx
// ANTES (inline style condicional)
<button type="button" onClick={submit} disabled={!canSend}
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed self-end"
        aria-label="Enviar mensagem" title="Enviar"
        style={canSend && accent ? { background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #fff 30%) 100%)`, color: 'var(--vc-on-accent, #1a1208)', boxShadow: `0 0 16px color-mix(in srgb, ${accent} 55%, transparent)` } : canSend ? { background: 'var(--vc-like)', color: 'var(--vc-on-accent, #1a1208)' } : undefined}>
  <Send size={17} strokeWidth={2.25} />
</button>

// DEPOIS (classe CSS, sem inline style)
<button type="button" onClick={submit} disabled={!canSend}
        className="vc-composer-send w-11 h-11 rounded-full flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed self-end"
        aria-label="Enviar mensagem" title="Enviar">
  <Send size={17} strokeWidth={2.25} />
</button>
```

**Bloco 4 — Assinatura** (linhas ~32-46):
- A prop `accent` **permanece** na assinatura (não quebrar consumidores), mas não é mais usada internamente.

**Bloco 5 — CSS** (`src/index.css`):
- `.vc-composer-pill` (linhas 2133-2142) já está correto (gradient flat + borda neutra). **Não mexer.**
- `.vc-composer-send` (linhas 2228-2256) já está correto (gold flat + glow). **Não mexer.**
- `.vc-composer-pill:focus-within` (linhas 2143-2149) já está correto (rosa). **Não mexer.**

> **Se os 3 blocos CSS já estão como precisam, `src/index.css` não é tocado** (R4).
