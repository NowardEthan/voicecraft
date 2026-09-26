# Voice 0.7.0 — Volta ao auto-update clássico (Discord/Steam)

**Data de release:** 2026-09-25  
**Bump:** `0.6.9 → 0.7.0` (minor — mudança de comportamento no update)

---

## 🔄 Revert: auto-update clássico

A 0.6.6–0.6.9 introduziu um fluxo experimental de auto-update silencioso com `taskkill + app.relaunch` em background. Na prática, esse fluxo:

- Causava crash na janela do app após a instalação (Windows ainda estava sobrescrevendo arquivos).
- Às vezes entrava em loop de update infinito (taskkill matava o próprio instalador NSIS antes de terminar).
- O usuário não conseguia simplesmente abrir o app atualizado.

**O que foi revertido**:
- `runSilentInstaller` agora chama direto `electron-updater.quitAndInstall(false, true)` — sem taskkill, sem app.relaunch manual, sem marker files, sem polling de 30 min.
- `shouldSuppressUpdater` removido.
- O loop de update no `runCheck` removido.
- O `audio-service:start-loopback-system` IPC também removido (voltamos ao simples).

## ✋ O que NÃO existe mais

- Sem polling de 30 min em background.
- Sem silent install automático.
- Sem auto-restart depois do update.

O usuário precisa:
1. Abrir o app.
2. Clicar **"Verificar atualizações"** (ou esperar toast se o app já tinha detectado na sessão anterior).
3. Baixar a versão.
4. Clicar **"Reiniciar e atualizar"** (toast verde).
5. O app fecha, NSIS roda, app reabre.

É o **fluxo do Discord/Steam** — simples, manual, sem race conditions.

## 🎙️ A nova opção de áudio fica para a próxima major

A opção "Tela inteira com áudio (sem eco da call)" do `ScreenSharePicker` permanece no UI (foi commitada na 0.6.9), mas como o `voicecraft-audio.exe` ainda não foi recompilado com `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE`, a opção dá erro `"Loopback only supported on Windows"`. Vou rebuildar o binário e liberar a feature na 1.0.0.

## ✅ Compatibilidade

- Quem está em **0.5.0 → 0.7.0**: precisa atualizar manualmente baixando o instalador do GitHub release page e rodando o `.exe`.
- Quem está em **0.6.x → 0.7.0**: o auto-update via electron-updater continua funcionando (era o que já fazia). As versões 0.6.x só ficavam confusas pelos loops.
- Quem está em **0.7.0 → futuras**: vai detectar novos updates via `checkForUpdates` (manual) e via initial checks do `electron-updater`.

## 🐛 Known issue (presente na 0.6.0 também)

Quando o app está em **screen share + audio de sistema** (loopback de Windows), o áudio dos outros participantes da call **ainda pode ecoar** porque o WASAPI loopback captura tudo o que sai nos alto-falantes. Isso é resolvido pela nova feature "Tela inteira com áudio (sem eco da call)" quando o `voicecraft-audio.exe` for rebuildado.

Até lá, recomendo usar **fones de ouvido** durante screen share de sistema.
