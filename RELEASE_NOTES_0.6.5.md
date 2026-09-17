# Voice 0.6.5 — Auto-update sem UAC

**Data de release:** 2026-09-17  
**Bump:** `0.6.4 → 0.6.5` (patch — UAC no auto-update)

---

## 🐛 Problema

Após o download do update, o instalador NSIS disparava **prompt de UAC** ("Permitir que este app faça alterações no seu dispositivo?") mesmo com `perMachine: false`. Isso acontece porque o `electron-builder` gera um instalador NSIS cujo helper `elevate.exe` força elevação admin para fechar o processo do VoiceCraft antes de sobrescrever arquivos em uso.

## 🔧 Fix

- **`package.json.build.nsis`**:
  - `oneClick: false → true` (instalador unattended, sem wizard).
  - Removido `allowToChangeInstallationDirectory` (não é necessário em oneClick).
- **`build/installer.nsh`** (novo) — comentários explicando o setup.
- **Electron-builder** com `oneClick=true perMachine=false` instala em `%LocalAppData%\Programs\VoiceCraft\` **sem UAC**.

## ✅ Como testar

1. **0.6.5 instala a 0.6.5 sem prompt**: ao auto-update, o instalador roda em `/S` em background e sobrescreve arquivos em `%LocalAppData%` (per-user, sem privilégios admin).
2. **App reabre sozinho**: nosso `app.relaunch()` em `electron/main.js` dispara 12s depois.
3. **Sem mais prompt de admin**: a tela de "Permitir acesso" não deve mais aparecer.

Se o seu Voice já pediu admin na 0.6.4 e ficou travado:
- Abra o **Gerenciador de Tarefas** (`Ctrl+Shift+Esc`) → Procure por `VoiceCraft Setup` ou `nsis` → **Finalizar Tarefa**.
- Abra o app manualmente (ícone do Menu Iniciar).
- Aguarde o polling (30 min) ou force manualmente em **Configurações → Aplicativo → Verificar atualizações**.
