#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
# Step 1: fetch miniaudio.h (single-header, MIT) if missing.
# ---------------------------------------------------------------------------
mkdir -p third_party/miniaudio_repo
if [ ! -f third_party/miniaudio_repo/miniaudio.h ]; then
    echo "Fetching miniaudio.h..."
    if command -v curl >/dev/null 2>&1; then
        curl -sL "https://raw.githubusercontent.com/mackron/miniaudio/v0.11.21/miniaudio.h" \
            -o third_party/miniaudio_repo/miniaudio.h
    elif command -v wget >/dev/null 2>&1; then
        wget -q "https://raw.githubusercontent.com/mackron/miniaudio/v0.11.21/miniaudio.h" \
            -O third_party/miniaudio_repo/miniaudio.h
    else
        echo "Need curl or wget to fetch miniaudio.h"
        exit 1
    fi
fi

mkdir -p build

# ---------------------------------------------------------------------------
# Step 2: pick a compiler (clang++ first, then g++).
# ---------------------------------------------------------------------------
COMMON="-std=c++17 -O2 -Wall -Wextra -I src -I third_party/miniaudio_repo \
         -DMA_NO_RESOURCE_MANAGEMENT=1 -DMA_NO_LOGGING=1 \
         -DMA_NO_JSON=1 -DMA_NO_DATA_STRUCTURES=1"

CXX=""
for cand in clang++ g++; do
    if command -v "$cand" >/dev/null 2>&1; then CXX="$cand"; break; fi
done
if [ -z "$CXX" ]; then
    echo "No C++ compiler found."
    echo "Install one of:"
    echo "  - apt install g++   (Debian/Ubuntu)"
    echo "  - brew install llvm  (macOS)"
    exit 1
fi
echo "Building with $CXX ($($CXX --version | head -1))..."

case "$(uname -s 2>/dev/null || echo Windows)" in
    Darwin)
        LIBS="-framework CoreAudio -framework AudioToolbox"
        EXT=""
        ;;
    Linux|*)
        LIBS="-lpulse -lpthread -ldl"
        EXT=""
        ;;
esac

OUTPUT="build/voicecraft-audio"
[ "${OSTYPE:-}" = "msys" ] || [ "${OSTYPE:-}" = "cygwin" ] && EXT=".exe"
[ -n "$EXT" ] && OUTPUT="${OUTPUT}${EXT}"

$CXX $COMMON \
    src/main.cpp src/capture.cpp \
    -o "$OUTPUT" \
    $LIBS

echo
echo "OK: $OUTPUT"
