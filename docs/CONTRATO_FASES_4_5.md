# Contrato de Critérios — Fases 4 + 5

Status: **CONGELADO** (`criterios.congelado = true`).

---

## FASE 4 — Calls e Compartilhamento

### C1 — Throttling de `onActiveSpeakers`
- **Requisito**: O handler de `onActiveSpeakers` em `src/features/rooms/views/voice/useLiveKitRoom.js` deve coalescer as atualizações de `setSelfSpeaking`/`setRemoteSpeaking` para no máximo ~15fps (delta >= 50ms entre updates), sem alterar a API pública do hook.
- **Verificação**: grep por `requestAnimationFrame` ou `setInterval` dentro de useLiveKitRoom + diff de timestamp `now - lastTick >= 50`.
- **Evidência**: trecho de código mostrando o throttle com `lastSpeakerUpdateRef.current` ou similar.

### C2 — `backdrop-blur` condicional ao perfMode
- **Requisito**: Adicionar atributo `data-perf-tier="low|mid|high"` no `<body>` ou no elemento raiz do app shell quando `resolvePerfProfile` mudar. Componentes `VoiceControlDock`, `VoiceRoomHeader` e qualquer outro que use `backdrop-blur-xl`/`backdrop-blur-md` devem condicionar a classe via `body[data-perf-tier="low"]` (CSS) — quando tier=low, removem blur.
- **Verificação**: grep por `backdrop-blur` + `data-perf-tier` no CSS do index.css + body ou shell.
- **Evidência**: regra CSS `[data-perf-tier="low"] .vc-blur { backdrop-filter: none !important }` ou equivalente.

### C3 — Lazy load do `ScreenSharePicker`
- **Requisito**: Em `src/features/rooms/views/voice/components/`, o `ScreenSharePicker` deve ser carregado via `React.lazy(() => import('./ScreenSharePicker'))` + `<Suspense fallback={null}>`. Nunca deve estar no bundle inicial da call.
- **Verificação**: grep por `lazy(() => import` no VoiceRoomView ou VoiceControlDock.
- **Evidência**: imports usando `React.lazy` + bloco `<Suspense>`.

### C4 — `dynacast` + `adaptiveStream` no LiveKit Room
- **Requisito**: A instanciação do `livekit-client` `Room` deve passar explicitamente `dynacast: true` e `adaptiveStream: true` nas opções de construtor.
- **Verificação**: grep em `liveKitSession.js` ou `useLiveKitRoom.js` por `dynacast` e `adaptiveStream`.
- **Evidência**: trecho de código com `new Room({ dynacast: true, adaptiveStream: true, ... })` ou `roomOptions = { ... }`.

---

## FASE 5 — Acabamento, Placeholders e Telemetria

### C5 — `PerformanceObserver` para longtasks > 50ms
- **Requisito**: Criar `src/shared/perf/telemetry.js` que registra `PerformanceObserver` para `entryType: 'longtask'`, mantém buffer circular das últimas 50 entradas em `window.__VOICE_PERF__.longtasks`, e expõe `getLongTasks()` e `clearLongTasks()`.
- **Verificação**: grep por `PerformanceObserver`, `entryTypes: ['longtask']` ou `entryType: 'longtask'`.
- **Evidência**: módulo telemetry.js exportando `initTelemetry()` e expondo `__VOICE_PERF__`.

### C6 — `performance.measure` entre `voice:*` marks
- **Requisito**: No final do boot (após `voice:ready`), criar measures:
  - `voice:renderer-to-shell`: `voice:renderer-start` → `voice:first-shell-paint`
  - `voice:process-to-ready`: `voice:process-start` → `voice:ready`
  - `voice:shell-to-ready`: `voice:first-shell-paint` → `voice:ready`
- **Verificação**: grep por `performance.measure` + `voice:*`.
- **Evidência**: bloco com `performance.measure('voice:renderer-to-shell', { start: 'voice:renderer-start', end: 'voice:first-shell-paint' })` etc.

### C7 — Telemetria zero network
- **Requisito**: O módulo `telemetry.js` não deve fazer `fetch`/`XMLHttpRequest`/`navigator.sendBeacon`. Logs no console (com prefixo `[voice-perf]`) são permitidos para debug.
- **Verificação**: grep por `fetch\|sendBeacon\|XMLHttpRequest` em telemetry.js (deve ser 0 ocorrências em contextos de envio).
- **Evidência**: ausência de chamadas de rede.

### C8 — Skeletons estáticos (sem shimmer animado)
- **Requisito**: Em `MessageList.jsx`, substituir `SkeletonStack` com `animate-shimmer` por placeholders com dimensões exatas e cor estática (`bg-surface2/40` ou similar), sem animação. Manter layout estável.
- **Verificação**: grep por `animate-shimmer` em MessageList.jsx (deve sumir ou ficar condicional) + presença de divs com width/height fixos.
- **Evidência**: estrutura de divs com classes estáticas.

### C9 — `aspect-ratio` em imagens do chat (zero CLS)
- **Requisito**: Em `MessageBubble.jsx`, quando renderizar uma imagem única (`images.length === 1` ou `attachment`), aplicar `aspect-ratio` via style usando as dimensões do attachment (se conhecidas) ou fallback `16/9`.
- **Verificação**: grep por `aspect-ratio` em MessageBubble.jsx.
- **Evidência**: style inline `aspectRatio: '${w}/${h}'` ou fallback.

### C10 — `prefers-reduced-motion` nos componentes de voz
- **Requisito**: Confirmar que `useReducedMotion()` está aplicado nas animações em `VoiceRoomView.jsx`, `VoiceControlDock.jsx`, `VoiceRoomHeader.jsx`, `ScreenSharePicker.jsx`.
- **Verificação**: grep por `useReducedMotion` em todos esses arquivos.
- **Evidência**: imports presentes e uso efetivo nas variants.

### C11 — Motion presets 120-220ms
- **Requisito**: Auditar `src/shared/motion/presets.js` e ajustar para `fast: 0.12, base: 0.18, slow: 0.22`. Reduzir qualquer duração > 220ms em `Motion.jsx`, `ModalShell.jsx`, `Appear.jsx` que ainda existam.
- **Verificação**: grep por `duration:` com valores > 0.22.
- **Evidência**: presets com durações ≤ 220ms.

---

## Invariantes

- **I1**: `npx vite build` exit 0, sem novos warnings.
- **I2**: `git diff package.json` vazio.
- **I3**: Chaves `voicecraft:chat:*`, `voicecraft:l1:*`, e store IndexedDB `outbox` em `voicecraft_chat_db` permanecem funcionais.
- **I4**: Fases 1-3 preservadas (BootGate bifurcado, marks voice:*, outbox dispatcher, L1 snapshot).
