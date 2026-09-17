# Voice 0.6.6 — Rebrand final + taskkill pré-install

**Data de release:** 2026-09-17  
**Bump:** `0.6.5 → 0.6.6` (patch — rebrand textual + fix do "Falha ao desinstalar")

---

## 🎨 Rebrand "VoiceCraft" → "Voice"

- Todos os textos visíveis foram atualizados:
  - `package.json productName` ainda é "VoiceCraft" (mantido para compatibilidade do binário `.exe` entre releases — o NSIS não consegue renomear binário em uso durante upgrade).
  - `<title>` do `index.html` agora é "Voice".
  - `<h2>` do `HomeNavPanel` agora é "Voice".
  - TitleBar do app agora exibe "Voice".
  - Comentários JSDoc, README, `tailwind.config.cjs`, scripts de build do C++, etc.
- **Não foi renomeado** (decisão de compat):
  - `appId: "com.voicecraft.app"` (Windows installer key — mudança quebra upgrade).
  - Nome do binário `VoiceCraft.exe` (rename quebra NSIS upgrade in-place).
  - Caminhos do Firebase Storage: `voicecraft/covers/`, `voicecraft/avatars/`, etc.
  - Chaves de `localStorage`: `voicecraft:l1:`, `voicecraft:chat:`, `voicecraft:settings`.

## 🐛 Fix do "Falha ao desinstalar os arquivos do aplicativo antigo"

Na 0.6.5, alguns usuários viram o instalador NSIS falhar com:

```
Falha ao desinstalar os arquivos do aplicativo antigo.
Por favor, tente iniciar o instalador novamente.
```

**Causa**: `VoiceCraft.exe` ou `voicecraft-audio.exe` ainda em execução segurando handles nos arquivos que o instalador tenta sobrescrever. O instalador não conseguia fechar o processo (perMachine=false) e abortava.

**Fix**: antes de spawn o instalador, `electron/main.js` chama:

```js
taskkill.exe /F /IM VoiceCraft.exe /T
```

em background (`detached: true`, `stdio: 'ignore'`) para matar qualquer processo Voice remanescente (e seus filhos via `/T`) antes do install. Aguarda 1.5s para o Windows liberar os file handles, depois spawn o instalador.

## ✅ Como testar

1. **Quem está em 0.6.5 com o "Falha ao desinstalar"**: a 0.6.6 vai spawn `taskkill /F /IM VoiceCraft.exe /T` automaticamente antes do install. Não deve mais pedir reinstalação manual.
2. **Quem está em 0.5.x → 0.6.x**: o upgrade agora termina o "loop de reload" que aparecia na 0.6.5 (quando o instalador NSIS matava o app e o `app.relaunch()` reabria o binário antigo parcialmente escrito).
3. **Texto na UI**: abrir o app e conferir TitleBar (topo da janela), HomeNavPanel (sidebar), e título da janela.

## 📌 Próximo passo (major)

Numa release **1.0.0** (major), vou:
- Mudar `appId` para `com.voice.app`.
- Renomear binário para `Voice.exe`.
- Mudar caminhos do Firebase Storage.

Quem estiver na 0.6.x vai precisar **desinstalar manualmente** e instalar a 1.0.0 limpa. Aviso será dado no app via banner antes da major release.
