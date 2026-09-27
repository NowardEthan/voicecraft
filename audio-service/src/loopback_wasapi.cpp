#include "loopback_wasapi.h"

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <objidl.h>
#include <tlhelp32.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <propidl.h>
#include <mmreg.h>
#include "audioclientactivationparams_compat.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <memory>
#include <string>
#include <thread>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace voicecraft::audio {
namespace {

template <typename T> class ComPtr {
 public:
  ComPtr() = default;
  explicit ComPtr(T* p) : p_(p) { if (p_) p_->AddRef(); }
  ~ComPtr() { reset(); }
  ComPtr(const ComPtr&) = delete;
  ComPtr& operator=(const ComPtr&) = delete;
  ComPtr(ComPtr&& other) noexcept : p_(other.p_) { other.p_ = nullptr; }
  ComPtr& operator=(ComPtr&& other) noexcept {
    if (this != &other) { reset(); p_ = other.p_; other.p_ = nullptr; }
    return *this;
  }
  T* get() const { return p_; }
  T* operator->() const { return p_; }
  T** put() { reset(); return &p_; }
  void** put_void() { reset(); return reinterpret_cast<void**>(&p_); }
  void reset() { if (p_) { auto* p = p_; p_ = nullptr; p->Release(); } }
  explicit operator bool() const { return p_ != nullptr; }
 private:
  T* p_ = nullptr;
};

std::wstring process_image(DWORD pid) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return {};
  wchar_t path[MAX_PATH] = {};
  DWORD size = MAX_PATH;
  const bool ok = QueryFullProcessImageNameW(process, 0, path, &size) != FALSE;
  CloseHandle(process);
  return ok ? std::wstring(path, size) : std::wstring();
}

std::wstring image_basename(const std::wstring& path) {
  const auto pos = path.find_last_of(L"\\/");
  std::wstring name = pos == std::wstring::npos ? path : path.substr(pos + 1);
  std::transform(name.begin(), name.end(), name.begin(), towlower);
  return name;
}

std::unordered_map<DWORD, DWORD> process_parents() {
  std::unordered_map<DWORD, DWORD> parents;
  HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snapshot == INVALID_HANDLE_VALUE) return parents;
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  if (Process32FirstW(snapshot, &entry)) {
    do { parents[entry.th32ProcessID] = entry.th32ParentProcessID; }
    while (Process32NextW(snapshot, &entry));
  }
  CloseHandle(snapshot);
  return parents;
}

// A selected Chromium/Electron child can own the visible window while a sibling
// owns audio. Ascending same-image parents gives PROCESS_LOOPBACK a stable app
// root whose INCLUDE_TARGET_PROCESS_TREE includes both branches.
DWORD resolve_process_tree_root(DWORD selected_pid) {
  const auto selected_name = image_basename(process_image(selected_pid));
  if (selected_name.empty()) return selected_pid;
  const auto parents = process_parents();
  DWORD current = selected_pid;
  std::unordered_set<DWORD> seen;
  while (seen.insert(current).second) {
    const auto it = parents.find(current);
    if (it == parents.end() || it->second == 0 || it->second == current) break;
    const DWORD parent = it->second;
    if (image_basename(process_image(parent)) != selected_name) break;
    current = parent;
  }
  return current;
}

std::string process_name(DWORD pid) {
  const std::wstring wide = image_basename(process_image(pid));
  if (wide.empty()) return {};
  const int bytes = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, nullptr, 0, nullptr, nullptr);
  if (bytes <= 1) return {};
  std::string out(static_cast<size_t>(bytes - 1), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), -1, out.data(), bytes, nullptr, nullptr);
  return out;
}

class ActivateCompletionHandler final : public IActivateAudioInterfaceCompletionHandler,
                                        public IAgileObject {
 public:
  explicit ActivateCompletionHandler(HANDLE event) : event_(event) {}
  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID iid, void** value) override {
    if (!value) return E_POINTER;
    if (iid == __uuidof(IUnknown) || iid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *value = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
    } else if (iid == IID_IAgileObject) {
      *value = static_cast<IAgileObject*>(this);
    } else {
      *value = nullptr;
      return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return static_cast<ULONG>(InterlockedIncrement(&refs_)); }
  ULONG STDMETHODCALLTYPE Release() override {
    const LONG refs = InterlockedDecrement(&refs_);
    if (!refs) delete this;
    return static_cast<ULONG>(refs);
  }
  HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    IUnknown* unknown = nullptr;
    result_ = operation ? operation->GetActivateResult(&activate_result_, &unknown) : E_POINTER;
    if (SUCCEEDED(result_) && SUCCEEDED(activate_result_) && unknown) {
      result_ = unknown->QueryInterface(__uuidof(IAudioClient), reinterpret_cast<void**>(&client_));
    }
    if (unknown) unknown->Release();
    SetEvent(event_);
    return S_OK;
  }
  HRESULT result() const { return FAILED(result_) ? result_ : activate_result_; }
  IAudioClient* take_client() { auto* client = client_; client_ = nullptr; return client; }
 private:
  ~ActivateCompletionHandler() { if (client_) client_->Release(); }
  LONG refs_ = 1;
  HANDLE event_ = nullptr;
  HRESULT result_ = E_FAIL;
  HRESULT activate_result_ = E_FAIL;
  IAudioClient* client_ = nullptr;
};

std::string hresult_error(const char* prefix, HRESULT hr) {
  char text[80];
  std::snprintf(text, sizeof(text), "%s-0x%08lX", prefix, static_cast<unsigned long>(hr));
  return text;
}

}  // namespace

class LoopbackSession::Impl {
 public:
  ~Impl() { stop(); }

  bool start(DWORD process_id, uint32_t sample_rate, uint16_t channels, AudioCallback callback) {
    if (!process_id) { last_error_ = "pid-not-found"; return false; }
    return start_worker(resolve_process_tree_root(process_id), false, sample_rate, channels,
                        std::move(callback));
  }

  bool start_system_excluding_process(DWORD excluded_pid, uint32_t sample_rate, uint16_t channels,
                                      AudioCallback callback) {
    if (!excluded_pid) { last_error_ = "excluded-pid-required"; return false; }
    return start_worker(resolve_process_tree_root(excluded_pid), true, sample_rate, channels,
                        std::move(callback));
  }

  void stop() {
    running_ = false;
    if (worker_.joinable()) worker_.join();
    if (started_event_) { CloseHandle(started_event_); started_event_ = nullptr; }
  }

  bool is_running() const { return running_; }
  const std::string& last_error() const { return last_error_; }
  const std::string& last_mode() const { return mode_; }

 private:
  bool start_worker(DWORD pid, bool exclude, uint32_t sample_rate, uint16_t channels,
                    AudioCallback callback) {
    stop();
    target_pid_ = pid;
    exclude_ = exclude;
    sample_rate_ = sample_rate ? sample_rate : 48000;
    channels_ = channels ? channels : 1;
    callback_ = std::move(callback);
    last_error_.clear();
    mode_.clear();
    start_ok_ = false;
    started_event_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!started_event_) { last_error_ = "create-event-failed"; return false; }
    running_ = true;
    worker_ = std::thread([this] {
      const HRESULT init = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
      run();
      if (SUCCEEDED(init)) CoUninitialize();
    });
    const DWORD wait = WaitForSingleObject(started_event_, 8000);
    if (wait != WAIT_OBJECT_0) last_error_ = "loopback-start-timeout";
    if (wait != WAIT_OBJECT_0 || !start_ok_) {
      running_ = false;
      if (worker_.joinable()) worker_.join();
      if (last_error_.empty()) last_error_ = "loopback-start-failed";
      return false;
    }
    return true;
  }

  void signal_started(bool ok) {
    start_ok_ = ok;
    if (started_event_) SetEvent(started_event_);
  }

  bool activate(IAudioClient** output) {
    *output = nullptr;
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!done) { last_error_ = "create-activation-event-failed"; return false; }

    AUDIOCLIENT_ACTIVATION_PARAMS params{};
    params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    params.ProcessLoopbackParams.TargetProcessId = target_pid_;
    params.ProcessLoopbackParams.ProcessLoopbackMode = exclude_
      ? PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE
      : PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
    PROPVARIANT variant;
    PropVariantInit(&variant);
    variant.vt = VT_BLOB;
    variant.blob.cbSize = sizeof(params);
    variant.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

    auto* handler = new ActivateCompletionHandler(done);
    ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
    HRESULT hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
      __uuidof(IAudioClient), &variant, handler, operation.put());
    if (SUCCEEDED(hr) && WaitForSingleObject(done, 6000) != WAIT_OBJECT_0) {
      hr = HRESULT_FROM_WIN32(ERROR_TIMEOUT);
    } else if (SUCCEEDED(hr)) {
      hr = handler->result();
    }
    if (SUCCEEDED(hr)) *output = handler->take_client();
    handler->Release();
    CloseHandle(done);
    if (FAILED(hr) || !*output) {
      last_error_ = hresult_error(exclude_ ? "wasapi-exclude-activate" : "wasapi-process-activate", hr);
      return false;
    }
    return true;
  }

  void run() {
    IAudioClient* raw_client = nullptr;
    if (!activate(&raw_client)) { signal_started(false); return; }
    ComPtr<IAudioClient> client(raw_client);
    raw_client->Release();

    WAVEFORMATEX format{};
    format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
    format.nChannels = 1;
    format.nSamplesPerSec = 48000;
    format.wBitsPerSample = 32;
    format.nBlockAlign = static_cast<WORD>(
      format.nChannels * format.wBitsPerSample / 8);
    format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
    format.cbSize = 0;

    HRESULT hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
      AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
      1000000, 0, &format, nullptr);
    if (FAILED(hr)) {
      last_error_ = hresult_error("wasapi-initialize", hr);
      signal_started(false);
      return;
    }

    ComPtr<IAudioCaptureClient> capture;
    hr = client->GetService(__uuidof(IAudioCaptureClient), capture.put_void());
    if (FAILED(hr) || !capture) {
      last_error_ = hresult_error("wasapi-capture-service", hr);
      signal_started(false);
      return;
    }
    hr = client->Start();
    if (FAILED(hr)) {
      last_error_ = hresult_error("wasapi-start", hr);
      signal_started(false);
      return;
    }

    mode_ = exclude_ ? "system-excluding-process-tree" : "process-tree";
    signal_started(true);  // Only after Initialize + GetService + Start succeeded.

    const WORD source_channels = std::max<WORD>(1, format.nChannels);
    const bool source_float = format.wFormatTag == WAVE_FORMAT_IEEE_FLOAT;
    std::vector<float> mono;
    while (running_) {
      UINT32 packet_frames = 0;
      hr = capture->GetNextPacketSize(&packet_frames);
      if (FAILED(hr)) { last_error_ = hresult_error("wasapi-next-packet", hr); break; }
      if (!packet_frames) { std::this_thread::sleep_for(std::chrono::milliseconds(5)); continue; }
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) { last_error_ = hresult_error("wasapi-get-buffer", hr); break; }
      mono.assign(frames, 0.0f);
      if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && data) {
        if (source_float) {
          const auto* input = reinterpret_cast<const float*>(data);
          for (UINT32 i = 0; i < frames; ++i) {
            for (WORD c = 0; c < source_channels; ++c) mono[i] += input[i * source_channels + c];
            mono[i] /= source_channels;
          }
        } else if (format.wBitsPerSample == 16) {
          const auto* input = reinterpret_cast<const int16_t*>(data);
          for (UINT32 i = 0; i < frames; ++i) {
            for (WORD c = 0; c < source_channels; ++c) mono[i] += input[i * source_channels + c] / 32768.0f;
            mono[i] /= source_channels;
          }
        }
      }
      capture->ReleaseBuffer(frames);
      if (callback_ && !mono.empty()) callback_(mono.data(), static_cast<uint32_t>(mono.size()));
    }
    client->Stop();
    running_ = false;
  }

  std::atomic<bool> running_{false};
  std::atomic<bool> start_ok_{false};
  HANDLE started_event_ = nullptr;
  std::thread worker_;
  AudioCallback callback_;
  DWORD target_pid_ = 0;
  uint32_t sample_rate_ = 48000;
  uint16_t channels_ = 1;
  bool exclude_ = false;
  std::string last_error_;
  std::string mode_;
};

LoopbackSession::LoopbackSession() : impl_(std::make_unique<Impl>()) {}
LoopbackSession::~LoopbackSession() = default;
bool LoopbackSession::start(uint32_t pid, uint32_t rate, uint16_t channels, AudioCallback cb) {
  return impl_->start(pid, rate, channels, std::move(cb));
}
bool LoopbackSession::start_system_excluding_process(uint32_t pid, uint32_t rate,
    uint16_t channels, AudioCallback cb) {
  return impl_->start_system_excluding_process(pid, rate, channels, std::move(cb));
}
void LoopbackSession::stop() { impl_->stop(); }
bool LoopbackSession::is_running() const { return impl_->is_running(); }
const std::string& LoopbackSession::last_error() const { return impl_->last_error(); }
const std::string& LoopbackSession::last_mode() const { return impl_->last_mode(); }

std::vector<AudioProcessInfo> LoopbackSession::list_audio_processes() {
  std::vector<AudioProcessInfo> result;
  std::unordered_set<DWORD> seen;
  const HRESULT init = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  ComPtr<IMMDeviceEnumerator> devices;
  if (SUCCEEDED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
      __uuidof(IMMDeviceEnumerator), devices.put_void()))) {
    ComPtr<IMMDevice> endpoint;
    if (SUCCEEDED(devices->GetDefaultAudioEndpoint(eRender, eMultimedia, endpoint.put()))) {
      ComPtr<IAudioSessionManager2> manager;
      if (SUCCEEDED(endpoint->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr,
          manager.put_void()))) {
        ComPtr<IAudioSessionEnumerator> sessions;
        if (SUCCEEDED(manager->GetSessionEnumerator(sessions.put()))) {
          int count = 0;
          sessions->GetCount(&count);
          for (int i = 0; i < count; ++i) {
            ComPtr<IAudioSessionControl> control;
            if (FAILED(sessions->GetSession(i, control.put()))) continue;
            ComPtr<IAudioSessionControl2> control2;
            if (FAILED(control->QueryInterface(__uuidof(IAudioSessionControl2), control2.put_void()))) continue;
            DWORD pid = 0;
            if (FAILED(control2->GetProcessId(&pid)) || !pid) continue;
            pid = resolve_process_tree_root(pid);
            if (!seen.insert(pid).second) continue;
            const auto name = process_name(pid);
            if (!name.empty()) result.push_back({pid, name, ""});
          }
        }
      }
    }
  }
  if (SUCCEEDED(init)) CoUninitialize();
  return result;
}

}  // namespace voicecraft::audio
#else
namespace voicecraft::audio {
class LoopbackSession::Impl {
 public:
  bool start(uint32_t, uint32_t, uint16_t, AudioCallback) { return false; }
  bool start_system_excluding_process(uint32_t, uint32_t, uint16_t, AudioCallback) { return false; }
  void stop() {}
  bool is_running() const { return false; }
  const std::string& last_error() const { return error_; }
  const std::string& last_mode() const { return mode_; }
 private:
  std::string error_{"loopback-windows-only"};
  std::string mode_{"none"};
};
LoopbackSession::LoopbackSession() : impl_(std::make_unique<Impl>()) {}
LoopbackSession::~LoopbackSession() = default;
bool LoopbackSession::start(uint32_t p, uint32_t r, uint16_t c, AudioCallback cb) { return impl_->start(p, r, c, std::move(cb)); }
bool LoopbackSession::start_system_excluding_process(uint32_t p, uint32_t r, uint16_t c, AudioCallback cb) { return impl_->start_system_excluding_process(p, r, c, std::move(cb)); }
void LoopbackSession::stop() { impl_->stop(); }
bool LoopbackSession::is_running() const { return impl_->is_running(); }
const std::string& LoopbackSession::last_error() const { return impl_->last_error(); }
const std::string& LoopbackSession::last_mode() const { return impl_->last_mode(); }
std::vector<AudioProcessInfo> LoopbackSession::list_audio_processes() { return {}; }
}  // namespace voicecraft::audio
#endif
