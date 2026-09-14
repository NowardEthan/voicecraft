#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>
#include <memory>

namespace voicecraft::audio {

struct AudioProcessInfo {
  uint32_t pid{0};
  std::string name;
  std::string icon; // Base64 or empty
};

class LoopbackSession {
public:
  using AudioCallback = std::function<void(const float* samples, uint32_t frames)>;

  LoopbackSession();
  ~LoopbackSession();

  static std::vector<AudioProcessInfo> list_audio_processes();

  bool start(uint32_t process_id, uint32_t sample_rate, uint16_t channels, AudioCallback cb);
  void stop();
  bool is_running() const;
  const std::string& last_error() const;
  const std::string& last_mode() const;

private:
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace voicecraft::audio
