cmake_minimum_required(VERSION 3.15)
project(voicecraft-audio CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# miniaudio is vendored at a pinned v0.11.21 revision. Builds stay offline and
# deterministic; audio-service/build.bat can fetch that exact revision if absent.
if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/miniaudio_repo/miniaudio.h")
  message(FATAL_ERROR "Missing third_party/miniaudio_repo/miniaudio.h (expected v0.11.21)")
endif()

# -----------------------------------------------------------------------
# Voice audio service (binary kept as `voicecraft-audio.exe` for
# backwards-compatible upgrade paths; the C++ namespace is `voicecraft`).
# - Captures microphone audio via OS APIs
# - Receives control commands over stdin (JSON lines, one per command)
# - Emits protocol-v2 frames: [magic][source][frame count][float32 mono PCM]
# - Also emits status events as JSON lines on stderr
# -----------------------------------------------------------------------
add_executable(voicecraft-audio
  src/main.cpp
  src/capture.cpp
  src/loopback_wasapi.cpp
)

target_include_directories(voicecraft-audio PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/miniaudio_repo
)

target_compile_definitions(voicecraft-audio PRIVATE
  # miniaudio options â€” disable everything we don't need (keeps binary small)
  MA_NO_RESOURCE_MANAGEMENT=1
  # Do not define MA_NO_DEVICE_IO or MA_NO_THREADING, even as 0: miniaudio
  # treats the presence of either macro as disabling that subsystem.
  MA_NO_LOGGING=1
  MA_NO_JSON=1               # we do JSON ourselves with simple parsing
  MA_NO_DATA_STRUCTURES=1
)

# Platform-specific libs.
if(WIN32)
  target_link_libraries(voicecraft-audio PRIVATE winmm ole32 mmdevapi psapi uuid)
elseif(APPLE)
  target_link_libraries(voicecraft-audio PRIVATE "-framework CoreAudio" "-framework AudioToolbox")
else()  # Linux
  target_link_libraries(voicecraft-audio PRIVATE pulse pulse-simple)
endif()

# Warnings
target_compile_options(voicecraft-audio PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang>:-Wall -Wextra -Wpedantic>
  $<$<CXX_COMPILER_ID:MSVC>:/W4>
)

# Install
install(TARGETS voicecraft-audio RUNTIME DESTINATION bin)
