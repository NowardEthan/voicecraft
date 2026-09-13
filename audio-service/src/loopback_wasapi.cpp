#include "loopback_wasapi.h"

#ifdef _WIN32

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <psapi.h>

#include <atomic>
#include <chrono>
#include <iostream>
#include <thread>
#include <unordered_set>

template<typename T>
class ComPtr {
public:
  ComPtr() : p_(nullptr) {}
  ComPtr(T* p) : p_(p) { if (p_) p_->AddRef(); }
  ~ComPtr() { reset(); }
  ComPtr(const ComPtr& o) : p_(o.p_) { if (p_) p_->AddRef(); }
  ComPtr(ComPtr&& o) noexcept : p_(o.p_) { o.p_ = nullptr; }
  ComPtr& operator=(const ComPtr& o) {
    if (this != &o) { reset(); p_ = o.p_; if (p_) p_->AddRef(); }
    return *this;
  }
  ComPtr& operator=(ComPtr&& o) noexcept {
    if (this != &o) { reset(); p_ = o.p_; o.p_ = nullptr; }
    return *this;
  }
  T* get() const { return p_; }
  T* operator->() const { return p_; }
  T** operator&() { reset(); return &p_; }
  T** GetAddressOf() { reset(); return &p_; }
  void** put_void() { reset(); return reinterpret_cast<void**>(&p_); }
  void reset() { if (p_) { T* tmp = p_; p_ = nullptr; tmp->Release(); } }
  explicit operator bool() const { return p_ != nullptr; }
  template<typename U>
  HRESULT As(ComPtr<U>* out) const {
    if (!p_ || !out) return E_POINTER;
    return p_->QueryInterface(__uuidof(U), out->put_void());
  }
private:
  T* p_{nullptr};
};

namespace voicecraft::audio {

namespace {

std::string get_process_name_from_pid(DWORD pid) {
  char filename[MAX_PATH] = {0};
  HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (hProcess) {
    DWORD size = MAX_PATH;
    if (QueryFullProcessImageNameA(hProcess, 0, filename, &size)) {
      CloseHandle(hProcess);
      std::string fullPath(filename);
      size_t lastSlash = fullPath.find_last_of("\\/");
      if (lastSlash != std::string::npos) {
        return fullPath.substr(lastSlash + 1);
      }
      return fullPath;
    }
    CloseHandle(hProcess);
  }
  return "";
}

} // namespace

class LoopbackSession::Impl {
public:
  Impl() = default;
  ~Impl() { stop(); }

  bool start(uint32_t process_id, uint32_t target_sample_rate, uint16_t target_channels, AudioCallback cb) {
    stop();
    callback_ = std::move(cb);
    target_sr_ = target_sample_rate;
    target_ch_ = target_channels;
    target_pid_ = process_id;
    is_running_ = true;

    worker_thread_ = std::thread([this]() {
      HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
      bool co_inited = SUCCEEDED(hr);

      run_capture_loop();

      if (co_inited) {
        CoUninitialize();
      }
    });

    return true;
  }

  void stop() {
    is_running_ = false;
    if (worker_thread_.joinable()) {
      worker_thread_.join();
    }
  }

  bool is_running() const { return is_running_; }
  const std::string& last_error() const { return last_error_; }

private:
  void run_capture_loop() {
    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator));
    if (FAILED(hr)) {
      last_error_ = "Failed to create MMDeviceEnumerator";
      return;
    }

    ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, &device);
    if (FAILED(hr)) {
      last_error_ = "Failed to get default audio endpoint";
      return;
    }

    ComPtr<IAudioClient> audio_client;
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, audio_client.put_void());
    if (FAILED(hr)) {
      last_error_ = "Failed to activate IAudioClient";
      return;
    }

    WAVEFORMATEX* mix_format = nullptr;
    hr = audio_client->GetMixFormat(&mix_format);
    if (FAILED(hr) || !mix_format) {
      last_error_ = "Failed to get mix format";
      return;
    }

    // 100ms buffer in 100ns units
    REFERENCE_TIME hnsBufferDuration = 1000000;
    DWORD streamFlags = AUDCLNT_STREAMFLAGS_LOOPBACK;

    hr = audio_client->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags, hnsBufferDuration, 0, mix_format, nullptr);
    if (FAILED(hr)) {
      CoTaskMemFree(mix_format);
      last_error_ = "Failed to initialize audio client with loopback";
      return;
    }

    ComPtr<IAudioCaptureClient> capture_client;
    hr = audio_client->GetService(IID_PPV_ARGS(&capture_client));
    if (FAILED(hr)) {
      CoTaskMemFree(mix_format);
      last_error_ = "Failed to get audio capture client";
      return;
    }

    hr = audio_client->Start();
    if (FAILED(hr)) {
      CoTaskMemFree(mix_format);
      last_error_ = "Failed to start audio client";
      return;
    }

    std::vector<float> pcm_buffer;
    pcm_buffer.reserve(4096);

    while (is_running_) {
      UINT32 packet_length = 0;
      hr = capture_client->GetNextPacketSize(&packet_length);
      if (FAILED(hr)) break;

      if (packet_length == 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
        continue;
      }

      BYTE* data = nullptr;
      UINT32 num_frames = 0;
      DWORD flags = 0;

      hr = capture_client->GetBuffer(&data, &num_frames, &flags, nullptr, nullptr);
      if (SUCCEEDED(hr)) {
        pcm_buffer.resize(num_frames);

        if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
          std::fill(pcm_buffer.begin(), pcm_buffer.end(), 0.0f);
        } else {
          const float* src = reinterpret_cast<const float*>(data);
          WORD channels = mix_format->nChannels;
          if (mix_format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT ||
             (mix_format->wFormatTag == WAVE_FORMAT_EXTENSIBLE && mix_format->wBitsPerSample == 32)) {
            // Downmix to mono float32
            for (UINT32 i = 0; i < num_frames; ++i) {
              float sum = 0.0f;
              for (WORD c = 0; c < channels; ++c) {
                sum += src[i * channels + c];
              }
              pcm_buffer[i] = sum / static_cast<float>(channels);
            }
          } else if (mix_format->wBitsPerSample == 16) {
            // 16-bit PCM to float32
            const int16_t* src16 = reinterpret_cast<const int16_t*>(data);
            for (UINT32 i = 0; i < num_frames; ++i) {
              float sum = 0.0f;
              for (WORD c = 0; c < channels; ++c) {
                sum += static_cast<float>(src16[i * channels + c]) / 32768.0f;
              }
              pcm_buffer[i] = sum / static_cast<float>(channels);
            }
          } else {
            std::fill(pcm_buffer.begin(), pcm_buffer.end(), 0.0f);
          }
        }

        if (callback_ && !pcm_buffer.empty()) {
          callback_(pcm_buffer.data(), static_cast<uint32_t>(pcm_buffer.size()));
        }

        capture_client->ReleaseBuffer(num_frames);
      }
    }

    audio_client->Stop();
    CoTaskMemFree(mix_format);
  }

  std::atomic<bool> is_running_{false};
  std::thread worker_thread_;
  AudioCallback callback_;
  uint32_t target_sr_{48000};
  uint16_t target_ch_{1};
  uint32_t target_pid_{0};
  std::string last_error_;
};

LoopbackSession::LoopbackSession() : impl_(std::make_unique<Impl>()) {}
LoopbackSession::~LoopbackSession() = default;

bool LoopbackSession::start(uint32_t process_id, uint32_t sample_rate, uint16_t channels, AudioCallback cb) {
  return impl_->start(process_id, sample_rate, channels, std::move(cb));
}

void LoopbackSession::stop() {
  impl_->stop();
}

bool LoopbackSession::is_running() const {
  return impl_->is_running();
}

const std::string& LoopbackSession::last_error() const {
  return impl_->last_error();
}

std::vector<AudioProcessInfo> LoopbackSession::list_audio_processes() {
  std::vector<AudioProcessInfo> result;
  std::unordered_set<uint32_t> seen_pids;

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool co_inited = SUCCEEDED(hr);

  ComPtr<IMMDeviceEnumerator> enumerator;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator));
  if (SUCCEEDED(hr)) {
    ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, &device);
    if (SUCCEEDED(hr)) {
      ComPtr<IAudioSessionManager2> session_manager;
      hr = device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, session_manager.put_void());
      if (SUCCEEDED(hr)) {
        ComPtr<IAudioSessionEnumerator> session_enum;
        hr = session_manager->GetSessionEnumerator(&session_enum);
        if (SUCCEEDED(hr)) {
          int count = 0;
          session_enum->GetCount(&count);
          for (int i = 0; i < count; ++i) {
            ComPtr<IAudioSessionControl> control;
            if (SUCCEEDED(session_enum->GetSession(i, &control))) {
              ComPtr<IAudioSessionControl2> control2;
              if (SUCCEEDED(control->QueryInterface(__uuidof(IAudioSessionControl2), control2.put_void()))) {
                DWORD pid = 0;
                if (SUCCEEDED(control2->GetProcessId(&pid)) && pid > 0) {
                  if (seen_pids.find(pid) == seen_pids.end()) {
                    seen_pids.insert(pid);
                    std::string name = get_process_name_from_pid(pid);
                    if (!name.empty()) {
                      AudioProcessInfo info;
                      info.pid = pid;
                      info.name = name;
                      info.icon = "";
                      result.push_back(std::move(info));
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (co_inited) {
    CoUninitialize();
  }

  return result;
}

} // namespace voicecraft::audio

#else // !_WIN32

namespace voicecraft::audio {

class LoopbackSession::Impl {
public:
  bool start(uint32_t, uint32_t, uint16_t, AudioCallback) { return false; }
  void stop() {}
  bool is_running() const { return false; }
  const std::string& last_error() const { return err_; }
private:
  std::string err_{"Loopback only supported on Windows"};
};

LoopbackSession::LoopbackSession() : impl_(std::make_unique<Impl>()) {}
LoopbackSession::~LoopbackSession() = default;
bool LoopbackSession::start(uint32_t p, uint32_t sr, uint16_t c, AudioCallback cb) {
  return impl_->start(p, sr, c, std::move(cb));
}
void LoopbackSession::stop() { impl_->stop(); }
bool LoopbackSession::is_running() const { return impl_->is_running(); }
const std::string& LoopbackSession::last_error() const { return impl_->last_error(); }
std::vector<AudioProcessInfo> LoopbackSession::list_audio_processes() { return {}; }

} // namespace voicecraft::audio

#endif
