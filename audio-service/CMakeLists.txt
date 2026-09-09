cmake_minimum_required(VERSION 3.15)
project(voicecraft-audio CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# -----------------------------------------------------------------------
# Fetch miniaudio.h (single-header audio library, MIT).
# Supports WASAPI (Windows), CoreAudio (macOS), PulseAudio/PipeWire (Linux).
# -----------------------------------------------------------------------
include(FetchContent)
FetchContent_Declare(
  miniaudio
  URL https://raw.githubusercontent.com/mackron/miniaudio/v0.11.21/miniaudio.h
  DOWNLOAD_EXTRACT_TIMESTAMP TRUE
  SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/third_party/miniaudio_repo
)
FetchContent_MakeAvailable(miniaudio)

# -----------------------------------------------------------------------
# VoiceCraft audio service
# - Captures microphone audio via OS APIs
# - Receives control commands over stdin (JSON lines, one per command)
# - Emits audio frames over stdout: [4-byte little-endian size][float32 PCM]
# - Also emits status events as JSON lines on stderr
# -----------------------------------------------------------------------
add_executable(voicecraft-audio
  src/main.cpp
)

target_include_directories(voicecraft-audio PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src
  ${CMAKE_CURRENT_SOURCE_DIR}/third_party/miniaudio_repo
)

target_compile_definitions(voicecraft-audio PRIVATE
  # miniaudio options — disable everything we don't need (keeps binary small)
  MA_NO_RESOURCE_MANAGEMENT=1
  MA_NO_DEVICE_IO=0          # we DO need device I/O for mic capture
  MA_NO_THREADING=0          # we DO need threading for the audio thread
  MA_NO_LOGGING=1
  MA_NO_JSON=1               # we do JSON ourselves with simple parsing
  MA_NO_DATA_STRUCTURES=1
)

# Platform-specific libs.
if(WIN32)
  target_link_libraries(voicecraft-audio PRIVATE winmm ole32)
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
