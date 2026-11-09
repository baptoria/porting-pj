#!/usr/bin/env bash
# Same fixed source/options for both builds; only the Asyncify list differs.
set -euo pipefail
cd "$(dirname "$0")/.."
task_root="$PWD/artifacts/phase9-1"
export EM_CONFIG="$task_root/emscripten-config.py"
export PATH="$task_root/tools/install/emscripten:$task_root/tools/node-v14.18.2-linux-x64/bin:$task_root/tools/cmake-3.24.2-linux-x86_64/bin:$task_root/tools/ninja:$PATH"
case "$(cat "$task_root/tools/install/emscripten/emscripten-version.txt" | tr -d '"\n\r')" in
  3.1.21|3.1.21-git) ;;
  *) echo 'Unexpected compiler version' >&2; exit 1 ;;
esac
mkdir -p "$task_root/logs"
for variant in baseline fixed; do
  emcmake cmake -S "$task_root/source/$variant" -B "$task_root/build/$variant" -G Ninja 2>&1 | tee "$task_root/logs/configure-$variant.log"
  ninja -C "$task_root/build/$variant" -t commands wdosbox > "$task_root/logs/commands-$variant.txt"
  cmake --build "$task_root/build/$variant" --target wdosbox --parallel 4 2>&1 | tee "$task_root/logs/build-$variant.log"
done
