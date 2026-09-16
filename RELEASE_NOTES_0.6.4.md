# Voice 0.6.4 — Auto-update: polling + relaunch robusto

**Data de release:** 2026-09-17  
**Bump:** `0.6.3 → 0.6.4` (patch — bugfixes do auto-update)

---

## 🐛 Problemas reportados pelo usuário (0.6.3)

1. **Auto-update só disparava no boot** ou via clique manual em "Verificar atualizações". Não tinha polling regular.
2. **Após o update, NSIS pediu permissão de admin** (UAC) e o app **não reabriu sozinho**. O usuário teve que abrir manualmente.

## 🔧 Fixes aplicados

### 1. Polling regular a cada 30 minutos
- Novo `setInterval` que roda `updater.checkForUpdates()` a cada **30 minutos** quando o app está visível e não minimizado.
- Pula automaticamente se a janela estiver em tray-hidden ou minimizada (evita wake de timers em background).
- Timer é re-armado em `browser-window-created` (caso a janela seja recriada).
- **Antes**: 3 checks no boot (6s, 45s, 2.5s na did-finish-load).
- **Agora**: checks no boot + polling contínuo a cada 30 min enquanto o app está aberto.

### 2. Self-relaunch após install
- Removido `/restartapplications` da chamada NSIS (era o que disparava UAC em algumas configurações Windows mesmo com `perMachine: false`).
- Trocado por `/S /D=<dir>` — silent install no mesmo diretório onde o Voice já está instalado.
- Adicionado fallback `app.relaunch()` + `app.exit(0)` que dispara **12s depois** do spawn do instalador, dando tempo suficiente para o NSIS sobrescrever os arquivos.
- Janela que estava em tray-hidden é forçada a `restore()` + `show()` antes do reload (mantém o comportamento da 0.6.3).

### 3. CI workflow robusto
- Adicionado `timeout-minutes: 20` no job (a 0.6.3 falhou silenciosamente o upload do .exe de 194MB por causa de timeout implícito).
- Adicionado step `Verify release assets` que falha o CI se o `.exe`, `latest.yml` ou `.blockmap` estiverem faltando na release.

## ✅ Como testar

1. **Polling**: deixar a 0.6.3 aberta por 30 min. O app deve baixar e mostrar o toast de update sem precisar abrir Configurações.
2. **Self-relaunch**: clicar "Verificar atualizações" (ou aguardar polling). O NSIS roda sem prompt de admin e o app **reabre sozinho** em ~12s com a nova versão.
3. **CI**: se a próxima release sair com assets faltando, o CI vai falhar e notificar.
