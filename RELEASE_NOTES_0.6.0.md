# Voice 0.6.0 — Electron 44 + eco do screen share resolvido

**Data de release:** 2026-09-16  
**Bump:** `0.5.0 → 0.6.0` (minor — upgrade significativo de plataforma)

---

## 🎉 Highlights

Esta release entrega um **upgrade completo da plataforma Electron** (32 → 44) e ativa o **`restrictOwnAudio`** do Chromium, que **resolve definitivamente o eco no compartilhamento de tela** — o terceiro item crítico da lista reportado pelo usuário.

## 🚀 Upgrade de plataforma

### Electron 32.3.3 → 44.4.0 (Chromium 152, Node 24.21)

**Decisão:** não usamos `v45.0.0-alpha.7` (Chromium 155) porque é alpha. A versão **v44.4.0 stable** já entrega todos os recursos necessários (incluindo `restrictOwnAudio`).

- **`electron`**: `^32.0.0` → **`44.4.0`**
- **`electron-builder`**: `^25.0.0` → **`^26.16.1`** (necessário para empacotar Electron 44)
- **`vite-plugin-electron`**: `^0.28.0` → **`^1.1.2`** (API mudou completamente)
- **`vite-plugin-electron-renderer`**: `^0.14.5` → **`^1.0.0`**

### Mudanças no `vite.config.js`

API nova do `vite-plugin-electron@1.x`:
- Antes: `electron({ main: {...}, preload: {...}, renderer: {...} })`
- Agora: `electron({ main: {...}, preload: {...}, renderer: {...} })` via `vite-plugin-electron/simple` (mesma forma, import mudou).

Output agora é separado:
- `dist-electron/main.js` (main process)
- `dist-electron/preload.js` (preload)
- `dist/` (renderer com `index.html`)

## 🎤 Eco de screen share RESOLVIDO (`restrictOwnAudio`)

Esta era a causa #1 de "perda de áudio dos outros participantes" no screen share.

**Antes (Electron 32):**
- Captura de áudio de sistema via `chromeMediaSource: 'desktop'` em loopback.
- Esse loopback pegava **TUDO** que saía na placa de som — incluindo a voz dos outros participantes reproduzida pelos auto-falantes do usuário.
- Resultado: loop de eco entre `voz alheia → placa de som → loopback → envio → voz alheia de volta`.

**Agora (Electron 44+ com `restrictOwnAudio`):**
- `electron/main.js` registra `session.defaultSession.setDisplayMediaRequestHandler((req, cb) => cb({ video, audio: 'loopback' }))` — Chromium agora sabe que pode capturar loopback.
- `src/hooks/useScreenShare.js` migra de `getUserMedia({ mandatory: chromeMediaSource: 'desktop' })` para **`getDisplayMedia({ video, audio: { restrictOwnAudio: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`**.
- O Chromium 152 **remove automaticamente** o áudio produzido pelo próprio VoiceCraft do loopback, mantendo o áudio de jogos/YouTube e removendo o eco digital.

**Legado preservado:** mantivemos o fallback `chromeMediaSource: 'desktop'` para ambientes onde `getDisplayMedia` é bloqueado.

### Por que `echoCancellation: false`?

AEC (Acoustic Echo Cancellation) é desenhado para **microfone** (entrada). Aplicá-la ao **loopback de áudio** destrói música, ambiência, efeitos sonoros sustentados. O loopback já vem filtrado pelo `restrictOwnAudio`, então não precisa de AEC.

## 🔧 Mudanças no instalador

- Tamanho do instalador subiu para **194 MB** (era 154 MB) devido ao Chromium 152 + Node 24.21.
- `signAndEditExecutable: false` continua removido (da 0.5.1) → ícones embutidos corretamente no PE binário.
- Compatibilidade: Windows x64, Windows 11+.
- Requisito: Windows 10 1909+ ou Windows 11.

## 📋 Itens da lista do usuário — Status

| # | Item | Status na 0.6.0 |
|---|---|---|
| 1 | Ícone do app não aparece no Menu Iniciar | ✅ Corrigido na 0.5.1 (`signAndEditExecutable: false` removido) |
| 2 | Auto-update estilo Steam (in-app, sem fechar) | ✅ Corrigido na 0.5.1 (`runSilentInstaller` com `/S /norestart`) |
| 3 | Eco no screen share / perda de áudio dos outros | ✅ **RESOLVIDO NESTA RELEASE** via `restrictOwnAudio` (Electron 44) |

## ⚠️ Notas para usuários que migram de 0.5.x

- A primeira instalação sobrescreve a 0.5.x automaticamente (auto-update Steam-style).
- O cache de imagens e o L1 snapshot são preservados em `%APPDATA%/VoiceCraft`.
- A outbox persistente (IndexedDB) é preservada.
- **Possível aviso do SmartScreen** na primeira instalação (sem assinatura digital — esperado).

## 🔧 Compatibilidade

- ✅ Não exige reinstall manual (auto-update funciona).
- ✅ LiveKit Client 2.22.3 compatível com Chromium 152.
- ✅ Firebase SDK 12.18.0 compatível.
- ✅ voicecraft-audio.exe (binário WASAPI standalone) **não precisa rebuild** (não depende do Node ABI).
- ✅ Mantém compatibilidade com Windows 10/11 x64.

## 📦 Instalação

Baixe `VoiceCraft Setup 0.6.0.exe` da [release](https://github.com/NowardEthan/voicecraft/releases/tag/v0.6.0) e instale sobre a versão anterior — instalador NSIS preserva os dados em `%APPDATA%/VoiceCraft`.

Se está na 0.5.0 instalada, o auto-update deve disparar sozinho em ~6s ao abrir o app, baixar 0.6.0, instalar silenciosamente e recarregar o renderer.
