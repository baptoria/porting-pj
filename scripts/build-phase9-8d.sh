#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
sdk="$PWD/artifacts/phase9-1"
task_root="$PWD/artifacts/phase9-8d"
export EM_CONFIG="$sdk/emscripten-config.py"
export PATH="$sdk/tools/install/emscripten:$sdk/tools/node-v14.18.2-linux-x64/bin:$sdk/tools/cmake-3.24.2-linux-x86_64/bin:$sdk/tools/ninja:$PATH"
case "$(cat "$sdk/tools/install/emscripten/emscripten-version.txt" | tr -d '"\n\r')" in
 3.1.21|3.1.21-git) ;; *) echo 'Unexpected SDK' >&2; exit 1 ;; esac
mkdir -p "$task_root/logs"
emcmake cmake -S "$task_root/source/instrumented" -B "$task_root/build/instrumented" -G Ninja -DED4_CPU_TRACE_ENABLED=OFF 2>&1 | tee "$task_root/logs/configure.log"
cmake --build "$task_root/build/instrumented" --target wdosbox --parallel 4 2>&1 | tee "$task_root/logs/build.log"
