"""Fetch exact upstream source for the shipped WASM. No game assets retained."""
import io, json, pathlib, urllib.request, zipfile, hashlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
REV = 'aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5'
SOKOL = '9acfe8cf7b3597bfad39847a0daa564dad91b8ae'
def fetch(repo, rev):
    url = f'https://codeload.github.com/{repo}/zip/{rev}'
    with urllib.request.urlopen(url, timeout=60) as response:
        data = response.read(30 * 1024 * 1024 + 1)
    if len(data) > 30 * 1024 * 1024:
        raise RuntimeError('Source download exceeds 30 MiB limit')
    return zipfile.ZipFile(io.BytesIO(data))
def excluded(path):
    # Upstream test games / optional native benchmark executables are not part
    # of the shipped browser backend. Keep their source but exclude binary data.
    lower = path.lower()
    return lower.endswith(('.zip','.jsdos','.exe','.com','.png','.jpg','.gif','.woff','.ttf')) or lower.endswith(('/dhry_2_exe.h','/dos4gw_exe.h'))
outdir = ROOT / 'public' / 'sources'
outdir.mkdir(parents=True, exist_ok=True)
target = outdir / 'emulators-0.73.8-source.zip'
skipped=[]
with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as dest:
    for repo,rev,prefix in [('js-dos/emulators',REV,'emulators/'),('floooh/sokol',SOKOL,'emulators/native/sokol/')]:
        with fetch(repo,rev) as source:
            for info in source.infolist():
                if info.is_dir(): continue
                relative=info.filename.split('/',1)[1]
                if excluded(relative):
                    skipped.append(prefix+relative)
                    continue
                dest.writestr(prefix+relative,source.read(info))
    dest.writestr('SOURCE-NOTES.txt',f'Browser runtime: emulators 0.73.8\nCommit: {REV}\nNative-only sokol submodule: {SOKOL}\nBuild tools: upstream Dockerfile / Emscripten 3.1.21; yarn; yarn gulp wasm; yarn gulp.\nOriginal source retained, except non-source test images/game bundles and optional native benchmark binary embeds. They are not used by the shipped wdosbox WASM build. No upstream game bundles are distributed.\nExcluded:\n'+'\n'.join(skipped))
manifest={'emulatorsVersion':'0.73.8','commit':REV,'sokolCommit':SOKOL,'archive':target.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'excluded':skipped}
(ROOT/'licenses'/'source-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in manifest.items() if k!='excluded'},indent=2))
