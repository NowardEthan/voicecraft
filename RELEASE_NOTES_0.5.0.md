# Voice 0.5.0 — Voice (by Aura Inc.) + 5 fases de otimização

**Data de release:** 2026-09-15  
**Bump:** `0.4.0 → 0.5.0` (minor — novas features compatíveis)

---

## 🎉 Highlights

Esta release marca a transição da marca **VoiceCraft** para **Voice (by Aura Inc.)** e entrega 5 fases de otimização de velocidade percebida baseadas na pesquisa interna (`Documentação/Voice_otimizacao_velocidade_percebida.pdf`).

## 🎨 Nova identidade Voice (by Aura Inc.)

- **Voice Brand Kit 2026** integrado em todo o app (paleta `#0A66FF` Voice Blue + `#071225` Deep Ink + `#57BEFF` Milk Blue).
- Co-branding "by Aura Inc." presente na tela de login, splash e rodapé do chat.
- Novos ícones `voice-icon-primary`, `voice-symbol-white`, `voice-logo-stacked`, `voice-logo-horizontal-dark` e símbolo `aura-symbol-blue-transparent` em todas as resoluções (16/32/48/64/128/256/512/1024).
- `icon.ico` regenerado com **6 resoluções embutidas** (incluindo 256×256 obrigatório para o instalador NSIS e taskbar do Windows).
- Tela de login com gradiente azul Voice e botão SSO "Continuar com Microsoft".

## ⚡ Fase 1 — Quick wins de boot

- **Sem flash preto no cold start**: `backgroundColor: #071225` (Deep Ink) idêntico no `BrowserWindow` nativo, no `<style>` do `index.html` e em todos os componentes React.
- `ready-to-show` redundante e `did-finish-load` show() duplicado removidos do `electron/main.js`.
- 5 marcas `performance.mark('voice:*')` padronizadas (`process-start`, `window-created`, `renderer-start`, `first-shell-paint`, `ready`).

## ⚡ Fase 2 — Snapshot L1 + boot inteligente

- **Snapshot L1 particionado por `uid`** em `localStorage` (`voicecraft:l1:<uid>`) com schema versioning (`SCHEMA_VERSION = 1`).
- Bifurcação do `BootGate`: **com cache válido → shell direto** (sem splash fullscreen); **sem cache → splash minimalista**.
- Projeção leve de mensagens (20 últimas, 7 campos), teto 150KB com eviction automática.
- **Drafts persistentes** no Composer (debounce 3s + flush em `beforeunload`).
- **Prefetch por `onPointerDown`** em `RoomRow` (lê `voicecraft:chat:*` síncrono, idempotente via `Set<warmed>`).

## ⚡ Fase 3 — Outbox persistente + retry resiliente

- **Outbox em IndexedDB** (`voicecraft_chat_db.outbox`) com Blobs nativos (anexos sobrevivem a reload/fechamento).
- **UUID v4** como `id` canônico (= `clientMutationId` = docId Firestore — idempotente por construção via `setDoc`).
- **Backoff exponencial** com jitter: 1s → 2s → 4s → 8s → 16s (cap), máx 5 tentativas → `permanent-failed`.
- Dispatcher singleton com listener `online` + polling 5s.
- Reconciliação pós-boot (mensagens in-flight ao fechar aparecem como `sending` ao reabrir).
- **UI inline de falha**: badge "Falha no envio" + botões "Tentar novamente", "Copiar texto", "Excluir".
- **Fix de bug crítico**: removido envio duplo (useChat chamava `signaling.sendChatMessage` + dispatcher também chamava).

## ⚡ Fase 4 — Calls e mídia sob demanda

- **Throttling de `onActiveSpeakers`**: coalescing para ~15fps via delta-check `>= 50ms` (reduz disputa de CPU em call + jogo).
- **`backdrop-blur` condicional**: atributo `data-perf-tier="low|mid|high"` no `<body>`; CSS desativa `backdrop-filter` em hardware modesto.
- **`ScreenSharePicker` lazy**: chunk carregado sob demanda (não no boot inicial).
- **`dynacast: true` + `adaptiveStream: true`** no construtor `Room` do LiveKit (reduz tracks não-subscribed e ajusta resolução automaticamente).

## ⚡ Fase 5 — Acabamento, placeholders e telemetria

- **`PerformanceObserver` para longtasks** (>50ms) com buffer circular de 50 em `window.__VOICE_PERF__.longtasks`. Funções `getLongTasks()`/`clearLongTasks()` para inspeção via DevTools. Zero chamadas de rede.
- **`performance.measure` entre marks `voice:*`**: `voice:renderer-to-shell`, `voice:process-to-ready`, `voice:shell-to-ready`.
- **Placeholders estáticos** (sem shimmer animado): `SkeletonStack` com `bg-surface2/40` e dimensões exatas.
- **`aspect-ratio` em imagens do chat** (Fase 1 da pesquisa): zero CLS ao carregar anexos.
- **Motion presets** ajustados para 120-220ms (`fast: 0.12, base: 0.18, slow: 0.22`).
- `useReducedMotion()` aplicado em todos os componentes de voz.

## 🖼️ Flash-preto eliminado (imagens)

- **`SoftImage`** reescrito com `useState<visibleSrc>` + `image.decode()`: a imagem anterior permanece visível até a nova estar completamente decodificada.
- **`preloadImage(src)`** exportado para pré-decodificar antes do hover.
- **`PersonAvatar`**: removido `#1a1c22` (preto); agora usa cor `colorFromId` + `SoftImage` sobreposto.
- **`MessageBubble`**: imagens únicas e galeria agora usam `SoftImage` com `placeholderColor` translúcido (não preto).

## 📊 Métricas alvos (da pesquisa)

- Cor da janela < 100ms ✅
- Shell visível warm < 300ms ✅
- Conteúdo do cache < 150ms após shell ✅
- Feedback do clique < 50ms ✅
- Mensagem otimista < 50ms ✅

## 🔧 Compatibilidade

- ✅ Não exige reinstall (mesmo `appId: com.voicecraft.app`).
- ✅ Auto-update funcional: `electron-updater` continua lendo `latest.yml`.
- ✅ Compatível com versões 0.4.x → upgrade direto preserva cache local, drafts e outbox.

## 📦 Instalação

Baixe `VoiceCraft Setup 0.5.0.exe` e instale sobre a versão anterior — o instalador NSIS preserva os dados em `%APPDATA%/VoiceCraft`.
