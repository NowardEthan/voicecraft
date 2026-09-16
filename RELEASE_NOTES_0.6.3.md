# Voice 0.6.3 — 3 bugfixes da 0.6.2

**Data de release:** 2026-09-16  
**Bump:** `0.6.2 → 0.6.3` (patch — bugfixes)

---

## 🐛 Correções

### 1. Composer respondia lentamente após abrir o app
**Sintoma**: ao abrir uma sala de chat, o input do Composer ficava visualmente travado por alguns instantes após cold start ou auto-update.
**Causa**: `useChat.js` definia `setReady(false)` no effect de seed por `roomKey`, fazendo o Composer mostrar "Reconnecting…" brevemente.
**Fix**: removido `setReady(false)` do seed inicial. O `connectionState` já reflete o estado real do canal P2P.

### 2. Auto-update instalava, mas o app não reabria sozinho
**Sintoma**: ao terminar a instalação silenciosa (`/S`), o app ficava sem janela — usuário tinha que clicar manualmente no ícone do Menu Iniciar.
**Causa**: NSIS flag `/norestart` impedia o relaunch automático, e não havia fallback para reabrir via `app.relaunch()`.
**Fix**:
- Trocado `/norestart` → **`/S /restartapplications`** (NSIS pede ao instalador para reabrir o app ao terminar).
- Janela que estava em tray-hidden é forçada a `restore()` + `show()` antes do `webContents.reload()`.
- **Fallback de segurança**: se a janela/renderer estiver completamente morta após o install, `app.relaunch({ args: process.argv.slice(1) })` + `app.exit(0)` garante que o app volta.

### 3. Chat com cards de regras/anúncios scrollava para o topo a cada like/edit
**Sintoma**: ao dar like, editar ou reagir em uma mensagem numa sala com cards de regras/anúncios no topo, a tela pulava bruscamente para o início.
**Causa**: `TextRoomView.jsx` passava JSX inline como prop `listHeader` para `MessageList`. Como esse JSX é recriado a cada render do `TextRoomView` (a cada like/edit), a referência do `listHeader` mudava, disparando o effect em `MessageList.jsx` que reseta o scroll para `0`.
**Fix**: trocada a dependência do effect de `[roomKey, listHeader]` para `[roomKey, hasListHeader]` (booleano derivado). O effect só dispara quando o usuário muda de sala, não a cada re-render.

---

## ✅ Como testar

1. **Bug 2 (auto-update)**: instale a 0.6.3 sobre a 0.6.2 ou 0.6.1. Ao auto-update completar, **o app deve reabrir sozinho** com a nova versão.
2. **Bug 3 (flick)**: abra uma sala de chat que tenha regras/anúncios ativos. Dê like numa mensagem. **O scroll deve permanecer estável**.
3. **Bug 1 (Composer)**: abra o app pela primeira vez. O Composer deve estar **imediatamente utilizável**, sem flash "Reconnecting…".
