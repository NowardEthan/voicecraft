@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM ---------------------------------------------------------------------------
REM Step 1: ensure miniaudio.h is present (single-header, MIT-licensed).
REM Try several download methods in order — curl, then PowerShell curl
REM (PS 7+), then PowerShell Invoke-WebRequest (legacy).
REM ---------------------------------------------------------------------------
if not exist "third_party\miniaudio_repo" mkdir "third_party\miniaudio_repo"
if exist "third_party\miniaudio_repo\miniaudio.h" goto have_miniaudio

echo Baixando miniaudio.h...
echo.

where curl >nul 2>nul
if not errorlevel 1 (
    curl -sL "https://raw.githubusercontent.com/mackron/miniaudio/master/miniaudio.h" ^
        -o "third_party\miniaudio_repo\miniaudio.h"
    if exist "third_party\miniaudio_repo\miniaudio.h" goto have_miniaudio
)

powershell -NoProfile -Command ^
    "$ProgressPreference = 'SilentlyContinue'; try { Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/mackron/miniaudio/master/miniaudio.h' -OutFile 'third_party\miniaudio_repo\miniaudio.h' -ErrorAction Stop; exit 0 } catch { exit 1 }"
if not errorlevel 1 (
    if exist "third_party\miniaudio_repo\miniaudio.h" goto have_miniaudio
)

echo Falha no download automatico.
echo Baixe manualmente de:  https://raw.githubusercontent.com/mackron/miniaudio/master/miniaudio.h
echo E salve em:             third_party\miniaudio_repo\miniaudio.h
exit /b 1

:have_miniaudio

if not exist "build" mkdir "build"

REM ---------------------------------------------------------------------------
REM Step 2: pick a compiler. Prefer MSVC (cl.exe), fall back to MinGW g++.
REM ---------------------------------------------------------------------------
set COMMON=/std:c++17 /EHsc /O2 /W4 /I src /I third_party\miniaudio_repo ^
            /D "MA_NO_RESOURCE_MANAGEMENT=1" /D "MA_NO_LOGGING=1" ^
            /D "MA_NO_JSON=1" /D "MA_NO_DATA_STRUCTURES=1"

where cl >nul 2>nul
if not errorlevel 1 (
    echo Compilando com cl.exe ^(MSVC^)...
    pushd build
    cl /nologo %COMMON% /Fe:voicecraft-audio.exe /Fo: ^
        ..\src\main.cpp ..\src\capture.cpp ^
        /link winmm.lib ole32.lib
    set RC=!errorlevel!
    popd
    if not "!RC!"=="0" exit /b !RC!
    echo.
    echo OK: build\voicecraft-audio.exe
    exit /b 0
)

where g++ >nul 2>nul
if not errorlevel 1 (
    echo Compilando com g++ ^(MinGW^)...
    g++ -std=c++17 -O2 -I src -I third_party\miniaudio_repo ^
        -DMA_NO_RESOURCE_MANAGEMENT=1 -DMA_NO_LOGGING=1 -DMA_NO_JSON=1 -DMA_NO_DATA_STRUCTURES=1 ^
        src\main.cpp src\capture.cpp -o build\voicecraft-audio.exe ^
        -lwinmm -lole32 -static
    if errorlevel 1 exit /b 1
    echo.
    echo OK: build\voicecraft-audio.exe
    exit /b 0
)

echo.
echo Nenhum compilador C++ encontrado no PATH.
echo Instale um dos seguintes:
echo   - Visual Studio Build Tools 2022 ^(workload "Desktop development with C++"^):
echo       https://visualstudio.microsoft.com/downloads/
echo   - MinGW: choco install mingw   OU   winget install -e --id Bremur.Instructions.Msys2-MinGW
exit /b 1
