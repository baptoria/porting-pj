#!/usr/bin/env bash
# Portable, project-local tools only. No sudo, apt, shell profile or global PATH writes.
set -euo pipefail
cd "$(dirname "$0")/.."
task_root="$PWD/artifacts/phase9-1"
mkdir -p "$task_root/tools"
cd "$task_root/tools"
if [ ! -f .extracted ]; then
  python3 - <<'PY'
import tarfile,zipfile,pathlib
for name in ['wasm-binaries.tbz2','node-v14.18.2-linux-x64.tar.xz','cmake-3.24.2-linux-x86_64.tar.gz']:
    if name=='wasm-binaries.tbz2' and pathlib.Path('.sdk-extracted').exists():
        continue
    print('Extracting',name,flush=True)
    with tarfile.open('../downloads/'+name) as archive:
        if name.startswith('node-'):
            members=[m for m in archive if m.name.endswith('/bin/node')]
        elif name.startswith('cmake-'):
            members=[m for m in archive if '/bin/cmake' in m.name or ('/share/cmake-3.24/' in m.name and '/Help/' not in m.name)]
        else:
            members=archive.getmembers()
        archive.extractall('.',members=members,filter='data')
    if name=='wasm-binaries.tbz2':pathlib.Path('.sdk-extracted').write_text('complete')
zipfile.ZipFile('../downloads/ninja-linux.zip').extractall('ninja')
PY
  chmod +x ninja/ninja
  touch .extracted
fi
python3 - "$task_root" <<'PY'
from pathlib import Path
import sys
r=Path(sys.argv[1]);t=r/'tools'
settings={
 'LLVM_ROOT':str(t/'install/bin'),
 'BINARYEN_ROOT':str(t/'install'),
 'EMSCRIPTEN_ROOT':str(t/'install/emscripten'),
 'NODE_JS':str(t/'node-v14.18.2-linux-x64/bin/node'),
 'CACHE':str(t/'install/emscripten/cache'),
}
(r/'emscripten-config.py').write_text('\n'.join(k+' = '+repr(v) for k,v in settings.items())+'\n')
PY
export EM_CONFIG="$task_root/emscripten-config.py"
export PATH="$task_root/tools/install/emscripten:$task_root/tools/node-v14.18.2-linux-x64/bin:$task_root/tools/cmake-3.24.2-linux-x86_64/bin:$task_root/tools/ninja:$PATH"
mkdir -p "$task_root/logs"
exec > >(tee "$task_root/logs/toolchain.log") 2>&1
cat /etc/os-release
uname -a
emcc --version
clang_path="$task_root/tools/install/bin/clang"
"$clang_path" --version
cmake --version
ninja --version
node --version
python3 --version
