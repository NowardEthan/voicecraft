#include "capture.h"
#include "loopback_wasapi.h"

#include <atomic>
#include <csignal>
#include <cstdio>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>

namespace {
constexpr int kProtocolVersion = 2;
constexpr const char* kServiceVersion = "1.0.0";
std::atomic<bool> g_shutdown{false};
void on_signal(int) { g_shutdown = true; }
void emit(const std::string& json) { std::fprintf(stderr, "%s\n", json.c_str()); std::fflush(stderr); }
std::string escape_json(const std::string& value) {
  std::string out;
  for (const char c : value) {
    if (c == '"' || c == '\\') out.push_back('\\');
    if (c == '\n') { out += "\\n"; continue; }
    if (c == '\r') { out += "\\r"; continue; }
    out.push_back(c);
  }
  return out;
}
void error(const std::string& message, const std::string& session_id = {}) {
  emit("{\"type\":\"error\",\"message\":\"" + escape_json(message) + "\"" +
       (session_id.empty() ? "" : ",\"sessionId\":\"" + escape_json(session_id) + "\"") + "}");
}
std::string json_get(const std::string& json, const std::string& key) {
  const std::string needle = "\"" + key + "\"";
  auto pos = json.find(needle);
  if (pos == std::string::npos || (pos = json.find(':', pos + needle.size())) == std::string::npos) return {};
  pos = json.find_first_not_of(" \t\r\n", pos + 1);
  if (pos == std::string::npos) return {};
  if (json[pos] == '"') {
    const auto end = json.find('"', pos + 1);
    return end == std::string::npos ? std::string() : json.substr(pos + 1, end - pos - 1);
  }
  const auto end = json.find_first_of(",} \t\r\n", pos);
  return json.substr(pos, end == std::string::npos ? std::string::npos : end - pos);
}
int json_int(const std::string& json, const std::string& key, int fallback) {
  try { const auto value = json_get(json, key); return value.empty() ? fallback : std::stoi(value); }
  catch (...) { return fallback; }
}
bool json_bool(const std::string& json, const std::string& key, bool fallback) {
  const auto value = json_get(json, key);
  return value.empty() ? fallback : value == "true";
}
constexpr uint32_t kFrameMagic = 0x32414356;  // "VCA2" little-endian
constexpr uint32_t kSourceMicrophone = 1;
constexpr uint32_t kSourceLoopback = 2;
std::mutex g_stdout_mutex;
void write_audio(uint32_t source, const float* samples, uint32_t frames) {
  std::lock_guard<std::mutex> lock(g_stdout_mutex);
  const uint32_t header[] = {kFrameMagic, source, frames};
  std::fwrite(header, sizeof(uint32_t), 3, stdout);
  if (frames && samples) std::fwrite(samples, sizeof(float), frames, stdout);
  std::fflush(stdout);
}
void service_started() {
  emit("{\"type\":\"service-started\",\"version\":\"" + std::string(kServiceVersion) +
       "\",\"protocolVersion\":" + std::to_string(kProtocolVersion) +
       ",\"capabilities\":[\"microphone\",\"process-loopback-strict\",\"system-loopback-exclude-process-tree\",\"session-tagged-ipc\",\"source-tagged-frames-v2\",\"serialized-loopback\"]}");
}
void send_devices() {
  const auto devices = voicecraft::audio::CaptureSession::list_input_devices();
  std::ostringstream out;
  out << "{\"type\":\"device-list\",\"devices\":[";
  bool first = true;
  for (const auto& device : devices) {
    if (!first) out << ',';
    first = false;
    out << "{\"id\":\"" << escape_json(device.id) << "\",\"name\":\""
        << escape_json(device.name) << "\",\"isDefault\":" << (device.is_default ? "true" : "false") << '}';
  }
  out << "]}";
  emit(out.str());
}
void send_processes() {
  const auto processes = voicecraft::audio::LoopbackSession::list_audio_processes();
  std::ostringstream out;
  out << "{\"type\":\"process-list\",\"processes\":[";
  bool first = true;
  for (const auto& process : processes) {
    if (!first) out << ',';
    first = false;
    out << "{\"pid\":" << process.pid << ",\"name\":\"" << escape_json(process.name) << "\",\"icon\":\"\"}";
  }
  out << "]}";
  emit(out.str());
}
}  // namespace

int main() {
  std::signal(SIGINT, on_signal);
  std::signal(SIGTERM, on_signal);
  std::setvbuf(stdout, nullptr, _IONBF, 0);
  voicecraft::audio::CaptureSession microphone;
  voicecraft::audio::LoopbackSession loopback;
  service_started();

  std::string line;
  while (!g_shutdown && std::getline(std::cin, line)) {
    if (line.empty()) continue;
    const auto type = json_get(line, "type");
    if (type == "capabilities") {
      service_started();
    } else if (type == "list-devices") {
      send_devices();
    } else if (type == "list-processes") {
      send_processes();
    } else if (type == "start-loopback" || type == "start-loopback-system") {
      const auto session_id = json_get(line, "sessionId");
      if (session_id.empty()) { error("session-id-required"); continue; }
      if (loopback.is_running()) { error("loopback-session-busy", session_id); continue; }
      const uint32_t process_id = static_cast<uint32_t>(json_int(line,
        type == "start-loopback" ? "processId" : "excludedProcessId", 0));
      const auto loopback_audio = [](const float* samples, uint32_t frames) {
        write_audio(kSourceLoopback, samples, frames);
      };
      const bool ok = type == "start-loopback"
        ? loopback.start(process_id, 48000, 1, loopback_audio)
        : loopback.start_system_excluding_process(process_id, 48000, 1, loopback_audio);
      if (ok) {
        emit("{\"type\":\"loopback-started\",\"sessionId\":\"" + escape_json(session_id) +
             "\",\"mode\":\"" + loopback.last_mode() + "\",\"sampleRate\":48000,\"channels\":1}");
      } else {
        error(loopback.last_error(), session_id);
      }
    } else if (type == "stop-loopback") {
      const auto session_id = json_get(line, "sessionId");
      loopback.stop();
      emit("{\"type\":\"loopback-stopped\",\"sessionId\":\"" + escape_json(session_id) + "\"}");
    } else if (type == "start") {
      voicecraft::audio::CaptureConfig config;
      config.sample_rate = static_cast<uint32_t>(json_int(line, "sampleRate", 48000));
      config.channels = static_cast<uint16_t>(json_int(line, "channels", 1));
      config.enable_hpf = json_bool(line, "hpf", true);
      config.enable_agc = json_bool(line, "agc", true);
      config.enable_gate = json_bool(line, "gate", true);
      config.gate_threshold_db = static_cast<float>(json_int(line, "threshold", -45));
      config.device_id = json_get(line, "deviceId");
      config.frame_size_ms = static_cast<uint16_t>(json_int(line, "frameSizeMs", 20));
      const auto microphone_audio = [](const float* samples, uint32_t frames) {
        write_audio(kSourceMicrophone, samples, frames);
      };
      if (microphone.start(config, microphone_audio)) {
        emit("{\"type\":\"ready\",\"sampleRate\":" + std::to_string(config.sample_rate) +
             ",\"channels\":" + std::to_string(config.channels) + "}");
      } else error(microphone.last_error());
    } else if (type == "stop") {
      microphone.stop();
      emit("{\"type\":\"stopped\"}");
    } else if (type == "shutdown") {
      break;
    } else error("unknown-command:" + type);
  }
  loopback.stop();
  microphone.stop();
  emit("{\"type\":\"service-stopped\"}");
  return 0;
}
