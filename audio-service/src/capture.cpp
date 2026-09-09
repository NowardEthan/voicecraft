// VoiceCraft audio capture — miniaudio backend.
// Works on Windows (WASAPI), macOS (Core Audio), Linux (PulseAudio/PipeWire).
#define MINIAUDIO_IMPLEMENTATION
#include <miniaudio.h>
#undef MINIAUDIO_IMPLEMENTATION

#include "capture.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

namespace voicecraft::audio {

// Convert a miniaudio ma_device_id (a union of backend-specific IDs) into a
// portable string we can ship to the renderer. Only WASAPI is currently
// used on Windows; the other branches are TODO if we expand to macOS/Linux.
static std::string device_id_to_string(const ma_device_id& id) {
#if defined(_WIN32)
    // WASAPI — wchar_t string (max 64 chars)
    std::wstring w(id.wasapi);
    // Best-effort narrow conversion. WASAPI IDs are ASCII anyway.
    std::string out;
    out.reserve(w.size());
    for (wchar_t c : w) {
        if (c == 0) break;
        out.push_back(static_cast<char>(c < 128 ? c : '?'));
    }
    return out;
#elif defined(__APPLE__)
    return std::string(id.coreaudio);
#else
    return std::string(id.alsa);
#endif
}

// -----------------------------------------------------------------------------
// DSP state — applied in the audio callback (real-time safe, no allocations
// after construction).
// -----------------------------------------------------------------------------
struct DspState {
  bool enable_hpf = true;
  bool enable_agc = true;
  bool enable_gate = true;
  float gate_threshold = 0.005f;  // linear, ≈ -46 dBFS
  float gate_envelope = 0.0f;
  // 1-pole high-pass filter state (cutoff ≈ 80 Hz @ 48 kHz).
  float hpf_z1 = 0.0f;
  float hpf_alpha = 0.995f;        // α = exp(-2π·fc/fs); fc ≈ 75 Hz @ 48 kHz
  // AGC — slow envelope follower, gentle compression toward unity.
  float agc_gain = 1.0f;
};

inline void dsp_process(DspState& dsp, float* buf, uint32_t n) {
  // High-pass: y[n] = α·(y[n-1] + x[n] - x[n-1])
  if (dsp.enable_hpf) {
    float z = dsp.hpf_z1;
    float prev = 0.0f;
    for (uint32_t i = 0; i < n; ++i) {
      float x = buf[i];
      float y = dsp.hpf_alpha * (z + x - prev);
      prev = x;
      z = y;
      buf[i] = y;
    }
    dsp.hpf_z1 = z;
  }
  // Noise gate + AGC (simple envelope-based).
  if (dsp.enable_gate || dsp.enable_agc) {
    float env = dsp.gate_envelope;
    float gain = dsp.agc_gain;
    for (uint32_t i = 0; i < n; ++i) {
      float x = buf[i];
      float ax = x < 0 ? -x : x;
      float coef = ax > env ? 0.4f : 0.005f;
      env = coef * ax + (1.0f - coef) * env;
      float gate = (env > dsp.gate_threshold) ? 1.0f : 0.0f;
      if (dsp.enable_agc) {
        float target = env > 0.01f ? 1.0f / (env * 4.0f) : 1.0f;
        if (target > 8.0f) target = 8.0f;
        gain = 0.0005f * target + (1.0f - 0.0005f) * gain;
      }
      buf[i] = x * gate * gain;
    }
    dsp.gate_envelope = env;
    dsp.agc_gain = gain;
  }
}

// -----------------------------------------------------------------------------
// Implementation
// -----------------------------------------------------------------------------
struct CaptureSession::Impl {
  ma_device_config device_cfg;
  ma_device device = {};
  ma_context context = {};
  AudioCallback callback;
  CaptureConfig config;
  DspState dsp;
  ma_device_id requested_id = {};
  bool has_requested_id = false;
  bool running = false;
  std::string last_error;
  std::mutex error_mutex;

  Impl() : device_cfg(ma_device_config_init(ma_device_type_capture)) {}
};

static void on_audio_callback(ma_device* dev, void* output, const void* input,
                              ma_uint32 frame_count) {
  (void)output;
  CaptureSession::Impl* impl = reinterpret_cast<CaptureSession::Impl*>(dev->pUserData);
  if (!impl || !impl->callback) return;

  const float* in = reinterpret_cast<const float*>(input);
  static thread_local std::vector<float> scratch;
  if (scratch.size() < frame_count) scratch.resize(frame_count);
  std::memcpy(scratch.data(), in, frame_count * sizeof(float));

  dsp_process(impl->dsp, scratch.data(), frame_count);

  impl->callback(scratch.data(), frame_count);
}

CaptureSession::CaptureSession() : impl_(new Impl()) {}

CaptureSession::~CaptureSession() {
  stop();
  delete impl_;
}

bool CaptureSession::is_running() const {
  return impl_ ? impl_->running : false;
}

const std::string& CaptureSession::last_error() const {
  static std::string empty;
  return impl_ ? impl_->last_error : empty;
}

// Forward declaration — full definition comes later, after Impl is complete
// so we can dereference Impl's fields (callback, dsp).
static void on_audio_callback(ma_device* dev, void* output, const void* input,
                              ma_uint32 frame_count);

std::vector<DeviceInfo> CaptureSession::list_input_devices() {
  std::vector<DeviceInfo> out;
  ma_context ctx;
  if (ma_context_init(nullptr, 0, nullptr, &ctx) != MA_SUCCESS) return out;

  ma_device_info* pPlaybackInfos = nullptr;
  ma_uint32 playbackCount = 0;
  ma_device_info* pCaptureInfos = nullptr;
  ma_uint32 captureCount = 0;
  if (ma_context_get_devices(&ctx, &pPlaybackInfos, &playbackCount,
                            &pCaptureInfos, &captureCount) == MA_SUCCESS) {
    for (ma_uint32 i = 0; i < captureCount; ++i) {
      DeviceInfo d;
      d.id = device_id_to_string(pCaptureInfos[i].id);
      d.name = pCaptureInfos[i].name;
      d.is_input = true;
      d.is_default = false;  // New API: check via ma_device_get_info() if needed
      out.push_back(d);
    }
  }

  ma_context_uninit(&ctx);
  return out;
}

bool CaptureSession::start(const CaptureConfig& cfg, AudioCallback on_audio) {
  if (impl_->running) return false;
  impl_->callback = std::move(on_audio);
  impl_->config = cfg;
  impl_->dsp = DspState{};
  impl_->dsp.enable_hpf = cfg.enable_hpf;
  impl_->dsp.enable_agc = cfg.enable_agc;
  impl_->dsp.enable_gate = cfg.enable_gate;
  impl_->dsp.gate_threshold = std::pow(10.0f, cfg.gate_threshold_db / 20.0f);

  if (ma_context_init(nullptr, 0, nullptr, &impl_->context) != MA_SUCCESS) {
    impl_->last_error = "ma_context_init failed";
    return false;
  }

  // Build device config (new API uses camelCase fields).
  impl_->device_cfg = ma_device_config_init(ma_device_type_capture);
  impl_->device_cfg.capture.format = ma_format_f32;
  impl_->device_cfg.capture.channels = cfg.channels;
  impl_->device_cfg.sampleRate = cfg.sample_rate;
  impl_->device_cfg.capture.shareMode = ma_share_mode_shared;
  impl_->device_cfg.periodSizeInFrames = (cfg.sample_rate * cfg.frame_size_ms) / 1000;
  impl_->device_cfg.periods = 2;
  impl_->device_cfg.performanceProfile = ma_performance_profile_low_latency;
  impl_->device_cfg.dataCallback = on_audio_callback;
  impl_->device_cfg.pUserData = impl_;

  // If a specific device id was requested, point the config at it. The new
  // API expects a pointer to a stable ma_device_id; we copy the union value
  // into the impl so it lives as long as the capture session.
  if (!cfg.device_id.empty()) {
    impl_->has_requested_id = false;
    auto devices = list_input_devices();
    for (auto& d : devices) {
      if (d.id == cfg.device_id) {
#if defined(_WIN32)
        // Convert narrow string back to wchar_t for WASAPI.
        std::wstring w(cfg.device_id.begin(), cfg.device_id.end());
        std::wcsncpy(impl_->requested_id.wasapi, w.c_str(), 63);
        impl_->requested_id.wasapi[63] = 0;
#elif defined(__APPLE__)
        std::strncpy(impl_->requested_id.coreaudio, cfg.device_id.c_str(), 255);
        impl_->requested_id.coreaudio[255] = 0;
#else
        std::strncpy(impl_->requested_id.alsa, cfg.device_id.c_str(), 255);
        impl_->requested_id.alsa[255] = 0;
#endif
        impl_->has_requested_id = true;
        break;
      }
    }
    if (impl_->has_requested_id) {
      impl_->device_cfg.capture.pDeviceID = &impl_->requested_id;
    }
  }

  if (ma_device_init(&impl_->context, &impl_->device_cfg, &impl_->device) != MA_SUCCESS) {
    ma_context_uninit(&impl_->context);
    impl_->last_error = "ma_device_init failed";
    return false;
  }
  if (ma_device_start(&impl_->device) != MA_SUCCESS) {
    ma_device_uninit(&impl_->device);
    ma_context_uninit(&impl_->context);
    impl_->last_error = "ma_device_start failed";
    return false;
  }
  impl_->running = true;
  return true;
}

void CaptureSession::stop() {
  if (!impl_->running) return;
  ma_device_stop(&impl_->device);
  ma_device_uninit(&impl_->device);
  ma_context_uninit(&impl_->context);
  impl_->callback = nullptr;
  impl_->running = false;
}

}  // namespace voicecraft::audio
