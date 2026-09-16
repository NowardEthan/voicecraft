# Contrato de Critérios — Voice 0.5.1 (hotfix pós-release)

Status: **CONGELADO** (`criterios.congelado = true`).

---

## C1 — Ícones corretos no Windows

- **Requisito**: `package.json` deve **NÃO** ter `build.win.signAndEditExecutable: false`. Sem isso, o `electron-builder` não injeta o `.ico` no PE binário do `.exe` (causa #1 dos ícones faltando no Menu Iniciar e Aplicativos & Recursos).
- **Verificação**: `grep -n "signAndEditExecutable" package.json` deve retornar 0 ocorrências.
- **Evidência**: Build NSIS concluído sem erro; após instalar, ícone aparece no Menu Iniciar e em Aplicativos & Recursos.

## C2 — Auto-update estilo Steam (totalmente automático, in-app)

- **Requisito**: Implementar auto-update com download + instalação **dentro do app**, sem fechar a janela. Estilo Steam quando configurado para auto-update:
  - Detecta update no boot (`update_available`).
  - Baixa em background (`autoDownload: true`).
  - Quando o download termina, instala sem perguntar.
  - **Não fecha** o app — apenas reinicia o renderer (a nova versão do JS entra em vigor na próxima navegação/mount, mas a janela Electron continua aberta).
  - Mostra um toast discreto "Atualizando para 0.5.1..." enquanto roda, "Atualizado para 0.5.1" ao terminar.

- **Implementação técnica**:
  - O `electron-updater` por padrão fecha o app para instalar (porque arquivos PE não podem ser sobrescritos em uso). A alternativa é **instalar apenas arquivos do `app.asar`** que são extraídos em runtime pelo Electron — esses PODEM ser sobrescritos sem fechar.
  - Para o Voice: usar `autoUpdater.autoInstallOnAppQuit = false` (não fechar) + instalar manualmente apenas os arquivos `.asar` via `app.getPath('exe')` + replace + reload.
  - **OU** usar o approach mais simples: criar um **instalador "stub" dentro do app** (tipo Steam) — uma `BrowserWindow` secundária que abre o instalador NSIS embutido com `/S` em background, sem fechar a janela principal.
  - Como o `quitAndInstall()` do electron-updater SEMPRE fecha o app, a opção realista é:
    - Usar `electron-updater` para detectar e baixar.
    - Quando baixar, abrir um BrowserWindow **filho** (modal fullscreen bloqueante) com `<webview>` ou `webContents` apontando para o instalador NSIS auto-extraído.
    - Mostrar progresso em tempo real via IPC.
    - Quando o instalador termina (exit code 0), fechar a janela modal e mostrar toast "Atualizado. Reiniciando em 5s...".
    - Chamar `app.quit()` após um delay (10s) para dar tempo ao usuário de salvar trabalho.
- **Verificação**: 
  - `electron/main.js` deve ter `autoUpdater.autoDownload = true` (manter).
  - `autoUpdater.autoInstallOnAppQuit = false` (mudar).
  - Novo handler IPC `updater:installInApp` que abre o instalador em BrowserWindow filha e mostra progresso.
  - `UpdateToast.jsx` mostra estado `installing` com progresso (0-100%).
- **Evidência**: 
  - Update baixa automaticamente no boot.
  - Quando download termina, modal in-app aparece com progresso.
  - Quando install termina, modal fecha e toast de sucesso aparece.
  - Janela principal do Voice **nunca fecha** durante o update.
  - Após 10s de toast, app faz `app.quit()`.

## C3 — Eco: remover ducking indevido + aviso de fones

- **Requisito**: Em `src/features/rooms/views/voice/useLiveKitRoom.js`, a lógica de `duckMic` que zera o volume dos microfones remotos quando screen-audio está ativo deve ser **removida**.
- Comportamento esperado: TODOS os microfones remotos continuam tocando normalmente quando alguém compartilha tela (mesmo sem fones).
- Em paralelo, adicionar **aviso visual** no `ScreenSharePicker.jsx` recomendando fones de ouvido para evitar loopback acústico.
- **Verificação**: grep por `duckMic` no arquivo não deve encontrar a atribuição (apenas referências em comentários/documentação).
- **Evidência**: `audio.volume` apenas depende de `isDeafenedRef.current`. Aviso "Recomendamos fones de ouvido" aparece no picker quando screen audio é ativado.

## Invariantes

- **I1**: `npx vite build` exit 0.
- **I2**: `npx electron-builder --publish never` (build NSIS local) conclui sem erro.
- **I3**: Working tree commit-friendly (sem arquivos não-rastreados críticos).
- **I4**: Phase 0-5 (Fases do loop de performance) preservadas.

## Não-objetivos

- Upgrade Electron 32 → 34+ (para `restrictOwnAudio`).
- Modificar `voicecraft-audio.exe` C++ para WASAPI exclude PID.
- Migração para IndexedDB do cache de imagens.
- Nova release numerada (`0.5.1` ou patch direto).
