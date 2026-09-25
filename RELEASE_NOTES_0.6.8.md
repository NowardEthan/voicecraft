# Voice 0.6.8 — Fix do loop de auto-update

**Data de release:** 2026-09-25  
**Bump:** `0.6.7 → 0.6.8` (patch — fix crítico do auto-update)

---

## 🐛 O bug

Na 0.6.6 e 0.6.7, alguns usuários viram o app **travar em loop** durante o auto-update:

1. App detecta nova versão (0.6.7).
2. `taskkill.exe /F /IM VoiceCraft.exe /T` mata o Voice antigo.
3. NSIS entra em execução.
4. `app.relaunch()` em 12s reabre o app.
5. App reabre com binário antigo (NSIS não tinha terminado ainda).
6. Detecta 0.6.7 de novo → repete o ciclo.

### Causa raiz

`taskkill /F /IM /T` (recursivo) estava **também matando o instalador NSIS** recém-spawnado (que estava no mesmo job do Windows). O NSIS nunca terminava. Quando o `app.relaunch()` rodava, abria o binário antigo que detectava 0.6.7 de novo.

Adicionalmente, o `webContents.reload()` em 5s estava competindo com o instalador pelos arquivos.

## 🔧 Fix

1. **taskkill agora é `spawnSync`** (não `spawn` + `detached`): garante que taskkill termina **antes** do instalador ser spawnado, e não mata o instalador.
2. **Update-flow marker** (`<userData>/update-in-progress`): arquivo persistente escrito antes do install, contendo versão + timestamp. O app novo, no startup, **deleta** esse marker se sua versão bater; se for stale (>5 min), também deleta e segue; só suprime o auto-update se for recente.
3. **`shouldSuppressUpdater()`** chamado em `runCheck()` e no polling de 30 min: se marker recente existe, o app **não re-verifica** updates (quebra o loop).
4. **Removido `webContents.reload()` em 5s**: o renderer não compete mais com o instalador.

## ✅ Como testar

Quem estava no loop de update:
- A 0.6.8 vai ser a **próxima versão detectada** (~30 min de polling).
- Quando o app detecta a 0.6.8:
  - Cria o marker.
  - Mata VoiceCraft.exe (sync, sem /T para NSIS).
  - NSIS instala em `/S` em background.
  - Aguarda 12s.
  - `app.relaunch()` reabre a 0.6.8 nova.
  - 0.6.8 nova detecta o marker → vê que sua versão é 0.6.8 → deleta marker → segue normal.
- **Sem loop**. App fica na 0.6.8 limpa.

Quem já está na 0.6.8 manualmente:
- Sem efeito colateral — a lógica só atua quando há marker ativo.
