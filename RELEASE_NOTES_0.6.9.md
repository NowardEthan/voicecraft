# Voice 0.6.9 — Áudio Discord-style (split tracks)

**Data de release:** 2026-09-25  
**Bump:** `0.6.8 → 0.6.9` (patch — rebrand de áudio)

---

## 🎙️ Nova opção: "Tela inteira com áudio (sem eco da call)"

A 0.6.9 introduz uma **terceira opção de áudio** no `ScreenSharePicker`, juntando-se a:
- **Sem áudio (apenas vídeo)** — só track de tela, sem som.
- **Áudio do app específico** (estilo Discord) — só áudio do PID escolhido.
- **Tela inteira com áudio (sem eco da call)** — NOVA! Captura todo o áudio do Windows **exceto o próprio Voice**.
- **Tela inteira com áudio (legado — pode causar eco)** — o que existia antes; mantido por compatibilidade.

### Como funciona

A nova opção usa `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE` no WASAPI:

```cpp
AUDIOCLIENT_ACTIVATION_PARAMS activation{};
activation.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
activation.ProcessLoopbackParams.TargetProcessId = GetCurrentProcessId(); // nosso PID
activation.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;
```

O Windows captura tudo que toca no endpoint de áudio padrão (YouTube, jogo, Spotify) **menos** os streams renderizados pelo Voice e seus filhos. Resultado: o outro participante ouve o conteúdo da tela, mas **não recebe a sua voz de volta** (o clássico eco da call).

### Mudanças no código

1. **`audio-service/src/loopback_wasapi.cpp`**:
   - Nova função `find_audio_process_pid_for_window(window_pid)` que enumera `IAudioSessionManager2` para encontrar o PID correto do processo de áudio (resolve o bug do YouTube/Chrome onde o PID da janela ≠ PID do processo de áudio).
   - Nova função `activate_endpoint_loopback_exclude_self(out, exclude_pid)` que implementa `PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE`.
   - Nova função `run_capture_loop_exclude_self` que reusa o `run_capture_loop_body` fatorado.
2. **`audio-service/src/main.cpp`**:
   - Novo comando `start-loopback-system` que ativa o modo exclude-self.
3. **`electron/main.js`**:
   - Novo IPC handler `audio-service:start-loopback-system` que spawna o instalador e cria a sessão.
4. **`src/features/rooms/views/voice/components/ScreenSharePicker.jsx`**:
   - Nova opção de áudio "Tela inteira com áudio (sem eco da call)".
   - Banner explicativo: requer `voicecraft-audio.exe` recompilado com suporte a exclude-self.

## ⚠️ Limitação: binário C++

O **código C++ está pronto**, mas o `voicecraft-audio.exe` precisa ser **recompilado** com o novo suporte a exclude-self. A infraestrutura do projeto (CI, release) não tem `cmake` + Windows SDK configurados para build do C++ no momento.

**Trabalho pendente** (próxima iteração):
- Adicionar workflow `.github/workflows/audio-service-build.yml` que compila `voicecraft-audio.exe` com `cmake + MSVC` no Windows.
- Subir o binário como asset de release (`voicecraft-audio.exe`).
- Atualizar `package.json` `extraResources` para referenciar o asset do release.

Enquanto isso, a **opção nova está no UI mas funcional só quando o binário novo for publicado**. A opção legado (loopback de sistema) continua funcionando.

## ✅ Como testar agora (sem rebuild)

- Quem está em 0.6.8 → auto-update para 0.6.9.
- UI mostra a nova opção "Tela inteira com áudio (sem eco da call)".
- Se clicar nela, vai dar erro `Loopback only supported on Windows` (porque o binário antigo não conhece o comando `start-loopback-system`).
- **Não quebra o que funcionava antes**: as opções "Sem áudio", "Áudio do app" e "Tela inteira (legado)" continuam funcionando normalmente.

## 📌 Próximo passo (1.0.0)

- Rebuild do `voicecraft-audio.exe` com o novo `exclude-self`.
- Workflow CI para compilar o C++ automaticamente.
- Documentar como rebuildar localmente (cmake + Visual Studio Build Tools).
