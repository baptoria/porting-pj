// GPL-2.0-only. Isolated event observer, preserving all earlier engines.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync,zipSync} from 'fflate';
const root='artifacts/phase9-8k',src=root+'/source/instrumented',out=root+'/engine',hash=b=>createHash('sha256').update(b).digest('hex');
const change=JSON.parse(await readFile(root+'/source-changes.json')),base=unzipSync(await readFile('public/sources/emulators-0.73.8-phase9-8i-source.zip'));
for(const [p,b]of Object.entries(base)){if(!p.startsWith('emulators/')||p.endsWith('/'))continue;const rel=p.slice(10),expected=change.changes.find(c=>c.path===rel)?.after??hash(b);if(hash(await readFile(src+'/'+rel))!==expected)throw Error('Unexpected source '+rel);}
for(const c of change.changes)if(hash(await readFile(src+'/'+c.path))!==c.after)throw Error('Changed patch '+c.path);
await mkdir(out,{recursive:true});const manifest={id:'phase9-8k',emulators:'0.73.8',emscripten:'3.1.21',files:{},changes:change};
for(const f of ['wdosbox.js','wdosbox.wasm','wdosbox.js.symbols']){let b=await readFile(root+'/build/instrumented/'+f);if(f.endsWith('.js'))b=Buffer.concat([b,await readFile(src+'/src/dos/dosbox/ts/worker-server.js')]);await writeFile(out+'/'+f,b);manifest.files[f]={sha256:hash(b),bytes:b.length};}
for(const [from,to]of [['LICENSE','LICENSE'],['native/dosbox/COPYING','DOSBOX-COPYING']]){const b=await readFile(src+'/'+from);await writeFile(out+'/'+to,b);manifest.files[to]={sha256:hash(b),bytes:b.length};}
const sourceNote=Buffer.from('GPL-2.0-or-later emulators 0.73.8. Full corresponding source: ../../../sources/emulators-0.73.8-phase9-8k-source.zip\nSee BUILD-PHASE9-8K.md. I timer/mixer/observer retained; K bounded cooperative yields and auto-adjust wall accounting; speed segmented supply telemetry.\n');await writeFile(out+'/SOURCE.txt',sourceNote);manifest.files['SOURCE.txt']={sha256:hash(sourceNote),bytes:sourceNote.length};
const files={};async function add(p,r){for(const e of await readdir(p,{withFileTypes:true})){if(e.isDirectory())await add(p+'/'+e.name,r+'/'+e.name);else files[r+'/'+e.name]=await readFile(p+'/'+e.name);}}await add(src,'emulators');
files['emulators/BUILD-PHASE9-8K.md']=Buffer.from('# Phase9-8K\nUse Emscripten 3.1.21, Node14.18.2, CMake3.24.2, Ninja.\nemcmake cmake -S . -B build -G Ninja -DED4_CPU_TRACE_ENABLED=OFF\ncmake --build build --target wdosbox --parallel 4\nAppend src/dos/dosbox/ts/worker-server.js to build/wdosbox.js.\nVGA compatibility and Reboot_Handler Asyncify remain. Only INT66/INT69 CPU_Interrupt and successful DOS INT21/AH3F read events are observed. INT69 AX/BX meaning is unverified. No instruction history, game bytes, audio samples or muting. INT69 IRET returns retained. Exact 9-8B guest tick multiplier retained. K retains I cycles override and PIC audio clock; 4ms cooperative tick-boundary yield, preserve auto-adjust accumulated wall time on idle polls, counters for 20ms clamp. No CPU opcode tracing. See source-changes.json and launcher I report. Starts at 1x.\n');
for(const name of ['prepare-phase9-8k.mjs','build-phase9-8k.sh','phase9-8k-speed-worker.js','phase9-8k-audio-bridge.js','phase9-8k-ring.mjs','prepare-phase9-8k-worker.mjs','prepare-phase9-8k-worklet.mjs','package-phase9-8k.mjs'])files['launcher-scripts/'+name]=await readFile('scripts/'+name);
files['emulators/source-changes.json']=Buffer.from(JSON.stringify(change,null,2));
const z=zipSync(files,{level:6});manifest.sourceZipSha256=hash(z);await writeFile(out+'/corresponding-source.zip',z);await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2));
if(process.argv.includes('--stage')){
 const dir='public/vendor/experimental/phase9-8k';await mkdir(dir,{recursive:true});for(const f of Object.keys(manifest.files))await writeFile(dir+'/'+f,await readFile(out+'/'+f));
 await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2));await writeFile('licenses/phase9-8k-engine.json',JSON.stringify(manifest,null,2));await writeFile('public/sources/emulators-0.73.8-phase9-8k-source.zip',z);
 await writeFile('src/generated/phase9-8k-engine.ts','// Generated separately built observer.\nexport const SUPPLY_ENGINE='+JSON.stringify({id:'phase9-8k',wasmSha256:manifest.files['wdosbox.wasm'].sha256,directory:'vendor/experimental/phase9-8k/'})+' as const;\n');
}
console.log(manifest.files['wdosbox.wasm']);
