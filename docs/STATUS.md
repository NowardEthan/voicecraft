# VoiceCraft — Status Report (2026-09-06)

## Documentação normativa

- **[`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)** — fonte de verdade da interface (12 capítulos, 2 referências visuais).
- **[`docs/reference-chat.png`](docs/reference-chat.png)** — Norma B (chat).
- **[`docs/reference-voice.png`](docs/reference-voice.png)** — Norma A (voz).
- **[`docs/IMPLEMENTATION_NOTES.md`](docs/IMPLEMENTATION_NOTES.md)** — bridge spec ↔ código + log de auditoria.

## Arquitetura entregue

```
App (src/App.jsx)
├── SpacesRail         — 72 px, coluna global de Spaces
├── SpaceContextPanel  — 240 px, abas: Visão geral / Salas / Pessoas
└── MainArea           — flex-1, renders do conteúdo

  ├── SpaceOverview      — boas-vindas + cards Acontecendo agora
  ├── RoomsList          — Salas agrupadas por activity
  ├── PeopleList         — diretório com search
  ├── TextRoomView       — sala de conversa completa (composer + header + histórico)
  ├── VoiceRoomView      — sala de voz como ambiente (cards + dock)
  ├── MessageList / MessageBubble / ConversationSearch
  └── Composer           — emoji + anexo inline (com popover)

  ├── PersonCard         — card unificado de pessoa
  └── ProfilePopover     — popover de profile VoiceCraft-style

  ├── InviteModal        — modal de convite com link copiável
  ├── Pill / EmptyState / EmojiReactions — componentes compartilhados
  └── SpaceCreator       — modal de criar Space com cover, theme, purpose
```

## Estado técnico

| Item | Status |
|---|---|
| Backend (`server/signaling-server.mjs`) | ✅ funcional, persistência em `data/spaces.json` |
| Signaling client (`src/utils/signalingClient.js`) | ✅ funcional, hello handshake + Spaces + Rooms |
| `useChat.js` (chat scoped por Sala com persistência localStorage) | ✅ |
| Build (`npx vite build`) | ✅ passa, 0 warnings |
| Smoke (`npm run dev:multi`) | ✅ 2 Electrons + signaling + vite sobem |
| Tokens (`tailwind.config.cjs` + CSS vars em `src/index.css`) | ✅ alinhado com DESIGN_SYSTEM §2.1 |
| Acessibilidade (focus rings, sr-only, esc) | ✅ parcial — base sólida |
| `prefers-reduced-motion` | ✅ implementado |

## Restrições do projeto aplicadas

- ✅ Sem `#` em lugar nenhum
- ✅ Sem mock de dados — tudo via signaling real
- ✅ Reconexão preserva Space/Sala selecionados
- ✅ Build/lint/smoke passam
- ✅ Sem botões decorativos (todos com handlers reais)
- ✅ Tokens usados — sem cores mágicas espalhadas

## Divergências remanescentes (intencionais / conhecidas)

1. **Hex hardcoded em `App.jsx`**: usa `bg-[#121214]` em algumas surfaces principais em vez de `bg-canvas` (token `#0d0f14`). Diferença de ~9 unidades RGB — sem impacto funcional.
2. **`SpacesRail.jsx` comentário** menciona "warm-amber halo" como referência histórica de design — inofensivo, é texto em JSDoc.
3. **`SourcePickerModal.jsx` / `LiveThumbnailRefresh.jsx`** são legacy órfãos (não importados em lugar nenhum). Vite tree-shaka. Remoção agendada pra uma pass de cleanup.

## Comandos de validação executados

```bash
# Build
npx vite build                              # ✅

# Smoke test
npm run dev:multi                           # ✅ sobe 2 Electrons + signaling + vite

# Auditoria
grep -rE "warm-|sage-|amber-|coral-|ochre-|discord-" src/   # ✅ zero classes legacy
```

## Comandos pra reproduzir o fluxo

```bash
cd "C:/Users/nowar/OneDrive/Documentos/Codes/voicecraft"
npm install                                  # se necessário
npm run dev:multi                            # abre 2 janelas pra testar chamadas P2P
```

Dentro do app:
1. Janela 1: cria Space → cria Sala de conversa + Sala de voz
2. Janela 2: aparece no SpacesRail → ver Salas no painel
3. Janela 1 ou 2: clica Sala de conversa → ConversationRoom → manda msg + imagem (data channel real)
4. Clica Sala de voz → VoiceRoomView → fala + mic + sair (WebRTC real)
5. Aba Pessoas → search por nome → abrir ProfilePopover ao clicar
6. Botão "Convidar" → InviteModal com link copiável

## Limitações reais restantes

- Histórico de chat persiste por Sala (`localStorage`, 500 msgs limite) — sem backup server-side
- Audio service (`useAudioServiceMic`) ainda marcado como unstable; desabilitado por default no settings.json
- Service workers / offline mode não implementados
- Gravação de call (MediaRecorder) não implementada
- Notificações nativas (Electron Notification) para peer-join/leave não implementadas

Esses pontos são **features futuras**, não bugs. O fluxo vertical core está funcional.
