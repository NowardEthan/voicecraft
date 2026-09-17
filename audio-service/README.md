# Voice audio service

C++ native process that handles microphone capture (and optionally DSP) outside
the Electron renderer. Replaces `getUserMedia` for mic so we can use OS-level
APIs (WASAPI loopback for screen audio, PulseAudio/PipeWire monitor sources on
Linux, Core Audio on macOS) and avoid the WebRTC `NotReadableError` crash that
Electron 28 hits when asking for desktop-audio capture.

## Protocol

- **stdin** (commands, one per line, JSON):
  - `{"type":"list-devices"}` → list available input devices
  - `{"type":"start","sampleRate":48000,"channels":1,"hpf":true,"agc":true,"gate":true,"threshold":-45,"deviceId":"","frameSizeMs":20}`
  - `{"type":"stop"}`
  - `{"type":"shutdown"}`
- **stdout** (audio frames, raw binary):
  - `[4-byte little-endian uint32 frame_count]`
  - `[frame_count * 4 bytes float32 little-endian PCM, mono]`
  - back-to-back frames
- **stderr** (status events, JSON lines):
  - `{"type":"service-started","version":"..."}`
  - `{"type":"ready","sampleRate":48000,"channels":1}`
  - `{"type":"stopped"}`
  - `{"type":"error","message":"..."}`
  - `{"type":"device-list","devices":[{"id":"...","name":"...","isDefault":true}]}`

## Build

### Prerequisites

- **CMake 3.15+**
- **C++17 compiler**:
  - Windows: Visual Studio 2019/2022 Build Tools (provides `cmake` and `cl.exe`)
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `gcc` or `clang`

CMake auto-fetches `miniaudio.h` (single-header audio library) into
`third_party/miniaudio_repo/`.

### Commands

```bash
# Configure
cmake -S . -B build

# Build
cmake --build build --config Release

# Binary ends up at:
#   build/voicecraft-audio       (Linux/macOS)
#   build/Release/voicecraft-audio.exe  (Windows)
```

### Quick test

```bash
# Terminal 1 — run the service:
./build/voicecraft-audio

# Terminal 2 — send commands:
echo '{"type":"list-devices"}'
echo '{"type":"start","sampleRate":48000,"channels":1}'
# ... audio frames will start streaming on stdout
# (binary — pipe to `aplay -f FLOAT_LE -r 48000 -c 1` to hear it on Linux)
echo '{"type":"stop"}'
echo '{"type":"shutdown"}'
```

## Integration with Electron (planned)

`electron/main.js` will spawn this binary as a child process during dev/launch
when the user has the "Use audio service" setting enabled. PCM frames are read
from stdout, batched into ~20ms chunks, and forwarded to the renderer via
IPC. The renderer feeds them into an `AudioBufferSourceNode` chain that
ultimately becomes the local audio track for WebRTC.

DSP for now is done **in the C++ service** (high-pass, gate, AGC). Once we
prove the pipeline end-to-end, we can move DSP into the renderer (Web Audio
API) and use the service purely as a clean capture source.

## Roadmap

- [x] Cross-platform build via CMake + miniaudio
- [x] Mic capture with WASAPI/CoreAudio/PulseAudio
- [x] Internal DSP (HPF, gate, AGC) — basic but real
- [ ] Screen-audio capture (loopback) per OS
- [ ] Op
- [ ] Electron main-process integration (spawn + read stdout)
- [ ] Renderer hook (decode frames → MediaStream → WebRTC track)
- [ ] Settings toggle to switch between "Web Audio" and "audio service"
