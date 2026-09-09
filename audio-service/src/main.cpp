// VoiceCraft audio service — entry point.
//
// Protocol (newline-delimited JSON over stdin for commands, raw PCM
// chunks prefixed by a 4-byte little-endian size on stdout, JSON status
// events on stderr):
//
//   Commands (stdin):
//     {"type":"list-devices"}\n
//     {"type":"start","sampleRate":48000,"channels":1,"hpf":true,"agc":true,
//      "gate":true,"threshold":-45,"deviceId":""}\n
//     {"type":"stop"}\n
//     {"type":"shutdown"}\n
//
//   Audio output (stdout, raw binary):
//     [4-byte LE uint32 frame_size_in_samples]
//     [frame_size * 4 bytes float32 little-endian PCM, mono]
//     [next frame...]
//
//   Status events (stderr, JSON lines):
//     {"type":"ready","sampleRate":48000,"channels":1}
//     {"type":"error","message":"..."}
//     {"type":"device-list","devices":[{"id":"...","name":"...","isDefault":true}]}

#include "capture.h"

#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace {

std::atomic<bool> g_shutdown{false};

void on_signal(int) {
  g_shutdown = true;
}

void emit_event(const std::string& json) {
  std::fprintf(stderr, "%s\n", json.c_str());
  std::fflush(stderr);
}

void emit_error(const std::string& msg) {
  emit_event("{\"type\":\"error\",\"message\":\"" + msg + "\"}");
}

std::string read_line() {
  std::string line;
  while (!g_shutdown) {
    if (!std::getline(std::cin, line)) return "";  // EOF
    if (!line.empty()) return line;
  }
  return "";
}

// Tiny JSON value extractor for the small subset we use. Avoids linking
// a full JSON library. Looks for `"key":<value>` patterns in flat objects.
std::string json_get(const std::string& json, const std::string& key) {
  std::string needle = "\"" + key + "\"";
  auto p = json.find(needle);
  if (p == std::string::npos) return "";
  p = json.find(':', p + needle.size());
  if (p == std::string::npos) return "";
  p = json.find_first_not_of(" \t\r\n", p + 1);
  if (p == std::string::npos) return "";
  if (json[p] == '"') {
    auto end = json.find('"', p + 1);
    if (end == std::string::npos) return "";
    return json.substr(p + 1, end - p - 1);
  }
  // Number or bool — read until , } or whitespace.
  auto end = json.find_first_of(",} \t\r\n", p);
  if (end == std::string::npos) return json.substr(p);
  return json.substr(p, end - p);
}

int json_int(const std::string& json, const std::string& key, int fallback) {
  std::string v = json_get(json, key);
  if (v.empty()) return fallback;
  try { return std::stoi(v); } catch (...) { return fallback; }
}

bool json_bool(const std::string& json, const std::string& key, bool fallback) {
  std::string v = json_get(json, key);
  if (v.empty()) return fallback;
  return v == "true";
}

void write_audio_frame(const float* samples, uint32_t frames) {
  uint32_t bytes = frames * sizeof(float);
  std::fwrite(&bytes, sizeof(uint32_t), 1, stdout);
  std::fwrite(samples, sizeof(float), frames, stdout);
}

void send_device_list() {
  auto devs = voicecraft::audio::CaptureSession::list_input_devices();
  std::ostringstream oss;
  oss << "{\"type\":\"device-list\",\"devices\":[";
  bool first = true;
  for (const auto& d : devs) {
    if (!first) oss << ",";
    first = false;
    oss << "{\"id\":\"" << d.id << "\","
        << "\"name\":\"" << d.name << "\","
        << "\"isDefault\":" << (d.is_default ? "true" : "false") << "}";
  }
  oss << "]}";
  emit_event(oss.str());
}

}  // namespace

int main() {
  std::signal(SIGINT, on_signal);
  std::signal(SIGTERM, on_signal);

  // Unbuffered stdout so audio frames flush immediately.
  std::setvbuf(stdout, nullptr, _IONBF, 0);

  voicecraft::audio::CaptureSession session;

  emit_event("{\"type\":\"service-started\",\"version\":\"0.1.0\"}");

  std::string line;
  while (!g_shutdown && std::getline(std::cin, line)) {
    if (line.empty()) continue;
    auto type = json_get(line, "type");
    if (type == "list-devices") {
      send_device_list();
    } else if (type == "start") {
      voicecraft::audio::CaptureConfig cfg;
      cfg.sample_rate = static_cast<uint32_t>(json_int(line, "sampleRate", 48000));
      cfg.channels = static_cast<uint16_t>(json_int(line, "channels", 1));
      cfg.enable_hpf = json_bool(line, "hpf", true);
      cfg.enable_agc = json_bool(line, "agc", true);
      cfg.enable_gate = json_bool(line, "gate", true);
      cfg.gate_threshold_db = static_cast<float>(json_int(line, "threshold", -45));
      cfg.device_id = json_get(line, "deviceId");
      cfg.frame_size_ms = static_cast<uint16_t>(json_int(line, "frameSizeMs", 20));

      std::ostringstream oss;
      oss << "{\"type\":\"ready\",\"sampleRate\":" << cfg.sample_rate
          << ",\"channels\":" << cfg.channels << "}";
      emit_event(oss.str());

      bool ok = session.start(cfg, [](const float* samples, uint32_t frames) {
        write_audio_frame(samples, frames);
      });
      if (!ok) emit_error(session.last_error());
    } else if (type == "stop") {
      session.stop();
      emit_event("{\"type\":\"stopped\"}");
    } else if (type == "shutdown") {
      break;
    } else {
      emit_error("unknown command: " + type);
    }
  }

  session.stop();
  emit_event("{\"type\":\"service-stopped\"}");
  return 0;
}
