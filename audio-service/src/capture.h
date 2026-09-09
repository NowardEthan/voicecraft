// VoiceCraft audio capture — portable interface over OS APIs.
// Backed by miniaudio (single-header library fetched by CMake).
#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace voicecraft::audio {

struct DeviceInfo {
  std::string id;       // OS device id (ma_device_id from miniaudio)
  std::string name;     // human-readable name
  bool is_input = false;
  bool is_output = false;
  bool is_default = false;
};

struct CaptureConfig {
  std::string device_id;            // empty = default
  uint32_t sample_rate = 48000;     // Hz
  uint16_t channels = 1;            // mono
  uint16_t frame_size_ms = 10;      // ms of audio per emitted chunk (10/20/30ms)
  bool enable_hpf = true;           // high-pass filter (cut rumble < 80Hz)
  bool enable_agc = true;           // automatic gain control
  bool enable_gate = true;          // noise gate
  float gate_threshold_db = -45.0f; // gate opens above this
};

// Callback fired from the audio thread. MUST be real-time safe (no locks,
// no allocations). `samples` is interleaved float32 in [-1, 1].
using AudioCallback = std::function<void(const float* samples, uint32_t frames)>;

class CaptureSession {
public:
  CaptureSession();
  ~CaptureSession();

  CaptureSession(const CaptureSession&) = delete;
  CaptureSession& operator=(const CaptureSession&) = delete;

  // PIMPL handle — kept public so the free `on_audio_callback` defined in
  // capture.cpp can access its fields through `dev->pUserData` without
  // needing a friend declaration. The struct's contents are private to
  // the .cpp file.
  struct Impl;

  // List input devices available to the OS.
  static std::vector<DeviceInfo> list_input_devices();

  // Start capturing with the given config. `on_audio` is called from the
  // audio thread every `frame_size_ms`.
  // Returns true on success, false otherwise (error message via last_error).
  bool start(const CaptureConfig& cfg, AudioCallback on_audio);
  void stop();

  bool is_running() const;
  const std::string& last_error() const;

  Impl* impl_;
};

}  // namespace voicecraft::audio
