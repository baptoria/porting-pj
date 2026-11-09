import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
const root='artifacts/phase9-6',src=`${root}/source/instrumented`,out=`${root}/engines/instrumented`;
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=JSON.parse(await readFile(root+'/base-source-manifest.json','utf8'));
const changes=JSON.parse(await readFile(root+'/source-changes.json','utf8'));
for(const [path,sha256] of Object.entries(original)){
 const expected=changes.find(c=>c.path===path)?.after??sha256;
 if(hash(await readFile(src+'/'+path))!==expected)throw Error('Unexpected source change: '+path);
}
for(const f of changes)if(hash(await readFile(src+'/'+f.path))!==f.after)throw Error('Unrecorded patch: '+f.path);
await mkdir(out,{recursive:true});
const manifest={id:'phase9-6',emulators:'0.73.8',emscripten:'3.1.21',sourceCommit:'aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5',files:{}};
for(const file of ['wdosbox.js','wdosbox.wasm','wdosbox.js.symbols']){
 let bytes=await readFile(`${root}/build/instrumented/${file}`);
 if(file==='wdosbox.js')bytes=Buffer.concat([bytes,await readFile(`${src}/src/dos/dosbox/ts/worker-server.js`)]);
 await writeFile(`${out}/${file}`,bytes);manifest.files[file]={sha256:hash(bytes),bytes:bytes.length};
}
for(const [from,to]of [['LICENSE','LICENSE'],['native/dosbox/COPYING','DOSBOX-COPYING']])await cp(`${src}/${from}`,`${out}/${to}`);
await writeFile(`${out}/SOURCE.txt`,'Experimental emulators 0.73.8 / DOSBox, GPL-2.0-or-later upstream files.\nCorresponding source: ../../../sources/emulators-0.73.8-phase9-6-source.zip\nIncludes the full source, optional diagnostics, and BUILD.md.\nStable engine remains ../../wdosbox.wasm; diagnostic engine only.\n');
await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
await writeFile(`${root}/engine-manifest.json`,JSON.stringify(manifest,null,2));
console.log(manifest);
if(process.argv.includes('--deploy')){
 const results=JSON.parse(await readFile(`${root}/public-tests.json`,'utf8'));
 if(results.stats.unexpected||results.stats.flaky||results.stats.skipped||results.stats.expected!==6)throw Error('Six public A/B checks required');
 let tested=0;
 for(const entry of await readdir(`${root}/browser`,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  let evidence;try{evidence=JSON.parse(await readFile(`${root}/browser/${entry.name}/result.json`,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(evidence.variant==='phase9-6'){if(evidence.wasmSha256!==manifest.files['wdosbox.wasm'].sha256)throw Error('Tested WASM mismatch');tested++;}
 }
 if(tested!==3)throw Error('Missing candidate evidence');
 const z={};async function add(dir,rel){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory())await add(dir+'/'+e.name,rel+'/'+e.name);else z[rel+'/'+e.name]=new Uint8Array(await readFile(dir+'/'+e.name));}}
 await add(src,'emulators');
 z['emulators/PHASE9_6_CHANGES.json']=new TextEncoder().encode(JSON.stringify(changes,null,2));
 z['emulators/BUILD.md']=new TextEncoder().encode(`# Phase 9-6 corresponding source\n\nBase: Phase 9-5B source, upstream commit ${manifest.sourceCommit}. VGA compatibility and Reboot_Handler Asyncify retained. ED4_CPU_TRACE_ENABLED=OFF excludes instruction history/first-event arrays at compile time. Rare EXEC/reboot events remain. On-demand 1/1024 decoder wall-time sampler and read-only counters are not OS thread CPU time.\n\nUse Emscripten 3.1.21, Node 14.18.2, CMake 3.24.2, Ninja 1.11.1. Activate emsdk_env.sh, then:\n\n    emcmake cmake -S . -B build -G Ninja -DED4_CPU_TRACE_ENABLED=OFF\n    cmake --build build --target wdosbox --parallel 4\n    cat build/wdosbox.js src/dos/dosbox/ts/worker-server.js > wdosbox.js\n\nUse build/wdosbox.wasm and build/wdosbox.js.symbols together. Paths affect exact output hashes. See launcher scripts/prepare-phase9-6.mjs and scripts/build-phase9-6.sh for exact tested paths and patch. No commercial game code/data is included.\n`);
 const archive=zipSync(z,{level:6});await writeFile('public/sources/emulators-0.73.8-phase9-6-source.zip',archive);
 await cp(out,'public/vendor/experimental/phase9-6',{recursive:true});
 const reviewed={...manifest,files:{...manifest.files},sourceZipSha256:hash(archive)};
 for(const file of ['LICENSE','DOSBOX-COPYING','SOURCE.txt']){const b=await readFile(`${out}/${file}`);reviewed.files[file]={sha256:hash(b),bytes:b.length};}
 await writeFile('licenses/phase9-6-engine.json',JSON.stringify(reviewed,null,2));
 await writeFile('public/vendor/experimental/phase9-6/manifest.json',JSON.stringify(reviewed,null,2));
 await writeFile(root+'/deployment-gate.json',JSON.stringify({wasmSha256:manifest.files['wdosbox.wasm'].sha256,tests:results.stats,sourceZipSha256:hash(archive),sourceEntries:Object.keys(z).length},null,2));
}
