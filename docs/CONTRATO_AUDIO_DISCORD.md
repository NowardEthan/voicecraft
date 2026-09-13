# Contrato de Aceite — Fase 2 (Captura de áudio estilo Discord por PID)

**Status:** CONGELADO (`criterios.congelado: true`)
**Data:** 2026-09-13
**Release de referência (preservar):** 0.2.2
**Escopo:** Captura de áudio por app (PID) no Windows, estilo Discord Applications,
via WASAPI per-process loopback, eliminando o eco da voz da call quando o usuário
compartilha tela com áudio do sistema.

**Localização do código:**
- `audio-service/src/loopback_wasapi.cpp` (novo, módulo C++)
- `audio-service/src/main.cpp` (extensão para novos comandos)
- `electron/main.js` (novos handlers IPC + header `audio:frame`)
- `electron/preload.js` (extensão `audioService.listProcesses/startLoopback/stopLoopback`)
- `src/hooks/useAppLoopbackAudio.js` (novo hook renderer)
- `src/features/rooms/views/voice/components/ScreenSharePicker.jsx` (UI radio group + combobox)
- `src/features/rooms/views/voice/useLiveKitRoom.js` (integração `Track.Source.ScreenShareAudio`)

---

## 0. Resumo executivo (TL;DR)

| Camada | O que muda | Onde |
|---|---|---|
| Protocolo C++/IPC | 3 novos comandos (`list-processes`, `start-loopback`, `stop-loopback`); header `audio:frame` recebe `{type: 'mic' \| 'loopback'}` | `audio-service/src/main.cpp`, `audio-service/src/loopback_wasapi.cpp` |
| WASAPI per-app | `ActivateAudioInterfaceAsync` com `AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS { TargetProcessId, ProcessLoopbackMode: INCLUDE }` — Windows 10 20H1+ (build 18941) | novo `loopback_wasapi.cpp` |
| Electron main | 3 handlers IPC + reenvio do header `type` no `audio:frame` | `electron/main.js` |
| Preload | Expõe `audioService.{listProcesses, startLoopback, stopLoopback}`; `onFrame(cb)` recebe `{type, floats}` | `electron/preload.js` |
| Renderer hook | `useAppLoopbackAudio({ processId, enabled })` consome frames `type:'loopback'`, expõe `MediaStream` com track de áudio | novo `src/hooks/useAppLoopbackAudio.js` |
| UI | Radio group "Desligado / Sistema inteiro / Aplicativo específico" + combobox de processos (PID + nome + ícone) | `ScreenSharePicker.jsx` |
| Integração | `useLiveKitRoom` publica o track como `Track.Source.ScreenShareAudio`; fallback para `chromeMediaSource: 'desktop'` em erro | `useLiveKitRoom.js` |

---

## 1. Critérios de aceite (A1–A5 / B1–B6 / C1–C5 / D1–D9 — total 25)

Cada critério tem: **requisito** + **método de verificação** + **evidência necessária para APROVADO**.

### 1.1 Etapa A — IPC + protocolo

#### A1 — IPC `audio-service:list-processes` retorna `Array<{pid, name, icon}>`
**Requisito:** Quando o renderer chama `window.electronAPI.audioService.listProcesses()`,
o main process envia comando `{"type":"list-processes"}\n` ao C++ via stdin,
recebe na stderr `{"type":"process-list","processes":[{"pid":<int>,"name":"<str>","icon":"<base64-32x32-png>"}]}`,
encaminha como resposta ao `invoke`. **Apenas** processos com sessão de áudio ativa
no momento da enumeração (`IAudioSessionManager2.EnumAudioSessions` retorna
sessions não-mute E não-unmuted-since-snapshot) são listados.

**Propriedades verificáveis:**
- `processes` é um `Array` (não objeto, não `null`).
- Cada item tem `pid: number`, `name: string` (não-vazio), `icon: string` (base64 PNG 32×32, ou string vazia se ícone indisponível).
- `pid > 0` em todos os itens.
- Itens duplicados por PID são deduplicados (primeira ocorrência vence).
- Resposta inclui o próprio PID do VoiceCraft (útil como sanity check).
- Timeout de 2s: se o C++ não responder, main devolve `{ok:false, error: 'timeout'}` (não trava o renderer).

**Método:** Inspecionar resposta em `await window.electronAPI.audioService.listProcesses()` no console do Electron com um app de áudio tocando (ex.: `Spotify.exe`).

**Evidência APROVADO:**
- Log mostra array com Spotify (pid ativo), Edge (se áudio tocando), etc.
- Sem duplicatas; todos `pid` são `typeof === 'number'`.

---

#### A2 — IPC `audio-service:start-loopback` aceita `{processId}` e devolve `{sessionId}`
**Requisito:** Renderer chama `startLoopback({processId: 1234})`. Main envia
`{"type":"start-loopback","processId":1234}\n` ao C++. C++ ativa a interface de
audio per-app e devolve stderr `{"type":"loopback-started","sessionId":"<uuid>"}`.
Main responde ao renderer com `{ok:true, sessionId: '<uuid>'}`.

**Propriedades verificáveis:**
- Erros são tipados: `E_ACCESSDENIED` → `{ok:false, error: 'access-denied'}`; PID inexistente → `{ok:false, error: 'pid-not-found'}`; WASAPI falhou → `{ok:false, error: 'wasapi-<hresult>'}`.
- `sessionId` é UUID v4 string (não-vazio, único por sessão ativa).
- Se já existe loopback para o mesmo PID, devolve o `sessionId` existente (idempotente).
- Comando não bloqueia: resposta volta ≤ 500ms em sucesso.

**Método:** Com Spotify tocando, invocar `await audioService.startLoopback({processId: <pid-do-spotify>})`; conferir retorno `{ok:true, sessionId}`.

**Evidência APROVADO:**
- Resposta contém `sessionId` string.
- Stderr do C++ mostra `{"type":"loopback-started","sessionId":"..."}`.
- Após o comando, frames `audio:frame` chegam com `type === 'loopback'`.

---

#### A3 — IPC `audio-service:stop-loopback` aceita `{sessionId}` e para captura
**Requisito:** Renderer chama `stopLoopback({sessionId: '<uuid>'})`. Main envia
`{"type":"stop-loopback","sessionId":"<uuid>"}\n` ao C++. C++ libera o `IAudioClient`,
`AudioCaptureClient` e o `IMMDevice` associado; responde stderr
`{"type":"loopback-stopped","sessionId":"<uuid>"}`. Main responde `{ok:true}`.

**Propriedades verificáveis:**
- Após `stop`, frames `audio:frame` com `type === 'loopback'` param de chegar.
- Idempotente: chamar `stop` em `sessionId` já parado devolve `{ok:true}` (sem erro).
- `sessionId` desconhecido devolve `{ok:false, error: 'unknown-session'}`.

**Método:** Iniciar loopback, conferir frames chegando; chamar stop; esperar 200ms; nenhum frame chega depois.

**Evidência APROVADO:**
- Antes do stop: contador de frames loopback cresce.
- Depois do stop: contador estabiliza em 0 (após 200ms de janela).
- Log do C++ mostra `loopback-stopped`.

---

#### A4 — Header `audio:frame` com `{type: 'mic' | 'loopback'}` no payload
**Requisito:** O evento IPC `audio:frame` (renderer-bound) passa a entregar
um objeto com `{type: 'mic' | 'loopback', floats: Float32Array}` em vez do
`Float32Array` cru atual. O tipo `'mic'` é usado para frames do microfone
(sistema atual); `'loopback'` para frames per-app.

**Propriedades verificáveis:**
- **Migração retrocompatível:** o payload **NÃO** é mais um `Uint8Array` cru
  (mudança breaking). Preload faz a conversão bytes → Float32Array e adiciona
  o `type`. O renderer recebe `cb({type, floats, sampleRate, channels})`.
- `sampleRate === 48000` e `channels === 1` (mono, mesma convenção do mic).
- Frames de fontes distintas são serializados pelo IPC corretamente (sem
  mistura de tipos em uma mesma sessão).

**Método:** Inspecionar callback `onFrame(({type, floats}) => ...)`. Confirmar
que antes da Etapa A frames vinham como `Float32Array` cru; depois vêm como
objeto com `type`.

**Evidência APROVADO:**
- Logs do hook `useAppLoopbackAudio` mostram `frame: type=loopback, len=4096`.
- Logs do hook `useAudioServiceMic` mostram `frame: type=mic, len=4096`.
- Nenhum renderer recebe `Float32Array` cru (todos recebem objeto).

---

#### A5 — Preload expõe `audioService.{listProcesses, startLoopback, stopLoopback}`
**Requisito:** `electron/preload.js` adiciona 3 métodos em `window.electronAPI.audioService`:
- `listProcesses(): Promise<{ok: true, processes: Array} | {ok: false, error: string}>`
- `startLoopback({processId}): Promise<{ok: true, sessionId} | {ok: false, error}>`
- `stopLoopback({sessionId}): Promise<{ok: true} | {ok: false, error}>`
- `onFrame(cb)`: assinatura do callback muda para `cb({type, floats, sampleRate, channels})`.

**Propriedades verificáveis:**
- Todos os 3 métodos são funções no preload.
- `onFrame` registra/remover listener corretamente (`removeListener` no cleanup).
- Nenhum método expõe tokens ou paths internos do Electron ao renderer.

**Método:** Inspecionar `window.electronAPI.audioService` no DevTools; conferir os 3 métodos novos.

**Evidência APROVADO:**
- `typeof window.electronAPI.audioService.listProcesses === 'function'`.
- `typeof window.electronAPI.audioService.startLoopback === 'function'`.
- `typeof window.electronAPI.audioService.stopLoopback === 'function'`.

---

### 1.2 Etapa B — C++ WASAPI per-process loopback

#### B1 — `voicecraft-audio.exe` compila com novo módulo `loopback_wasapi.cpp`
**Requisito:** `audio-service/CMakeLists.txt` lista `src/loopback_wasapi.cpp`
e `src/loopback_wasapi.h` no target. Comando
`cmake --build audio-service/build --config Release` produz
`audio-service/build/Release/voicecraft-audio.exe` sem erros nem warnings
do MSVC (nível `/W4`).

**Propriedades verificáveis:**
- Arquivo `loopback_wasapi.cpp` existe em `audio-service/src/`.
- Arquivo `loopback_wasapi.h` existe com declarações públicas.
- `voicecraft-audio.exe` é regenerado com timestamp posterior à adição do módulo.
- Tamanho do executável cresce entre 50–500 KB (código WASAPI extra).
- Vinculação contra `wasapi.lib`, `mfplat.lib`, `propsys.lib` (libs WASAPI padrão).

**Método:** Apagar `audio-service/build/`, rodar `build.bat`, verificar saída.

**Evidência APROVADO:**
- Build termina com `0 errors, 0 warnings` no stdout.
- `voicecraft-audio.exe` existe em `Release/`.

---

#### B2 — `loopback_wasapi.cpp` enumera sessões via `IAudioSessionManager2.EnumAudioSessions`
**Requisito:** Comando `list-processes` chama
`IAudioSessionManager2::EnumAudioSessions(eMultiplex)` e itera o enumerador;
para cada sessão coleta `IAudioSessionControl2::GetProcessId()` e
`IShellItem::GetDisplayName` (para nome amigável do app).

**Propriedades verificáveis:**
- Apenas sessões com `StateActive == AUDIO_SESSION_STATE_ACTIVE` são incluídas (não enumera sessões zombie).
- PID do VoiceCraft é detectado (sanity check de auto-inclusão).
- Nome do processo vem de `GetModuleFileNameExW` no PID (via OpenProcess + PSAPI) como fallback.
- Ícone: extrai 32×32 ícone via `SHDefExtractIcon` ou similar.

**Método:** Com Spotify tocando, rodar binário com `{"type":"list-processes"}\n` no stdin; conferir saída.

**Evidência APROVADO:**
- Lista inclui Spotify com nome correto.
- Lista inclui Edge se página de áudio ativa.
- Lista NÃO inclui processos sem sessão ativa (ex.: `notepad.exe`).

---

#### B3 — `loopback_wasapi.cpp` ativa loopback por PID via `ActivateAudioInterfaceAsync`
**Requisito:** Comando `start-loopback` faz:
1. `CoCreateInstance(CLSID_MMDeviceEnumerator, …)` para `IMMDeviceEnumerator`.
2. `deviceEnumerator->GetDeviceAudioEndpoint(eRender, eConsole, &defaultDevice)` para fallback, mas a chave é:
3. Definir `PROCESS_LOOPBACK_MODE` via `ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, IID_IAudioClient, …)` com parâmetros:
```cpp
AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS params = {};
params.TargetProcessId = (DWORD)pid;
params.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE;
```
4. Após `IActivateAudioInterfaceAsyncOperation::GetActivateResult`, usar
`IAudioClient::Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK, …)`
em modo loopback (`AUDCLNT_STREAMFLAGS_LOOPBACK` + `AUDCLNT_SHAREMODE_SHARED`),
`GetMixFormat`, `GetBufferSize`, `GetService(IID_IAudioCaptureClient, …)`.
5. `IAudioClient::Start()`.

**Propriedades verificáveis:**
- `params.TargetProcessId == pid` (não confunde com `GetCurrentProcessId`).
- `params.ProcessLoopbackMode == PROCESS_LOOPBACK_MODE_INCLUDE` (não EXCLUDE — Discord-style captura TUDO do app).
- Fallback: se `ActivateAudioInterfaceAsync` falhar com `AUDCLNT_E_WRONG_ENDPOINT_TYPE`, tenta endpoint default console com mesmo PID.
- HRESULTs são verificados e propagados como erro tipado (vide A2).

**Método:** Compilar com `NOMINMAX` + Windows SDK 10.0.19041 (ou superior — para o header `process.h` com `AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS`). Rodar com Spotify PID; conferir stderr `loopback-started`.

**Evidência APROVADO:**
- C++ emite `{"type":"loopback-started","sessionId":"<uuid>"}` em ≤ 500ms.
- Frames Float32 PCM chegam no stdout em ≤ 100ms (20ms frames a 48kHz/1ch = 960 samples/frame = 3840 bytes).
- Forma de onda captada bate com áudio do app (sanity check via `audacity` ou `ffmpeg` dump).

---

#### B4 — Frames PCM Float32 do loopback chegam no main via stdout pipe
**Requisito:** Mesmo padrão do mic: cada frame é prefixado por
`[4-byte LE uint32 frame_size_in_samples][frame_size * 4 bytes float32 LE PCM, mono]`
no stdout do C++. O Electron main (já existente) faz o parse em `electron/main.js`
linhas 481–506 e emite `audio:frame` IPC. **Diferença crucial:** o payload
agora carrega o `type: 'loopback'`. O main marca o `wc.send('audio:frame', {type, payload})`.

**Propriedades verificáveis:**
- Frame size típico: 960 samples (20ms @ 48kHz) — pode variar 480–2048.
- Sample rate sempre 48000 Hz (ou convertido via `WASAPIResampler` se device for 44.1/96 kHz).
- Channels = 1 (mono).
- Float32 em range [-1, 1] (samples fora desse range são clampados).

**Método:** Inspecionar bytes no stdout durante share de áudio.

**Evidência APROVADO:**
- Buffer dump mostra `[0xC0, 0x03, 0x00, 0x00, …]` (960 LE = 0x3C0) seguido de 3840 bytes float.
- Conversão `Float32Array` produz samples no range [-1, 1].

---

#### B5 — Build standalone com flag de teste e escrita WAV
**Requisito:** O binário `voicecraft-audio.exe` aceita um flag de teste
(qualquer combinação: `--test-loopback --pid <pid> --out <wav-path>`,
OU comando stdin `{"type":"test-loopback","pid":1234,"out":"/path/test.wav"}`)
que captura por 10s, escreve um arquivo WAV (formato RIFF, PCM Float32 ou Int16 LE,
mono, 48kHz) e sai com código 0.

**Propriedades verificáveis:**
- Arquivo WAV criado com header RIFF correto.
- Duração do WAV ≥ 9s e ≤ 11s (tolerância ±1s).
- Bytes de áudio não-silêncio quando há som tocando (RMS > 0.001).
- Bytes de silêncio quando app está mudo (RMS ≤ 0.0001).
- WAV abre em Audacity/ffprobe sem erro.

**Método:** Rodar
`echo '{"type":"test-loopback","pid":<spotify-pid>,"out":"C:\\tmp\\test.wav"}' | voicecraft-audio.exe`.
Conferir arquivo criado, duração, e inspeção em Audacity.

**Evidência APROVADO:**
- `ffprobe test.wav` mostra `Duration: 00:00:10.00, 48000 Hz, mono, float32`.
- Forma de onda visível no Audacity bate com música tocando.

---

#### B6 — Cleanup dos recursos WASAPI sem leak
**Requisito:** Em `stop-loopback` e em shutdown (SIGINT/SIGTERM/`stop-audio-service`),
o C++ libera na ordem:
1. `IAudioCaptureClient::Release()`
2. `IAudioClient::Stop()` + `IAudioClient->Release()`
3. `IMMDeviceEnumerator->Release()`
4. `CoUninitialize()` (se inicializado por este módulo)
5. `IActivateAudioInterfaceOperation` pending é cancelado via `SetCancel` antes do `Release`.

**Propriedades verificáveis:**
- Inspecionar com `Application Verifier` (WinDbg) ou `UMDH` em 100 ciclos start/stop
  não mostra leak crescente (>0 bytes).
- `Task Manager` mostra uso de handles do processo VoiceCraft-audio estável
  (não cresce a cada start/stop loopback).
- `Process Explorer` (Sysinternals) mostra handles `IAudioClient*`, `IAudioCaptureClient*`
  liberados após stop.

**Método:** Script de stress: 100 ciclos `[start, sleep 1s, stop]`; comparar
handle count antes/depois via `GetProcessHandleCount` ou PowerShell.

**Evidência APROVADO:**
- Handle count delta ≤ 5 após 100 ciclos.
- Memory delta ≤ 1 MB após 100 ciclos.

---

### 1.3 Etapa C — Hook renderer

#### C1 — Hook `useAppLoopbackAudio({ processId, enabled })` em `src/hooks/useAppLoopbackAudio.js`
**Requisito:** Hook React padrão (segue convenção de `useAudioServiceMic.js`):
- Aceita `{processId: number, enabled: boolean, sampleRate?: number, channels?: number}`.
- Retorna `{stream, status, error, sessionId}`.
- `status` é `'idle' | 'starting' | 'running' | 'error' | 'unavailable' | 'unsupported'`.
- `stream` é `MediaStream | null` (track de áudio pronto para `LocalAudioTrack.createLocalAudioTrack`).

**Propriedades verificáveis:**
- Hook existe em `src/hooks/useAppLoopbackAudio.js`.
- Exporta função nomeada `useAppLoopbackAudio`.
- Tipos de retorno documentados via JSDoc.
- Reage a mudança de `processId` (stop+start se PID mudar).
- Reage a mudança de `enabled` (false → stop; true → start).

**Método:** Smoke no DevTools: chamar `useAppLoopbackAudio({processId: 1234, enabled: true})` em componente de teste.

**Evidência APROVADO:**
- Hook retorna `{stream, status, error, sessionId}` com tipos corretos.
- Transição `enabled: false → true` resulta em `status: 'running'` em ≤ 1s (com app tocando).

---

#### C2 — Hook cria AudioContext + MediaStreamAudioSourceNode
**Requisito:** Ao receber o primeiro frame `audio:frame` com `type: 'loopback'`,
o hook cria um `AudioContext` (sampleRate 48000, latencyHint 'interactive'),
configura um ring buffer (mesmo padrão de `useAudioServiceMic` linhas 56–113),
e produz um `MediaStreamAudioDestinationNode` cuja `stream` é exposta no
retorno `stream`.

**Propriedades verificáveis:**
- `AudioContext` é criado apenas uma vez por sessão (não recriado a cada frame).
- ScriptProcessorNode com buffer size 4096.
- Ring buffer com `RING_FRAMES * 1024` samples (~1s @ 48kHz).
- Bound latency: se ring tem > 50% samples não-lidos, avança `readIdx`.

**Método:** Inspecionar implementação em DevTools (hook file).

**Evidência APROVADO:**
- Logs `[audio-loopback] AudioContext ready, sampleRate=48000` aparecem uma vez por sessão.
- Frame counter incrementa a cada callback.

---

#### C3 — Hook expõe `mediaStream` com track de áudio pronto para LiveKit
**Requisito:** `stream` retornado é `MediaStream` contendo exatamente 1 `MediaStreamTrack`
de tipo `'audio'`. Track tem `kind === 'audio'`, `readyState === 'live'`, e pode
ser passada direto para `room.localParticipant.publishTrack(track, {source: Track.Source.ScreenShareAudio})`.

**Propriedades verificáveis:**
- `stream.getAudioTracks().length === 1`.
- `track.kind === 'audio'`.
- `track.readyState === 'live'`.
- `track.enabled === true` (não mutado pelo hook).
- Track settings: `sampleRate: 48000, channelCount: 1`.

**Método:** No DevTools, acessar `stream` retornado e inspecionar tracks.

**Evidência APROVADO:**
- `stream.getAudioTracks()[0].getSettings().sampleRate === 48000`.

---

#### C4 — Cleanup: ao desmontar ou trocar de app, hook envia stop-loopback e fecha AudioContext
**Requisito:** Cleanup function do `useEffect`:
1. `window.electronAPI.audioService.stopLoopback({sessionId})` (fire-and-forget).
2. `processor.disconnect()`.
3. `destination.disconnect()`.
4. `audioCtx.close()` se `state !== 'closed'`.
5. `setStream(null)`, `setStatus('idle')`, `setSessionId(null)`.

**Propriedades verificáveis:**
- Cleanup é chamado quando `processId` muda (efeito re-roda).
- Cleanup é chamado quando `enabled` vira `false`.
- Cleanup é chamado quando componente desmonta.
- Cleanup é **idempotente** (chamar 2x não dá erro).
- `audioCtx.state === 'closed'` após cleanup.

**Método:** Habilitar hook, ver `status === 'running'`; mudar `processId`; ver transição `running → starting → running`; desabilitar `enabled`; ver `status === 'idle'` e stream `null`.

**Evidência APROVADO:**
- Logs mostram `teardown, frames received: <N>`.
- AudioContext state vai para `closed`.

---

#### C5 — Hook coexiste com `useAudioServiceMic` (sem conflito de estado)
**Requisito:** Os dois hooks usam callbacks IPC **independentes** (cada
chamada de `onFrame(cb)` registra um listener único; cleanup remove apenas
o próprio listener). O mic usa frames `type: 'mic'`; o loopback usa frames
`type: 'loopback'`. Ambos podem rodar simultaneamente (cenário futuro: mic
via serviço + áudio de app via serviço).

**Propriedades verificáveis:**
- Inspecionar `ipcRenderer.listenerCount('audio:frame')` em DevTools: máximo 2 (um por hook).
- Ativar os 2 hooks simultaneamente: cada um recebe só os frames do seu `type`.
- Cleanup de um hook não afeta o outro.

**Método:** Em DevTools, simular: `useAudioServiceMic({enabled: true})` + `useAppLoopbackAudio({processId, enabled: true})` ao mesmo tempo. Conferir logs.

**Evidência APROVADO:**
- `[audio-service] frame: type=mic, len=4096` aparece em paralelo a `[audio-loopback] frame: type=loopback, len=4096`.
- Desmontar mic não para loopback.

---

### 1.4 Etapa D — UI + integração

#### D1 — Radio group "Desligado / Sistema inteiro / Aplicativo específico" substitui checkbox
**Requisito:** Em `ScreenSharePicker.jsx`, o checkbox "Incluir áudio do sistema"
(linhas 47–65 atuais) é **removido**. No lugar, um radio group com 3 opções:
- **Desligado** (default, valor `'off'`)
- **Sistema inteiro** (valor `'system'`, equivalente ao comportamento atual com `chromeMediaSource: 'desktop'`)
- **Aplicativo específico** (valor `'app'`, requer seleção de PID)

**Propriedades verificáveis:**
- 3 inputs `type="radio"` com `name="audio-mode"`, mesmo `name` para mutual-exclusion.
- Estado local `audioMode` (default `'off'`).
- Visual: cada opção com label claro + descrição curta (estilo Discord).
- Mantém o checkbox "Estou de fones" visível **apenas** quando `audioMode === 'system'` (NÃO para `app` — Discord-style assume fones por padrão).

**Método:** Inspecionar DOM do modal após abertura; conferir 3 radios com `name="audio-mode"`.

**Evidência APROVADO:**
- `<input type="radio" name="audio-mode" value="off">` (default checked).
- `<input type="radio" name="audio-mode" value="system">`.
- `<input type="radio" name="audio-mode" value="app">`.
- Checkbox "Estou de fones" aparece apenas quando `audioMode === 'system'`.

---

#### D2 — Combobox de processos visível apenas quando "Aplicativo específico"
**Requisito:** Quando `audioMode === 'app'`, mostrar um combobox (`<select>` ou
`<button>` + popover estilo Discord) com a lista de processos retornada por
`listProcesses()`. Cada item: ícone 32×32 + nome + PID truncado (ex.:
`Spotify (PID 1234)`).

**Propriedades verificáveis:**
- Combobox aparece apenas quando `audioMode === 'app'`.
- Items ordenados alfabeticamente por nome (case-insensitive).
- Item selecionado tem highlight visual (border accent).
- Empty state: se lista vazia, mostrar "Nenhum app com áudio detectado" + fallback para `system`.

**Método:** Selecionar "Aplicativo específico"; conferir combobox com ≥1 processo (Spotify se tocando).

**Evidência APROVADO:**
- DOM tem `<div data-app-picker>` visível somente após selecionar 'app'.
- Items mostram `data-pid="<int>"` para inspeção.

---

#### D3 — Combobox carrega processos via IPC ao abrir
**Requisito:** Quando `audioMode` muda de `off`/`system` para `app`, o hook
`useAppLoopbackAudio` (ou um hook separado `useProcessList`) chama
`window.electronAPI.audioService.listProcesses()` **uma vez** (não a cada
abertura). Resultado fica em cache até `audioMode === 'app'` ser re-selecionado.

**Propriedades verificáveis:**
- IPC chamado exatamente 1× por sessão de share (não a cada frame).
- Loading state visível enquanto IPC pending (`<Spinner />` ou skeleton).
- Erro de IPC mostra mensagem amigável e volta para `system`.

**Método:** Monitorar IPC no DevTools (`Network` tab em Electron = `IpcRenderer.invokers`).

**Evidência APROVADO:**
- Exatamente 1 chamada a `listProcesses` por ciclo de abertura.
- Latência < 500ms tipicamente.

---

#### D4 — `onPick(sourceId, {audioMode, appPid?, headphones?})`
**Requisito:** `pick` em `ScreenSharePicker.jsx` chama
`onPick(sourceId, { audioMode, appPid: number | undefined, headphones: boolean })`.
- `audioMode === 'off'` → `appPid: undefined`, `headphones: false`.
- `audioMode === 'system'` → `appPid: undefined`, `headphones: usingHeadphones`.
- `audioMode === 'app'` → `appPid: <pid-selected>`, `headphones: true` (Discord-style: fones assumidos; toast avisa).

**Propriedades verificáveis:**
- Assinatura de `onPick` compatível com consumidor (`useLiveKitRoom`).
- `appPid` é `number` válido (`> 0`) quando presente.
- `headphones` é `boolean`.

**Método:** Inspecionar prop `onPick` chamado; conferir payload.

**Evidência APROVADO:**
- Selecionar 'app' + Spotify → `onPick(src, {audioMode:'app', appPid:<spotify>, headphones:true})`.

---

#### D5 — Quando `audioMode === 'app'`, `useLiveKitRoom` chama `useAppLoopbackAudio` e publica como `Track.Source.ScreenShareAudio`
**Requisito:** Em `useLiveKitRoom.js`, ao detectar `opts.audioMode === 'app'` no callback de screen share:
1. Invoca `useAppLoopbackAudio({processId: opts.appPid, enabled: true})`.
2. Quando `stream` fica disponível, cria `LocalAudioTrack` via
   `LocalAudioTrack.createLocalAudioTrack(stream.getAudioTracks()[0], ...)` OU
   usa `room.localParticipant.publishTrack(track, { source: Track.Source.ScreenShareAudio })`.
3. Seta `screenAudioCaptureRef.current = { active: true, headphones: true }` (mute mic-safe).

**Propriedades verificáveis:**
- Track publicada com `track.source === Track.Source.ScreenShareAudio`.
- Outro peer recebe o áudio do app no `RemoteTrackPublication` correto.
- Cleanup quando share para: `unpublishTrack`, `stopLoopback`, ref limpo.

**Método:** Com Spotify tocando, selecionar 'app' + Spotify no picker; outro peer (2ª instância Electron) deve ouvir áudio do Spotify, NÃO a própria voz (mute mic-safe).

**Evidência APROVADO:**
- Logs do LiveKit: `track published: source=ScreenShareAudio, kind=audio`.
- 2ª instância reproduz o áudio do Spotify (sem eco da própria voz).

---

#### D6 — Toast: app-alvo mudo (exclusive mode detectado) → "use fones"
**Requisito:** Enquanto `audioMode === 'app'` está ativo, o hook monitora
se o frame loopback é silêncio contínuo (> 2s RMS < 0.0005). Se o app-alvo
está **mudo** (ou seja, WASAPI per-app loopback retornou `ProcessLoopbackMode: INCLUDE`
mas o app está mudo globalmente), mostrar toast:
**"Discord detectou que o [app] está mudo durante o share. Use fones para ouvir a call."**
O comportamento **Discord-style** assume que o app capturado fica mudo
(loopback exclusivo); peer ouvindo **não** deve ouvir o áudio do app.

**Propriedades verificáveis:**
- Toast aparece ≤ 3s após app virar mudo.
- Toast some quando app volta a tocar (RMS > 0.001 por > 500ms).
- Toast usa o sistema de toasts existente (`vc-toast` ou similar, conforme DESIGN_SYSTEM).

**Método:** Mutar Spotify mid-share; conferir toast; desmutar; toast some.

**Evidência APROVADO:**
- DOM tem `<div role="status" data-toast="app-muted">` visível.
- Texto inclui nome do app (`[app]`) e frase "Use fones".

---

#### D7 — Toast: app-alvo fecha → encerra share de áudio
**Requisito:** Quando o app-alvo termina enquanto o share está ativo, o hook
detecta (`frame: null` ou `error: 'target-process-exited'` do C++ via stderr)
e:
1. Para o `LocalAudioTrack` publicado (`unpublishTrack` + `track.stop()`).
2. Envia `stopLoopback({sessionId})` ao C++.
3. Seta `screenAudioCaptureRef.current = { active: false, headphones: false }`.
4. Mostra toast: **"O [app] fechou. Compartilhamento de áudio encerrado."**

**Propriedades verificáveis:**
- Cleanup completo em ≤ 1s após detecção.
- Toast visível por 5s (default).
- Outro peer NÃO recebe mais áudio (track ended).

**Método:** Selecionar 'app' + Spotify; fechar Spotify; conferir toast e fim do áudio.

**Evidência APROVADO:**
- Toast aparece com texto correto.
- Track é `readyState === 'ended'` no peer remoto.

---

#### D8 — Fallback automático para session-loopback global em falha WASAPI
**Requisito:** Se `start-loopback` retorna erro **não-recuperável**
(`E_ACCESSDENIED`, `AUDCLNT_E_DEVICE_IN_USE`, ou
`HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED)` para Win10 pré-20H1), o hook
**automaticamente** cai no modo `'system'` (comportamento atual
`chromeMediaSource: 'desktop'`) com toast informativo:
**"Não foi possível capturar áudio do [app]. Capturando áudio do sistema inteiro."**

**Propriedades verificáveis:**
- Fallback só ocorre em erros que justificam (não em erros transitórios — esses recebem retry).
- Toast fica visível por 7s.
- Áudio do sistema continua chegando ao peer (via Electron desktop loopback).
- Mic duck continua ativo (`screenAudioCaptureRef.active === true`, `headphones === false` por default).

**Método:** Forçar falha: selecionar PID que não existe → ver fallback.

**Evidência APROVADO:**
- Logs mostram `[audio-loopback] fallback to system: <error>`.
- Toast visível com texto correto.

---

#### D9 — Persistir último app em `settings.json` como `lastScreenAudioApp`
**Requisito:** Após `onPick` com `audioMode === 'app'`, main process salva em
`settings.json` (userData) o campo `lastScreenAudioApp: { pid: number, name: string }`.
Na próxima abertura do picker, se o PID persistido ainda existe na lista
de processos ativos (verificado por `listProcesses()`), o combobox vem pré-selecionado.

**Propriedades verificáveis:**
- `settings.json` em `userData/settings.json` contém chave `lastScreenAudioApp` após share de app.
- Após reiniciar o Electron, picker abre com app pré-selecionado (se PID ativo).
- Se PID não está mais ativo, campo é limpo (`lastScreenAudioApp: null`).

**Método:** Fazer share de app; fechar Electron; reabrir; conferir settings.json e picker.

**Evidência APROVADO:**
- `cat userData/settings.json | jq '.lastScreenAudioApp'` mostra `{pid, name}`.
- Picker pré-seleciona o item com mesmo PID.

---

## 2. Invariantes (I1–I9)

Propriedades que **nunca** podem quebrar, mesmo em cenários não cobertos explicitamente pelos critérios.

### I1 — Mic do usuário continua funcionando
`createLocalTracks({audio: true})` (ou `useAudioServiceMic` no futuro) continua
capturando o microfone. Screen share de áudio **nunca** substitui o mic; track de
áudio do app vai como `Track.Source.ScreenShareAudio`, **separado** do mic
(`Track.Source.Microphone`).

### I2 — Voice ring continua rosa (`vc-speaking-pulse`)
A animação de "falando" (`vc-speaking-pulse` em `src/index.css`) continua
acionada pelo RMS do mic remoto (`SpeakingIndicator.jsx`). Áudio do app **NÃO**
dispara o pulse (peer que compartilha o app não está "falando" — está só
tocando música).

### I3 — Screen share de vídeo continua funcionando sem áudio
Usuário pode escolher source de vídeo e áudio desligado. O comportamento de
video-only (sem audio track) **não muda**.

### I4 — Screen share "sistema inteiro" continua funcionando
O modo `'system'` é o comportamento atual (`chromeMediaSource: 'desktop'`)
+ mute dos remotes via `applyOutputToAudio` + headphones checkbox.
**Idêntico** ao release 0.2.2.

### I5 — Mensagens de chat continuam funcionando
Markdown, typing indicator, menções, lightbox, edição, exclusão — tudo do
CONTRATO_CHATDISCORD.md permanece válido. Esta fase **não toca** chat.

### I6 — 6 arquivos protegidos com SHA-512 byte-idêntico
Gate duríssimo. Lista idêntica à do CONTRATO_CHATDISCORD.md §4:
1. `release/VoiceCraft Setup 0.2.2.exe`
2. `release/VoiceCraft Setup 0.2.2.exe.blockmap`
3. `release/VoiceCraft-Setup-0.2.2.exe`
4. `release/VoiceCraft-Setup-0.2.2.exe.blockmap`
5. `release/latest.yml`
6. `package.json` (campo `version: 0.2.2`)

### I7 — 37 testes do `test_signaling_cache.mjs` continuam passando
`node scripts/tests/test_signaling_cache.mjs` termina com `N passed · 0 failed`.

### I8 — `useLiveKitRoom.js` não muda API pública
A **assinatura** retornada pelo hook (`{stream, status, ...}`) é preservada.
`screenAudioCaptureRef` mantém forma `{active, headphones}`. Mudanças são
internas (adição de chamadas a `useAppLoopbackAudio`, novo path de publicação).

### I9 — `ScreenSharePicker.jsx` muda internamente mas mantém props `onPick(sourceId, opts)`
A assinatura `onPick(sourceId, opts)` é **estendida** (novos campos em `opts`),
mas não quebrada: callers existentes que ignoram campos extras continuam
funcionando. As props `open`, `sources`, `onClose` permanecem.

---

## 3. Não-objetivos (NG1–NG8)

Comportamentos explicitamente fora do escopo. Não precisam ser testados e não
devem ser considerados pendências.

### NG1 — Captura por HWND
Só PID é suportado. Não enumeramos janelas nem associamos HWND↔PID.

### NG2 — Suporte a Linux/macOS
Só Windows 10 20H1+ (build 18941). Linux/Mac não são alvos nesta fase.

### NG3 — Hook de driver (APO/DMO)
Não instalamos drivers, APOs, nem DMOs. WASAPI puro via
`ActivateAudioInterfaceAsync` é a única interface de captura.

### NG4 — Forçar VoiceMeeter / VB-Cable
Não instalamos nem sugerimos software de terceiros. Usuário é livre para usar
se quiser, mas VoiceCraft não força nem auto-instala.

### NG5 — AEC (Acoustic Echo Cancellation) do WebRTC
Não mexemos no pipeline AEC. O mute dos remotes via `applyOutputToAudio`
(linhas 222–224 de `useLiveKitRoom.js`) é a única contramedida de eco. AEC
do WebRTC fica para fase futura.

### NG6 — Otimizar latência
Não fazemos benchmark isolado de latência nesta fase. Implementa e mede
depois (decisão do usuário). Latência aceitável ≤ 150ms (típico de WASAPI
loopback), mas não há SLA duro.

### NG7 — Benchmark isolado antes da implementação
Decidido ir direto à implementação. Não há `scripts/bench/audio-loopback.mjs`
nesta fase.

### NG8 — Reusar miniaudio para loopback
`miniaudio` (já em `audio-service/third_party/`) é usado **apenas** para captura
de mic. Loopback é **WASAPI puro** em `loopback_wasapi.cpp`.

---

## 4. Restrições de regressão (R1–R4)

### R1 — 6 arquivos protegidos com SHA-512 byte-idêntico (gate duríssimo)
Idêntico ao I6. Procedimento de verificação:

```powershell
# ANTES da Fase 3 (snapshot)
cd "C:\Users\nowar\OneDrive\Documentos\Codes\voicecraft"
certutil -hashfile "release\VoiceCraft Setup 0.2.2.exe" SHA512
certutil -hashfile "release\VoiceCraft Setup 0.2.2.exe.blockmap" SHA512
certutil -hashfile "release\VoiceCraft-Setup-0.2.2.exe" SHA512
certutil -hashfile "release\VoiceCraft-Setup-0.2.2.exe.blockmap" SHA512
certutil -hashfile "release\latest.yml" SHA512

# DEPOIS da Fase 3 (comparar) — TODOS os hashes devem ser IDÊNTICOS
# git diff package.json deve mostrar APENAS alterações de áudio (não version bump)
```

Qualquer divergência = FALHA na aceitação.

### R2 — 37 testes do `test_signaling_cache.mjs` passando
`node scripts/tests/test_signaling_cache.mjs` deve terminar com `N passed · 0 failed`.

### R3 — Build sem warnings novos
`npx vite build` termina com 0 warnings. `cmake --build audio-service/build --config Release`
termina com `0 errors, 0 warnings`.

### R4 — `chromeMediaSource: 'desktop'` modificado apenas quando user escolhe "Sistema inteiro"
Quando `audioMode === 'system'`, o comportamento **exato** do release 0.2.2 é
replicado: `useScreenShare.js` linhas 108–131 com `chromeMediaSource: 'desktop'` no
audio constraints, **sem** qualquer mudança. Mic duck + headphones checkbox
funcionam identicamente.

---

## 5. Casos de borda (E1–E6)

### E1 — Picker de processos vazio
`listProcesses()` retorna `processes: []` (nenhum app com áudio ativo).
UI mostra mensagem "Nenhum app com áudio detectado" + 2 botões:
**"Usar sistema inteiro"** (volta para `'system'`) e **"Desligar áudio"** (volta para `'off'`).

**Comportamento esperado:** UI não crasha; usuário escolhe alternativa.

### E2 — User escolhe app que fecha antes do share iniciar
Usuário clica "Spotify" no picker, mas antes do `onPick` ser processado,
Spotify fecha. `start-loopback` retorna `error: 'pid-not-found'`. Hook cai
em fallback (vide D8) OU mostra erro inline no picker e mantém modal aberto.

**Comportamento esperado:** Modal não fecha; toast inline: "App não está mais disponível. Escolha outro ou cancele."

### E3 — WASAPI per-app lança `E_ACCESSDENIED`
Quando o app capturado é executado com privilégios elevados (admin) e o
VoiceCraft não, WASAPI retorna `E_ACCESSDENIED` (UAC split token).
Fallback automático para `'system'` + toast informativo.

**Comportamento esperado:** Áudio continua via session loopback global.

### E4 — User está em Win10 pré-20H1 (build < 18941)
Ao iniciar Electron, detectar via `os.release()` ou `process.platform`-specific
API. Se build < 18941, a opção "Aplicativo específico" fica **hidden** no picker
(só `'off'` e `'system'` visíveis). Usuário ainda pode usar audio do sistema.

**Comportamento esperado:** Não crasha; degrada graciosamente.

### E5 — App-alvo com múltiplas audio sessions
Spotify toca música e tem notificações sonoras (sessão separada). WASAPI per-app
com `ProcessLoopbackMode: INCLUDE` captura **todas** as sessões do PID.
Comportamento default esperado.

**Comportamento esperado:** Peer recebe música + notificações juntas (mix WASAPI).

### E6 — User cancela picker
Botão `X` ou `Esc` no modal → `onClose` é chamado. `audioMode` não é aplicado
(no Pick = nada muda). Se share de vídeo estava em curso, **continua sem áudio**
(comportamento atual).

**Comportamento esperado:** Sem toast, sem erro; modal fecha limpo.

---

## 6. Sinalização de congelamento

```yaml
criterios:
  congelado: true
  data: 2026-09-13
  fase: 2
  escopo: "Captura de áudio por PID (Discord-style) no Windows via WASAPI per-process loopback"
  release_referencia: 0.2.2
  versao_alvo: NAO_BUMPAR (manter 0.2.2 no package.json até decisão de release)
  protocolo_alterado: true   # audio:frame muda de Float32Array para {type, floats}
  arquivos_release_preservar: 6
  criterios_total: 25        # A1-A5 (5) + B1-B6 (6) + C1-C5 (5) + D1-D9 (9)
  invariantes_total: 9
  nao_objetivos_total: 8
  casos_borda_total: 6
  restricoes_regressao_total: 4

defaults:
  captura_tipo: "per-app PID (estilo Discord Applications)"
  plataforma_alvo: "Windows 10 20H1+ (build 18941)"
  wasapi_api: "ActivateAudioInterfaceAsync + AUDIOCLIENT_PROCESS_LOOPBACK_PARAMS"
  fallback: "session-loopback global via chromeMediaSource: 'desktop' (com mute+fones)"
  exclusive_mode: "app capturado fica mudo + toast 'use fones'"
  picker_visual: "radio group (3 opções) + combobox com ícone + nome + PID"
  app_close_handling: "auto-stop share + toast avisando"
  audio_frame_header: "{type: 'mic' | 'loopback', floats: Float32Array}"
  settings_persistencia: "lastScreenAudioApp: {pid, name} em settings.json"

proximos_agentes:
  fase_3_implementador:
    entrada: ["este contrato"]
    saida: ["diff com critérios A1-D9 implementados", "novo módulo loopback_wasapi.cpp", "novo hook useAppLoopbackAudio.js", "ScreenSharePicker reescrito"]
    restricao: "NAO tocar nos 6 arquivos de release"
    nao_objetivos: ["não instalar drivers", "não otimizar latência", "não benchmark", "não reusar miniaudio"]
  fase_4_testador:
    entrada: ["este contrato", "diff da Fase 3"]
    saida: ["relatório de smoke com evidências para A1-D9"]
    ferramentas: ["vite build", "cmake build", "dev:multi (2 Electron)", "2ª instância para peer", "ffprobe", "Process Explorer"]
  fase_5_verificador:
    entrada: ["este contrato", "relatório da Fase 4"]
    saida: ["APROVADO ou REPROVADO com lista de gaps"]
    gate_hard: "6 arquivos release 0.2.2 com sha512 idêntico"
    gate_durissimo: "test_signaling_cache.mjs 37/37 passando"
```

**Este contrato é a entrada única e congelada para as Fases 3, 4 e 5.**
Nenhum critério pode ser adicionado, removido ou reescrito após esta publicação
sem reabrir a Fase 2.
