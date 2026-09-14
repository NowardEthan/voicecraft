#include "loopback_wasapi.h"

#ifdef _WIN32

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include "audioclientactivationparams_compat.h"
#include <audiopolicy.h>
#include <psapi.h>
#include <propidl.h>
#include <mmreg.h>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "mmdevapi.lib")

template<typename T>
class ComPtr {
public:
  ComPtr() : p_(nullptr) {}
  explicit ComPtr(T* p) : p_(p) { if (p_) p_->AddRef(); }
  ~ComPtr() { reset(); }
  ComPtr(const ComPtr&) = delete;
  ComPtr& operator=(const ComPtr&) = delete;
  ComPtr(ComPtr&& o) noexcept : p_(o.p_) { o.p_ = nullptr; }
  ComPtr& operator=(ComPtr&& o) noexcept {
    if (this != &o) { reset(); p_ = o.p_; o.p_ = nullptr; }
    return *this;
  }
  T* get() const { return p_; }
  T* operator->() const { return p_; }
  T** GetAddressOf() { reset(); return &p_; }
  void** put_void() { reset(); return reinterpret_cast<void**>(&p_); }
  void reset() { if (p_) { T* tmp = p_; p_ = nullptr; tmp->Release(); } }
  explicit operator bool() const { return p_ != nullptr; }
private:
  T* p_{nullptr};
};

namespace voicecraft::audio {
namespace {

std::string get_process_name_from_pid(DWORD pid) {
  char filename[MAX_PATH] = {0};
  HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!hProcess) return "";
  DWORD size = MAX_PATH;
  std::string result;
  if (QueryFullProcessImageNameA(hProcess, 0, filename, &size)) {
    std::string fullPath(filename);
    size_t lastSlash = fullPath.find_last_of("\\/");
    result = (lastSlash != std::string::npos) ? fullPath.substr(lastSlash + 1) : fullPath;
  }
  CloseHandle(hProcess);
  return result;
}

class ActivateCompletionHandler : public IActivateAudioInterfaceCompletionHandler {
public:
  explicit ActivateCompletionHandler(HANDLE done_event)
    : ref_(1), done_event_(done_event), activate_hr_(E_FAIL), audio_client_(nullptr) {}

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (!ppv) return E_POINTER;
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *ppv = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }

  ULONG STDMETHODCALLTYPE AddRef() override {
    return static_cast<ULONG>(InterlockedIncrement(&ref_));
  }

  ULONG STDMETHODCALLTYPE Release() override {
    LONG v = InterlockedDecrement(&ref_);
    if (v == 0) delete this;
    return static_cast<ULONG>(v);
  }

  HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT hrActivate = E_FAIL;
    IUnknown* unk = nullptr;
    if (operation) {
      operation->GetActivateResult(&hrActivate, &unk);
    }
    activate_hr_ = hrActivate;
    if (SUCCEEDED(hrActivate) && unk) {
      IAudioClient* client = nullptr;
      if (SUCCEEDED(unk->QueryInterface(__uuidof(IAudioClient), reinterpret_cast<void**>(&client)))) {
        if (audio_client_) audio_client_->Release();
        audio_client_ = client;
      } else {
        activate_hr_ = E_NOINTERFACE;
      }
      unk->Release();
    }
    if (done_event_) SetEvent(done_event_);
    return S_OK;
  }

  HRESULT activate_hr() const { return activate_hr_; }

  IAudioClient* take_client() {
    IAudioClient* c = audio_client_;
    audio_client_ = nullptr;
    return c;
  }

private:
  ~ActivateCompletionHandler() {
    if (audio_client_) audio_client_->Release();
  }

  LONG ref_;
  HANDLE done_event_;
  HRESULT activate_hr_;
  IAudioClient* audio_client_;
};

} // namespace

class LoopbackSession::Impl {
public:
  Impl() = default;
  ~Impl() { stop(); }

  bool start(uint32_t process_id, uint32_t target_sample_rate, uint16_t target_channels, AudioCallback cb) {
    stop();
    if (process_id == 0) {
      last_error_ = "pid-not-found";
      return false;
    }
    callback_ = std::move(cb);
    target_sr_ = target_sample_rate ? target_sample_rate : 48000;
    target_ch_ = target_channels ? target_channels : 1;
    target_pid_ = process_id;
    is_running_ = true;
    start_ok_ = false;
    start_event_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);

    worker_thread_ = std::thread([this]() {
      HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
      bool co_inited = SUCCEEDED(hr) || hr == S_FALSE;
      run_capture_loop();
      if (co_inited) CoUninitialize();
    });

    if (start_event_) {
      WaitForSingleObject(start_event_, 5000);
    }
    if (!start_ok_) {
      is_running_ = false;
      if (worker_thread_.joinable()) worker_thread_.join();
      if (start_event_) { CloseHandle(start_event_); start_event_ = nullptr; }
      if (last_error_.empty()) last_error_ = "wasapi-activate-failed";
      return false;
    }
    return true;
  }

  void stop() {
    is_running_ = false;
    if (worker_thread_.joinable()) worker_thread_.join();
    if (start_event_) { CloseHandle(start_event_); start_event_ = nullptr; }
  }

  bool is_running() const { return is_running_; }
  const std::string& last_error() const { return last_error_; }
  const std::string& last_mode() const { return capture_mode_; }

private:
  void signal_start(bool ok) {
    start_ok_ = ok;
    if (start_event_) SetEvent(start_event_);
  }

  bool activate_process_loopback(IAudioClient** out_client) {
    *out_client = nullptr;
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!done) {
      last_error_ = "create-event-failed";
      return false;
    }

    AUDIOCLIENT_ACTIVATION_PARAMS activation = {};
    activation.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    activation.ProcessLoopbackParams.TargetProcessId = static_cast<DWORD>(target_pid_);
    // INCLUDE tree — browsers (Opera/Chrome) play YouTube in child processes.
    activation.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

    PROPVARIANT activateParams;
    PropVariantInit(&activateParams);
    activateParams.vt = VT_BLOB;
    activateParams.blob.cbSize = sizeof(activation);
    activateParams.blob.pBlobData = reinterpret_cast<BYTE*>(&activation);

    // ref=1 from ctor; ActivateAudioInterfaceAsync AddRefs; we keep ours until after Wait.
    ActivateCompletionHandler* handler = new ActivateCompletionHandler(done);

    ComPtr<IActivateAudioInterfaceAsyncOperation> asyncOp;
    HRESULT hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
      __uuidof(IAudioClient),
      &activateParams,
      handler,
      asyncOp.GetAddressOf());

    if (FAILED(hr)) {
      handler->Release();
      CloseHandle(done);
      char buf[64];
      std::snprintf(buf, sizeof(buf), "wasapi-0x%08lX", static_cast<unsigned long>(hr));
      last_error_ = buf;
      return false;
    }

    DWORD wait = WaitForSingleObject(done, 4000);
    CloseHandle(done);

    if (wait != WAIT_OBJECT_0) {
      handler->Release();
      last_error_ = "wasapi-activate-timeout";
      return false;
    }

    hr = handler->activate_hr();
    if (FAILED(hr)) {
      handler->Release();
      char buf[64];
      std::snprintf(buf, sizeof(buf), "wasapi-0x%08lX", static_cast<unsigned long>(hr));
      last_error_ = buf;
      return false;
    }

    *out_client = handler->take_client();
    handler->Release();
    if (!*out_client) {
      last_error_ = "wasapi-no-client";
      return false;
    }
    return true;
  }

  void run_capture_loop() {
    IAudioClient* raw_client = nullptr;
    bool used_process = activate_process_loopback(&raw_client);
    if (!used_process) {
      // Browsers (Opera/Chrome) often play via a utility PID outside the window
      // tree — fall back to endpoint loopback so share still has audio.
      if (!activate_endpoint_loopback(&raw_client)) {
        signal_start(false);
        return;
      }
      capture_mode_ = "system";
      last_error_.clear();
    } else {
      capture_mode_ = "process";
    }
    ComPtr<IAudioClient> audio_client(raw_client);
    raw_client->Release();

    WAVEFORMATEX format = {};
    WAVEFORMATEX* mix = nullptr;
    if (capture_mode_ == "system") {
      HRESULT ghr = audio_client->GetMixFormat(&mix);
      if (SUCCEEDED(ghr) && mix) {
        format = *mix;
        // We'll downmix from mix channels below; keep mix for free later.
      }
    }
    if (!mix) {
      format = {};
      format.wFormatTag = WAVE_FORMAT_PCM;
      format.nChannels = 2;
      format.nSamplesPerSec = target_sr_ >= 44100 ? target_sr_ : 48000;
      format.wBitsPerSample = 16;
      format.nBlockAlign = static_cast<WORD>(format.nChannels * format.wBitsPerSample / 8);
      format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
      format.cbSize = 0;
    }

    REFERENCE_TIME hnsBufferDuration = 1000000; // 100ms
    DWORD streamFlags = AUDCLNT_STREAMFLAGS_LOOPBACK;
    if (capture_mode_ == "process") {
      streamFlags |= AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM;
    }

    HRESULT hr = audio_client->Initialize(
      AUDCLNT_SHAREMODE_SHARED,
      streamFlags,
      hnsBufferDuration,
      0,
      mix ? mix : &format,
      nullptr);

    if (FAILED(hr) && mix) {
      // Retry with hardcoded PCM if mix format init failed.
      CoTaskMemFree(mix);
      mix = nullptr;
      format = {};
      format.wFormatTag = WAVE_FORMAT_PCM;
      format.nChannels = 2;
      format.nSamplesPerSec = 48000;
      format.wBitsPerSample = 16;
      format.nBlockAlign = 4;
      format.nAvgBytesPerSec = 192000;
      hr = audio_client->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
        hnsBufferDuration,
        0,
        &format,
        nullptr);
    }

    if (FAILED(hr)) {
      if (mix) CoTaskMemFree(mix);
      char buf[64];
      std::snprintf(buf, sizeof(buf), "wasapi-init-0x%08lX", static_cast<unsigned long>(hr));
      last_error_ = buf;
      signal_start(false);
      return;
    }

    ComPtr<IAudioCaptureClient> capture_client;
    hr = audio_client->GetService(__uuidof(IAudioCaptureClient), capture_client.put_void());
    if (FAILED(hr)) {
      if (mix) CoTaskMemFree(mix);
      last_error_ = "wasapi-capture-service";
      signal_start(false);
      return;
    }

    hr = audio_client->Start();
    if (FAILED(hr)) {
      if (mix) CoTaskMemFree(mix);
      last_error_ = "wasapi-start-failed";
      signal_start(false);
      return;
    }

    signal_start(true);

    const WORD channels = mix ? mix->nChannels : format.nChannels;
    const bool is_float = mix && (
      mix->wFormatTag == WAVE_FORMAT_IEEE_FLOAT
      || (mix->wFormatTag == WAVE_FORMAT_EXTENSIBLE && mix->wBitsPerSample == 32));

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
      if (FAILED(hr)) break;

      pcm_buffer.resize(num_frames);
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::fill(pcm_buffer.begin(), pcm_buffer.end(), 0.0f);
      } else if (data) {
        if (is_float) {
          const float* src = reinterpret_cast<const float*>(data);
          for (UINT32 i = 0; i < num_frames; ++i) {
            float sum = 0.0f;
            for (WORD c = 0; c < channels; ++c) sum += src[i * channels + c];
            pcm_buffer[i] = sum / static_cast<float>(channels > 0 ? channels : 1);
          }
        } else {
          const int16_t* src16 = reinterpret_cast<const int16_t*>(data);
          for (UINT32 i = 0; i < num_frames; ++i) {
            float sum = 0.0f;
            for (WORD c = 0; c < channels; ++c) {
              sum += static_cast<float>(src16[i * channels + c]) / 32768.0f;
            }
            pcm_buffer[i] = sum / static_cast<float>(channels > 0 ? channels : 1);
          }
        }
      } else {
        std::fill(pcm_buffer.begin(), pcm_buffer.end(), 0.0f);
      }

      if (callback_ && !pcm_buffer.empty()) {
        callback_(pcm_buffer.data(), static_cast<uint32_t>(pcm_buffer.size()));
      }
      capture_client->ReleaseBuffer(num_frames);
    }

    audio_client->Stop();
    if (mix) CoTaskMemFree(mix);
  }

  bool activate_endpoint_loopback(IAudioClient** out_client) {
    *out_client = nullptr;
    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
      __uuidof(IMMDeviceEnumerator), enumerator.put_void());
    if (FAILED(hr)) {
      last_error_ = "endpoint-enumerator";
      return false;
    }
    ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, device.GetAddressOf());
    if (FAILED(hr)) {
      last_error_ = "endpoint-device";
      return false;
    }
    IAudioClient* client = nullptr;
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&client));
    if (FAILED(hr) || !client) {
      last_error_ = "endpoint-activate";
      return false;
    }
    *out_client = client;
    return true;
  }

  std::atomic<bool> is_running_{false};
  std::atomic<bool> start_ok_{false};
  HANDLE start_event_{nullptr};
  std::thread worker_thread_;
  AudioCallback callback_;
  uint32_t target_sr_{48000};
  uint16_t target_ch_{1};
  uint32_t target_pid_{0};
  std::string last_error_;
  std::string capture_mode_{"process"};
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

const std::string& LoopbackSession::last_mode() const {
  return impl_->last_mode();
}

std::vector<AudioProcessInfo> LoopbackSession::list_audio_processes() {
  std::vector<AudioProcessInfo> result;
  std::unordered_set<uint32_t> seen_pids;

  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool co_inited = SUCCEEDED(hr) || hr == S_FALSE;

  ComPtr<IMMDeviceEnumerator> enumerator;
  hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
    __uuidof(IMMDeviceEnumerator), enumerator.put_void());
  if (SUCCEEDED(hr)) {
    ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, device.GetAddressOf());
    if (SUCCEEDED(hr)) {
      ComPtr<IAudioSessionManager2> session_manager;
      hr = device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, session_manager.put_void());
      if (SUCCEEDED(hr)) {
        ComPtr<IAudioSessionEnumerator> session_enum;
        hr = session_manager->GetSessionEnumerator(session_enum.GetAddressOf());
        if (SUCCEEDED(hr)) {
          int count = 0;
          session_enum->GetCount(&count);
          for (int i = 0; i < count; ++i) {
            ComPtr<IAudioSessionControl> control;
            if (SUCCEEDED(session_enum->GetSession(i, control.GetAddressOf()))) {
              ComPtr<IAudioSessionControl2> control2;
              if (SUCCEEDED(control->QueryInterface(
                    __uuidof(IAudioSessionControl2), control2.put_void()))) {
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

  if (co_inited) CoUninitialize();
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
  const std::string& last_mode() const { return mode_; }
private:
  std::string err_{"Loopback only supported on Windows"};
  std::string mode_{"none"};
};

LoopbackSession::LoopbackSession() : impl_(std::make_unique<Impl>()) {}
LoopbackSession::~LoopbackSession() = default;
bool LoopbackSession::start(uint32_t p, uint32_t sr, uint16_t c, AudioCallback cb) {
  return impl_->start(p, sr, c, std::move(cb));
}
void LoopbackSession::stop() { impl_->stop(); }
bool LoopbackSession::is_running() const { return impl_->is_running(); }
const std::string& LoopbackSession::last_error() const { return impl_->last_error(); }
const std::string& LoopbackSession::last_mode() const { return impl_->last_mode(); }
std::vector<AudioProcessInfo> LoopbackSession::list_audio_processes() { return {}; }

} // namespace voicecraft::audio

#endif
