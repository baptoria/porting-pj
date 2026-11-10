// GPL-2.0-only. Isolated event observer, preserving all earlier engines.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync,zipSync} from 'fflate';
const root='artifacts/phase9-8i',src=root+'/source/instrumented',out=root+'/engine',hash=b=>createHash('sha256').update(b).digest('hex');
const change=JSON.parse(await readFile(root+'/source-changes.json')),base=unzipSync(await readFile('public/sources/emulators-0.73.8-phase9-8h-source.zip'));
for(const [p,b]of Object.entries(base)){if(!p.startsWith('emulators/')||p.endsWith('/'))continue;const rel=p.slice(10),expected=change.changes.find(c=>c.path===rel)?.after??hash(b);if(hash(await readFile(src+'/'+rel))!==expected)throw Error('Unexpected source '+rel);}
for(const c of change.changes)if(hash(await readFile(src+'/'+c.path))!==c.after)throw Error('Changed patch '+c.path);
await mkdir(out,{recursive:true});const manifest={id:'phase9-8i',emulators:'0.73.8',emscripten:'3.1.21',files:{},changes:change};
for(const f of ['wdosbox.js','wdosbox.wasm','wdosbox.js.symbols']){let b=await readFile(root+'/build/instrumented/'+f);if(f.endsWith('.js'))b=Buffer.concat([b,await readFile(src+'/src/dos/dosbox/ts/worker-server.js')]);await writeFile(out+'/'+f,b);manifest.files[f]={sha256:hash(b),bytes:b.length};}
for(const [from,to]of [['LICENSE','LICENSE'],['native/dosbox/COPYING','DOSBOX-COPYING']]){const b=await readFile(src+'/'+from);await writeFile(out+'/'+to,b);manifest.files[to]={sha256:hash(b),bytes:b.length};}
const sourceNote=Buffer.from('GPL-2.0-or-later emulators 0.73.8. Full corresponding source: ../../../sources/emulators-0.73.8-phase9-8i-source.zip\nSee BUILD-PHASE9-8I.md. H timer/mixer/observer retained; explicit reversible native cycles override and host worklet experiment.\n');await writeFile(out+'/SOURCE.txt',sourceNote);manifest.files['SOURCE.txt']={sha256:hash(sourceNote),bytes:sourceNote.length};
const files={};async function add(p,r){for(const e of await readdir(p,{withFileTypes:true})){if(e.isDirectory())await add(p+'/'+e.name,r+'/'+e.name);else files[r+'/'+e.name]=await readFile(p+'/'+e.name);}}await add(src,'emulators');
files['emulators/BUILD-PHASE9-8I.md']=Buffer.from('# Phase9-8I\nUse Emscripten 3.1.21, Node14.18.2, CMake3.24.2, Ninja.\nemcmake cmake -S . -B build -G Ninja -DED4_CPU_TRACE_ENABLED=OFF\ncmake --build build --target wdosbox --parallel 4\nAppend src/dos/dosbox/ts/worker-server.js to build/wdosbox.js.\nVGA compatibility and Reboot_Handler Asyncify remain. Only INT66/INT69 CPU_Interrupt and successful DOS INT21/AH3F read events are observed. INT69 AX/BX meaning is unverified. No instruction history, game bytes, audio samples or muting. INT69 IRET returns retained. Exact 9-8B guest tick multiplier retained. I retains H audio clock and adds ed4_cycles_override(0|12000|16000|24000), restored at 1x. See source-changes.json and launcher I report. Starts at 1x.\n');
for(const name of ['prepare-phase9-8i.mjs','build-phase9-8i.sh','phase9-8i-speed-worker.js','phase9-8i-audio-bridge.js','phase9-8i-ring.mjs','prepare-phase9-8i-worker.mjs','prepare-phase9-8i-worklet.mjs','package-phase9-8i.mjs'])files['launcher-scripts/'+name]=await readFile('scripts/'+name);
files['emulators/source-changes.json']=Buffer.from(JSON.stringify(change,null,2));
const z=zipSync(files,{level:6});manifest.sourceZipSha256=hash(z);await writeFile(out+'/corresponding-source.zip',z);await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2));
if(process.argv.includes('--stage')){
 const dir='public/vendor/experimental/phase9-8i';await mkdir(dir,{recursive:true});for(const f of Object.keys(manifest.files))await writeFile(dir+'/'+f,await readFile(out+'/'+f));
 await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2));await writeFile('licenses/phase9-8i-engine.json',JSON.stringify(manifest,null,2));await writeFile('public/sources/emulators-0.73.8-phase9-8i-source.zip',z);
 await writeFile('src/generated/phase9-8i-engine.ts','// Generated separately built observer.\nexport const STABILITY_ENGINE='+JSON.stringify({id:'phase9-8i',wasmSha256:manifest.files['wdosbox.wasm'].sha256,directory:'vendor/experimental/phase9-8i/'})+' as const;\n');
}
console.log(manifest.files['wdosbox.wasm']);
