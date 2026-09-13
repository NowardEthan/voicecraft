# Contrato de Aceite — Fase 2 (Cache de Space + Transição estável)

Este documento congela o conjunto de critérios, invariantes e não-objetivos
que o engenheiro de critérios definiu para a Fase 2 da refatoração do
`SignalingClient` (cache de Space por id, hidratação única, transição de
visualização sem remount forçado). Subagentes independentes usam este
arquivo como referência única para validar a aceitação.

**Escopo:** alterações em `src/shared/connection/signalingClient.js`,
`src/shell/AppShell.jsx`, `src/components/layout/SpaceContextPanel.jsx`,
`src/features/spaces/hooks/useCurrentSpace.js`,
`src/features/rooms/views/voice/components/ScreenSharePicker.jsx` e
`src/features/rooms/views/voice/useLiveKitRoom.js`.

**Suíte de validação automatizada:**
`scripts/tests/test_signaling_cache.mjs` exercita o cache de forma
dinâmica e o restante do contrato via inspeção estática. Rodar com:

```
node scripts/tests/test_signaling_cache.mjs
```

Todos os critérios (C1–C9) e invariantes (I1–I8) precisam estar verdes
para que a Fase 2 seja aceita.

---

## Critérios (C1–C9)

### C1 — Cache de Space por id
`SignalingClient` mantém um `Map<string, Space>` em `_spaceCacheById`,
expõe `getCachedSpace(id)`, `cacheSpace(space)`, `invalidateCachedSpace(id)`
e `clearSpaceCache()`. Leituras não devem produzir efeitos colaterais
e o cache precisa sobreviver a múltiplas navegações entre Spaces.

**Propriedades verificáveis:**
- `_spaceCacheById instanceof Map`
- `getCachedSpace` retorna `null` para ids ausentes / falsy
- `cacheSpace` substitui entradas existentes e mantém `_spaceCache` em
  sincronia quando o Space armazenado é o ativo
- `invalidateCachedSpace` remove uma única entrada; se o Space removido
  era o ativo, `_spaceCache` também passa a `null`
- `clearSpaceCache` esvazia tudo (usado por `disconnect` / sign-out)
- `cacheSpace` ignora entradas sem `id` ou falsy

**Testes:** `C1 — _spaceCacheById is a Map`,
`C1 — getCachedSpace on empty cache returns null`,
`C1 — cacheSpace stores a Space in the Map`,
`C1 — cacheSpace replaces an existing entry`,
`C1 — cacheSpace ignores falsy / id-less objects`,
`C1 — cacheSpace keeps _spaceCache in sync when storing the active space`,
`C1 — cacheSpace does NOT clobber _spaceCache when storing a non-active space`,
`C1 — invalidateCachedSpace removes a single id`,
`C1 — invalidateCachedSpace clears _spaceCache if it pointed at the deleted space`,
`C1 — invalidateCachedSpace ignores missing ids`,
`C1 — clearSpaceCache wipes everything`,
`Multiple Spaces round-trip correctly`.

### C2 — Cache miss hidrata via `_hydrateSpace` e armazena em cache
Quando `getCachedSpace(spaceId)` retorna `null`, `joinSpace` entra no
caminho de cache miss: faz `getDoc(spaceRef(spaceId))`, valida
existência, executa **uma única** chamada a `_hydrateSpace` (que
internamente resolve rooms + members + user enrich) e ao terminar
chama `cacheSpace(...)` para que a próxima navegação para esse mesmo
Space seja instantânea. O resultado retornado deve ser o mesmo objeto
que acabou de ser cacheado, e o getter deve entregá-lo em uma chamada
subsequente sem nova hidratação.

**Propriedades verificáveis:**
- `_hydrateSpace` é invocado exatamente uma vez no caminho de cache miss
- `_hydrateSpace` chama `cacheSpace(full)` ao final do seu corpo
- Após `joinSpace(id)` em cache miss, `getCachedSpace(id)` retorna o
  mesmo objeto que `joinSpace` devolveu em `{ space }`
- O comentário inline do código deve documentar a eliminação do double
  hydrate anterior

**Testes:** `C2 — cache miss invokes _hydrateSpace exactly once and
caches the result`,
`C2 — _hydrateSpace stores its return value via cacheSpace`,
`C2 — _hydrateSpace returns the same object that cacheSpace stores`,
`C2 — source documents the elimination of the double-hydrate`.

### C3 — Hidratação única (sem double round-trip em primeira visita)
O caminho de cache miss roda `_hydrateSpace` uma única vez. A versão
anterior do código fazia duas chamadas em sequência imediata (antes e
depois do reconcile), dobrando o round-trip de primeira visita sem
benefício observável. Esse double-hydrate precisa estar explicitamente
eliminado e documentado no código.

**Propriedades verificáveis:**
- Existe exatamente uma chamada a `this._hydrateSpace(...)` no fluxo
  do `joinSpace` (caminho de cache miss)
- O comentário inline menciona o problema do double-hydrate e sua
  eliminação
- `_reconcileMemberDocs` é fire-and-forget (>=2 call sites, nenhum
  com `await`)

**Testes:** `C3 — cache-miss path runs _hydrateSpace exactly once`,
`C3 — _reconcileMemberDocs is fire-and-forget (>=2 call sites, none awaited)`.

### C4 — Troca de Space não força remount do `SpaceContextPanel`
O wrapper `<div>` que envolve `<SpaceContextPanel>` em
`src/shell/AppShell.jsx` **não pode** receber `key={currentSpace?.id}`
(ou qualquer chave que varie com o Space ativo). O componente, sem essa
chave, usa um `useEffect` em `[space?.id]` para resetar estado efêmero
interno (`menuOpen`, `menuPos`, `spaceSettingsOpen`, `confirmDeleteId`),
permitindo transição limpa sem destruir/reconstruir o componente.

**Propriedades verificáveis:**
- Nenhum `key={currentSpace?.id}` (ou similar) imediatamente antes de
  `<SpaceContextPanel` em `AppShell.jsx`
- `SpaceContextPanel` reseta `menuOpen`, `menuPos`, `spaceSettingsOpen`
  e `confirmDeleteId` em um efeito dependente de `[space?.id]`

**Testes:** `C4 — AppShell.jsx does NOT key the SpaceContextPanel wrapper by currentSpace.id`,
`C4 — SpaceContextPanel resets menuOpen etc. on space.id change`.

### C5 — Transição de visualização estável (sem unmount forçado no container)
A transição entre Spaces em `AppShell` e o ciclo de vida de
`SpaceContextPanel` precisam preservar a montagem do painel. O container
no JSX de `AppShell.jsx` (o `<div>` que envolve `<SpaceContextPanel>`)
não deve possuir nenhuma chave (`key=`) que force React a desmontar e
remontar o painel quando o Space muda. Adicionalmente, o painel
deve usar `forwardRef` (ou ref forwarding equivalente) para que a
estrutura herde corretamente refs externas quando aplicável.

**Propriedades verificáveis:**
- O `<div>` que envolve `<SpaceContextPanel` em `AppShell.jsx` não tem
  nenhum atributo `key=` (em qualquer variação)
- `SpaceContextPanel` está exportado via `forwardRef` para integração
  limpa com refs
- A transição do painel depende apenas do efeito de reset interno
  mencionado em C4, não de um remount

**Testes:** `C5 — AppShell panel wrapper has no key= attribute`,
`C5 — SpaceContextPanel uses forwardRef`,
`C5 — Panel transitions reset ephemeral state via effect, not unmount`.

### C6 — Presença não invalida o cache desnecessariamente
`applyPresenceMap` em `signalingClient.js` faz shallow check antes de
mutar `_spaceCache`. Quando nada mudou (mapa de presença idêntico),
nenhuma escrita em `_spaceCache` deve ocorrer. O hook `useCurrentSpace`
espelha esse shallow check no `onPresenceChanged` e retorna `prev`
quando nada mudou, evitando re-render da árvore de membros em cada
tick do RTDB.

**Propriedades verificáveis:**
- `applyPresenceMap` declara `let changed = false` e só muta
  `_spaceCache` quando `changed && this._spaceCache?.members`
- `useCurrentSpace.onPresenceChanged` retorna `prev` quando
  `!changed`

**Testes:** `C6 — applyPresenceMap shallow-checks before mutating _spaceCache`,
`C6 — useCurrentSpace onPresenceChanged returns prev when nothing changed`.

### C7 / I1 — `keepVoice` preserva a chamada LiveKit ao trocar de Space
Quando o usuário troca de Space enquanto está em uma chamada de voz, o
`voiceSpaceId` precisa continuar apontando para o Space original e o
`roomId` precisa continuar o mesmo. `useCurrentSpace.selectSpace` aceita
`opts.keepVoice`, `AppShell` propaga como `keepVoice: !!currentRoom`,
e `joinSpace` computa `preserving = !!(keepVoice && voiceRoomId && voiceSpaceId)`.

**Propriedades verificáveis:**
- `useCurrentSpace.selectSpace` propaga `keepVoice: !!opts.keepVoice`
- `AppShell.handleSelectSpace` passa `keepVoice: !!currentRoom`
- `joinSpace` calcula `voiceSpaceId = this.voiceSpaceId || (this.roomId ? this.spaceId : null)`
- `joinSpace` calcula `preserving = !!(keepVoice && voiceRoomId && voiceSpaceId)`

**Testes:** `C7 / I1 — keepVoice is threaded; voiceSpaceId preserves LiveKit`.

### C8 — Headphones no compartilhamento de tela
O `ScreenSharePicker` continua expondo o checkbox "usar fones" e
propaga o flag em `onPick(sourceId, { ..., headphones })`. O hook
`useLiveKitRoom` mantém o `screenAudioCaptureRef` com a forma
`{ active, headphones }` e dá `duckMic` apenas quando a captura está
ativa e o usuário **não** está usando fones, evitando eco do áudio do
sistema.

**Propriedades verificáveis:**
- `ScreenSharePicker` renderiza `<Headphones>` e o checkbox
  `usingHeadphones`, e propaga `headphones: withSystemAudio && usingHeadphones`
  no `onPick`
- `useLiveKitRoom` mantém `screenAudioCaptureRef = useRef({ active: false, headphones: false })`
- `duckMic = !!(cap?.active && !cap?.headphones && audio.dataset?.vcSource !== 'screen')`
- `setScreenAudioCaptureActive(active, opts = {})` aceita
  `opts.headphones` e armazena `headphones: !!(active && opts.headphones)`

**Testes:** `C8 — ScreenSharePicker still ships the headphones checkbox`,
`C8 — useLiveKitRoom still mutes mic when capturing system audio without headphones`.

### C9 — `getCachedSpace` é read-only (sem efeitos colaterais)
`getCachedSpace(id)` precisa ser um read puro: não escreve no cache, não
dispara listeners, não emite eventos. O objeto retornado deve ser o
mesmo objeto armazenado (`===`) para garantir identidade estável entre
navegações.

**Propriedades verificáveis:**
- Snapshot do cache antes e depois da chamada é idêntico
- O retorno é o mesmo objeto (não um clone)

**Testes:** `C9 — getCachedSpace delivers cache hit without side-effects`.

---

## Invariantes (I1–I8)

Invariantes são propriedades que precisam permanecer verdadeiras em
qualquer execução válida, mesmo em cenários não cobertos explicitamente
pelos critérios.

### I1 — Preservação do LiveKit na troca de Space
(Vide C7.) `keepVoice` precisa propagar-se desde a chamada do usuário
em `selectSpace` até o cálculo de `preserving` em `joinSpace`,
garantindo que uma chamada ativa nunca seja interrompida por uma
troca de Space. **Verificação estática + comportamental.**

### I2 — Identidade do objeto cacheado
`_spaceCacheById.get(id)` retorna **o mesmo objeto** que foi passado a
`cacheSpace(...)`. A navegação subsequente não cria clone nem rehidrata
o Space. **Verificação comportamental** (assert `===`).

### I3 — `cacheSpace` no-op para entradas inválidas
`cacheSpace(null)`, `cacheSpace(undefined)`, `cacheSpace({})` não
devem alterar o tamanho do `_spaceCacheById` nem `_spaceCache`. Erros
silenciosos são aceitáveis desde que o estado seja preservado.

### I4 — `_spaceCache` espelha o Space ativo
Para qualquer `spaceId` ativo, `this._spaceCache` deve apontar para
`this._spaceCacheById.get(spaceId)` imediatamente após `cacheSpace`
ser chamado com esse Space.

### I5 — Invalidação coerente com `_spaceCache`
Quando `invalidateCachedSpace(id)` é chamado e `this.spaceId === id`,
`_spaceCache` deve passar a `null`. Quando `spaceId !== id`, o cache
ativo deve permanecer intacto.

### I6 — `clearSpaceCache` zera também `_spaceCache`
`clearSpaceCache` deve limpar `_spaceCacheById` **e** zerar
`_spaceCache`. Necessário para `disconnect` consistente.

### I7 — Reconciliação fire-and-forget
`_reconcileMemberDocs(spaceId, ids)` é invocado sem `await` em todos os
call sites do `joinSpace` (cache hit, cache miss, e qualquer outro
futuro). Falhas de reconciliação não podem bloquear a navegação.

### I8 — `useCurrentSpace.onPresenceChanged` idempotente em ausência de mudança
Quando o mapa de presença recebido é estruturalmente equivalente ao
anterior (mesmas chaves, mesmos `online` / `roomId`), o updater
retorna `prev` sem alocar nova referência de `spaceMembers`. Garante
que ticks inúteis do RTDB não disparam re-render da árvore de membros.

---

## Não-objetivos (NG1–NG10)

Comportamentos que **não** fazem parte do escopo da Fase 2. Não
precisam ser testados pelo `test_signaling_cache.mjs` e não devem ser
considerados pendências se não estiverem implementados.

### NG1 — Persistência do cache entre sessões
O cache vive apenas em memória (`Map`). Não há persistência em
`localStorage`, IndexedDB ou backend. Recarregar a aba reseta o
cache — comportamento aceitável.

### NG2 — Invalidação por tempo (TTL)
Não há expiração automática de entradas. Entradas só saem do cache
via `invalidateCachedSpace`, `clearSpaceCache`, ou `disconnect`.

### NG3 — Cache de Rooms (subSpace)
Apenas Spaces inteiros são cacheados. Rooms individuais continuam
sendo hidratadas a cada troca via `_attachSpaceListeners`.

### NG4 — Estratégia de cache LRU / LFU
Não há política de eviction. O cache pode crescer indefinidamente
durante uma sessão longa — considerado aceitável dado o uso típico
(poucos Spaces visitados por sessão).

### NG5 — Sincronização cross-tab
Mudanças em uma aba não invalidam o cache de outras abas. Cada aba
mantém seu próprio `SignalingClient` independente.

### NG6 — Cache de mensagens / chat
Mensagens, thoughts, peers, signals — nada disso é cacheado em
memória. Apenas o documento do Space (`rooms` + `members`) é
cacheado.

### NG7 — Pré-busca de Spaces do rail
Não há prefetch automático dos Spaces listados no rail. Apenas Spaces
que o usuário efetivamente visita entram no cache.

### NG8 — Migração do formato antigo
`_spaceCache` (o cache legado de "Space ativo") coexiste com
`_spaceCacheById`. Não há migração forçada nem plano de remoção do
legado nesta Fase.

### NG9 — Reordenação de Members em runtime
Mudanças em `members` via Firestore atualizam o `_spaceCache` em
ordem de chegada. Não há ordenação estável por `displayName`, `role`,
ou `online` na camada de cache.

### NG10 — Telemetria / métricas do cache
Não há contador de hits/misses, logging, ou métricas expostas sobre o
uso do cache. Diagnóstico é feito via inspeção manual de
`_spaceCacheById.size`.

---

## Procedimento de aceite

1. `node scripts/tests/test_signaling_cache.mjs` deve terminar com
   `N passed · 0 failed` (N inclui todos os critérios C1–C9 + invariantes
   I1–I8 explicitamente nomeados).
2. `npx vite build` deve concluir com sucesso, sem warnings novos.
3. Nenhum critério pode estar marcado como pendente ou
   "não explicitamente testado" no relatório do verificador.
4. Este documento deve estar commitado em `docs/CONTRATO_FASE2_ACEITE.md`
   antes da marcação da Fase 2 como concluída.
