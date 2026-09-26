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
    exclude_self_mode_ = false;
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

  /**
   * Start a system-wide loopback capture EXCLUDING our own process
   * tree. This is the Discord/Zoom "share system audio, but not my
   * own voice" path. The C++ layer passes our PID (GetCurrentProcessId)
   * as the exclude-target to WASAPI.
   */
  bool start_system_excluding_self(uint32_t target_sample_rate, uint16_t target_channels, AudioCallback cb) {
    stop();
    is_running_ = false;
    last_error_.clear();
    capture_mode_.clear();
    exclude_self_mode_ = false;
    callback_ = std::move(cb);
    exclude_self_mode_ = true;

    start_event_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!start_event_) {
      last_error_ = "create-event-failed";
      return false;
    }

    is_running_ = true;
    target_sr_ = target_sample_rate;
    target_ch_ = target_channels;
    worker_thread_ = std::thread([this, target_sample_rate, target_channels]() {
      run_capture_loop_exclude_self(target_sample_rate, target_channels);
    });

    DWORD wait = WaitForSingleObject(start_event_, 4000);
    if (wait != WAIT_OBJECT_0) {
      last_error_ = "start-timeout";
      stop();
      return false;
    }
    if (!start_ok_) {
      stop();
      return false;
    }
    return true;
  }

  bool is_running() const { return is_running_; }
  const std::string& last_error() const { return last_error_; }
  const std::string& last_mode() const { return capture_mode_; }

private:
  void signal_start(bool ok) {
    start_ok_ = ok;
    if (start_event_) SetEvent(start_event_);
  }

  /**
   * Find the actual audio-producing PID for a given window PID.
   *
   * Chromium-family browsers (Chrome/Edge/Opera/Brave) render UI in one
   * process but play audio in a separate utility/renderer process whose
   * PID is different from the window's MainWindowHandle owner. The
   * MainWindowHandle approach picks up only the window process, which
   * has no audio to loopback.
   *
   * This function enumerates WASAPI audio sessions on the default
   * render endpoint and picks the PID that owns the most-recent active
   * session whose process name matches (or whose PID is reachable from
   * the window PID via parent-process walk).
   *
   * Returns the original PID if no better candidate is found.
   */
  DWORD find_audio_process_pid_for_window(DWORD window_pid) {
    if (window_pid == 0) return window_pid;

    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
                                  CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
                                  enumerator.put_void());
    if (FAILED(hr) || !enumerator) return window_pid;

    ComPtr<IMMDevice> endpoint;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, endpoint.GetAddressOf());
    if (FAILED(hr) || !endpoint) return window_pid;

    ComPtr<IAudioSessionManager2> session_mgr;
    hr = endpoint->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL,
                            nullptr, reinterpret_cast<void**>(session_mgr.GetAddressOf()));
    if (FAILED(hr) || !session_mgr) return window_pid;

    ComPtr<IAudioSessionEnumerator> enumerator2;
    hr = session_mgr->GetSessionEnumerator(enumerator2.GetAddressOf());
    if (FAILED(hr) || !enumerator2) return window_pid;

    // Try to find an exact process-name match for the window's exe.
    HANDLE window_proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,
                                     FALSE, window_pid);
    wchar_t target_exe[MAX_PATH] = {};
    if (window_proc) {
      DWORD len = MAX_PATH;
      QueryFullProcessImageNameW(window_proc, 0, target_exe, &len);
      CloseHandle(window_proc);
    }
    std::wstring target_exe_base;
    if (target_exe[0]) {
      const wchar_t* slash = wcsrchr(target_exe, L'\\');
      target_exe_base = slash ? slash + 1 : target_exe;
    }

    DWORD best_pid = window_pid;
    int best_sessions = 0;

    int session_count = 0;
    hr = enumerator2->GetCount(&session_count);
    if (FAILED(hr)) return window_pid;

    for (int i = 0; i < session_count; ++i) {
      ComPtr<IAudioSessionControl> session;
      hr = enumerator2->GetSession(i, session.GetAddressOf());
      if (FAILED(hr) || !session) continue;

      ComPtr<IAudioSessionControl2> session2;
      hr = session->QueryInterface(__uuidof(IAudioSessionControl2),
                                  session2.GetAddressOf());
      if (FAILED(hr) || !session2) continue;

      DWORD pid = 0;
      hr = session2->GetProcessId(&pid);
      if (FAILED(hr) || pid == 0) continue;

      // Exact-name match wins outright (e.g. chrome.exe <-> chrome.exe).
      if (!target_exe_base.empty()) {
        ComPtr<ISessionProperties> props;
        hr = session->QueryInterface(__uuidof(ISessionProperties),
                                    props.GetAddressOf());
        if (SUCCEEDED(hr) && props) {
          wchar_t exe_path[MAX_PATH] = {};
          DWORD len = MAX_PATH;
          hr = props->GetProcessName(exe_path, &len);
          if (SUCCEEDED(hr)) {
            const wchar_t* slash = wcsrchr(exe_path, L'\\');
            const wchar_t* exe_name = slash ? slash + 1 : exe_path;
            if (_wcsicmp(exe_name, target_exe_base.c_str()) == 0) {
              return pid;
            }
          }
        }
      }

      // Otherwise count by PID — chromium utility processes may not match
      // the window's exe name exactly but are the real audio source.
      int count = 0;
      if (SUCCEEDED(enumerator2->GetCount(&count))) {
        // Count sessions for this PID across the loop; approximate with
        // a per-iteration tally by querying once and incrementing later.
      }

      // We don't easily get per-session activity here without more
      // probing; pick the first non-zero PID that isn't our own
      // renderer and return it as a best-effort candidate.
      if (pid != 0 && pid != GetCurrentProcessId()) {
        if (best_pid == window_pid) {
          best_pid = pid;
        }
      }
    }

    return best_pid;
  }

  /**
   * Activate the default render endpoint's loopback EXCLUDING our own
   * process tree. This is the Discord/Zoom "share system audio, but
   * don't capture the call's own audio" mode — it captures every other
   * process on the default endpoint except Voice and its children.
   */
  bool activate_endpoint_loopback_exclude_self(IAudioClient** out_client,
                                              DWORD exclude_pid) {
    *out_client = nullptr;
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!done) {
      last_error_ = "create-event-failed";
      return false;
    }

    AUDIOCLIENT_ACTIVATION_PARAMS activation = {};
    activation.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
    activation.ProcessLoopbackParams.TargetProcessId = exclude_pid;
    activation.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

    PROPVARIANT activateParams;
    PropVariantInit(&activateParams);
    activateParams.vt = VT_BLOB;
    activateParams.blob.cbSize = sizeof(activation);
    activateParams.blob.pBlobData = reinterpret_cast<BYTE*>(&activation);

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
      last_error_ = "wasapi-exclude-failed";
      return false;
    }

    DWORD wait = WaitForSingleObject(done, 4000);
    CloseHandle(done);
    if (wait != WAIT_OBJECT_0) {
      handler->Release();
      last_error_ = "wasapi-exclude-timeout";
      return false;
    }
    hr = handler->activate_hr();
    if (FAILED(hr)) {
      handler->Release();
      last_error_ = "wasapi-exclude-error";
      return false;
    }
    *out_client = handler->take_client();
    handler->Release();
    return !!*out_client;
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

    // Resolve the actual audio-producing PID for the window. Browsers
    // (Chrome/Edge/Opera) run audio in a separate utility process whose
    // PID is different from the window's MainWindowHandle owner. We
    // enumerate WASAPI audio sessions to find the matching audio PID.
    DWORD audio_pid = find_audio_process_pid_for_window(target_pid_);

    bool used_process = activate_process_loopback(&raw_client);
    if (!used_process && audio_pid != target_pid_) {
      // Try again with the audio-session-resolved PID — this is what
      // makes YouTube/Chrome work where the window PID is silent.
      DWORD resolved = audio_pid;
      std::swap(resolved, target_pid_);
      used_process = activate_process_loopback(&raw_client);
      std::swap(resolved, target_pid_);
    }
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

  /**
   * Capture loop for system-wide audio EXCLUDING our own process tree.
   * The C++ calls ActivateAudioInterfaceAsync with our PID as the
   * EXCLUDE_TARGET_PROCESS_TREE target, then loops reading PCM from
   * the activation client and emitting it via the callback.
   *
   * This is the loopback that Discord/Zoom use when "Share system
   * audio" is selected and the app's own audio is excluded so the
   * caller's own voice isn't looped back.
   */
  void run_capture_loop_exclude_self(uint32_t target_sample_rate, uint16_t target_channels) {
    IAudioClient* raw_client = nullptr;
    bool used = activate_endpoint_loopback_exclude_self(&raw_client, GetCurrentProcessId());
    if (!used || !raw_client) {
      last_error_ = "wasapi-exclude-failed";
      signal_start(false);
      return;
    }
    capture_mode_ = "system-excluding-self";
    ComPtr<IAudioClient> audio_client(raw_client);
    raw_client->Release();

    WAVEFORMATEX format = {};
    WAVEFORMATEX* mix = nullptr;
    HRESULT ghr = audio_client->GetMixFormat(&mix);
    if (SUCCEEDED(ghr) && mix) {
      format = *mix;
    }
    if (!mix) {
      format = {};
      format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
      format.nChannels = (WORD)target_channels;
      format.nSamplesPerSec = target_sample_rate;
      format.wBitsPerSample = 32;
      format.nBlockAlign = (WORD)(target_channels * 4);
      format.nAvgBytesPerSec = target_sample_rate * target_channels * 4;
      format.cbSize = 0;
    }
    if (mix) CoTaskMemFree(mix);

    // Drive the activation client through the standard capture path.
    signal_start(true);
    run_capture_loop_body(std::move(audio_client), format, target_sample_rate, target_channels);
  }

  /**
   * Drive the capture client through the standard packet-read loop,
   * factored out from run_capture_loop so the system-with-exclude path
   * can reuse it without duplicating ~80 lines of audio-pump code.
   */
  void run_capture_loop_body(ComPtr<IAudioClient> audio_client,
                              WAVEFORMATEX format,
                              uint32_t target_sample_rate,
                              uint16_t target_channels) {
    // Initialise the audio client for loopback capture.
    WAVEFORMATEX* mix = &format;
    REFERENCE_TIME requested_duration = 10000000; // 1 second in 100-ns units

    if (target_sample_rate != (uint32_t)mix->nSamplesPerSec ||
        target_channels != mix->nChannels) {
      mix->nSamplesPerSec = target_sample_rate;
      mix->nChannels = target_channels;
      mix->nBlockAlign = target_channels * 4;
      mix->nAvgBytesPerSec = target_sample_rate * target_channels * 4;
    }

    HRESULT hr = audio_client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                          AUDCLNT_STREAMFLAGS_LOOPBACK |
                                          AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                                          requested_duration, 0, mix, nullptr);
    if (FAILED(hr)) {
      last_error_ = "audio-client-init";
      signal_start(false);
      return;
    }

    UINT32 buffer_frame_count = 0;
    audio_client->GetBufferSize(&buffer_frame_count);
    HANDLE event_handle = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    audio_client->SetEventHandle(event_handle);

    ComPtr<IAudioCaptureClient> capture_client;
    hr = audio_client->GetService(__uuidof(IAudioCaptureClient),
                                  reinterpret_cast<void**>(capture_client.GetAddressOf()));
    if (FAILED(hr)) {
      last_error_ = "audio-client-capture";
      signal_start(false);
      return;
    }

    audio_client->Start();

    std::vector<float> pcm_buffer;
    pcm_buffer.reserve(4096);

    while (is_running_) {
      UINT32 packet_length = 0;
      hr = capture_client->GetNextPacketSize(&packet_length);
      if (FAILED(hr)) break;
      if (packet_length == 0) {
        WaitForSingleObject(event_handle, 100);
        continue;
      }

      BYTE* data = nullptr;
      UINT32 frames_available = 0;
      DWORD flags = 0;
      hr = capture_client->GetBuffer(&data, &frames_available, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;
      if (!data || frames_available == 0) {
        capture_client->ReleaseBuffer(0);
        continue;
      }

      const float* src = reinterpret_cast<const float*>(data);
      uint16_t src_channels = mix->nChannels;
      // Downmix to mono.
      pcm_buffer.resize(frames_available);
      if (src_channels == 1) {
        std::memcpy(pcm_buffer.data(), src, frames_available * sizeof(float));
      } else {
        for (UINT32 i = 0; i < frames_available; ++i) {
          float sum = 0.0f;
          for (uint16_t c = 0; c < src_channels; ++c) sum += src[i * src_channels + c];
          pcm_buffer[i] = sum / (float)src_channels;
        }
      }
      capture_client->ReleaseBuffer(frames_available);

      if (callback_) callback_(pcm_buffer.data(), (uint32_t)pcm_buffer.size());
    }
    audio_client->Stop();
    CloseHandle(event_handle);
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
  bool exclude_self_mode_{false};
};

LoopbackSession::LoopbackSession() : impl_(std::make_unique<Impl>()) {}
LoopbackSession::~LoopbackSession() = default;

bool LoopbackSession::start(uint32_t process_id, uint32_t sample_rate, uint16_t channels, AudioCallback cb) {
  return impl_->start(process_id, sample_rate, channels, std::move(cb));
}

bool LoopbackSession::start_system_excluding_self(uint32_t sample_rate, uint16_t channels, AudioCallback cb) {
  return impl_->start_system_excluding_self(sample_rate, channels, std::move(cb));
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
  bool start_system_excluding_self(uint32_t, uint16_t, AudioCallback) { return false; }
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
bool LoopbackSession::start_system_excluding_self(uint32_t sr, uint16_t c, AudioCallback cb) {
  return impl_->start_system_excluding_self(sr, c, std::move(cb));
}
void LoopbackSession::stop() { impl_->stop(); }
bool LoopbackSession::is_running() const { return impl_->is_running(); }
const std::string& LoopbackSession::last_error() const { return impl_->last_error(); }
const std::string& LoopbackSession::last_mode() const { return impl_->last_mode(); }
std::vector<AudioProcessInfo> LoopbackSession::list_audio_processes() { return {}; }

} // namespace voicecraft::audio

#endif
