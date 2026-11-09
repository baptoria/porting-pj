import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
const root='artifacts/phase9-2',src=`${root}/source/instrumented`,out=`${root}/engines/instrumented`;
const hash=b=>createHash('sha256').update(b).digest('hex');
const original=JSON.parse(await readFile('artifacts/phase9-1/source-manifest.json','utf8'));
const changes=JSON.parse(await readFile(`${root}/source-changes.json`,'utf8'));
for(const f of original.files){
 const expected=changes.find(c=>c.path===f.path)?.after??(f.path===original.change?original.patchedSha256:f.sha256);
 if(hash(await readFile(src+'/'+f.path))!==expected)throw Error('Unexpected source change: '+f.path);
}
for(const f of changes)if(hash(await readFile(src+'/'+f.path))!==f.after)throw Error('Unrecorded patch: '+f.path);
await mkdir(out,{recursive:true});
const manifest={id:'phase9-2',emulators:'0.73.8',emscripten:'3.1.21',sourceCommit:'aa5ae93628ef8a44b6f645c8df2c4846c6bad9e5',files:{}};
for(const file of ['wdosbox.js','wdosbox.wasm','wdosbox.js.symbols']){
 let bytes=await readFile(`${root}/build/instrumented/${file}`);
 if(file==='wdosbox.js')bytes=Buffer.concat([bytes,await readFile(`${src}/src/dos/dosbox/ts/worker-server.js`)]);
 await writeFile(`${out}/${file}`,bytes);manifest.files[file]={sha256:hash(bytes),bytes:bytes.length};
}
for(const [from,to]of [['LICENSE','LICENSE'],['native/dosbox/COPYING','DOSBOX-COPYING']])await cp(`${src}/${from}`,`${out}/${to}`);
await writeFile(`${out}/SOURCE.txt`,'Experimental emulators 0.73.8 / DOSBox, GPL-2.0-or-later upstream files.\nCorresponding source: ../../../sources/emulators-0.73.8-phase9-2-source.zip\nIncludes the full source, instrumentation, and BUILD.md.\nStable engine remains ../../wdosbox.wasm; diagnostic engine only.\n');
await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));
await writeFile(`${root}/engine-manifest.json`,JSON.stringify(manifest,null,2));
console.log(manifest);
if(process.argv.includes('--deploy')){
 const results=JSON.parse(await readFile(`${root}/public-tests.json`,'utf8'));
 if(results.stats.unexpected||results.stats.flaky||results.stats.skipped||results.stats.expected<13)throw Error('Public engine test gate not passed');
 let tested=0;
 for(const entry of await readdir(`${root}/browser`,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  let evidence;try{evidence=JSON.parse(await readFile(`${root}/browser/${entry.name}/result.json`,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(evidence.engine?.variant==='instrumented'){
   if(evidence.engine.wasmSha256!==manifest.files['wdosbox.wasm'].sha256)throw Error('Tests used a different instrumented WASM');tested++;
  }
 }
 if(tested!==8)throw Error('Missing instrumented public test evidence');
 const z={};
 async function add(dir,relative){for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory())await add(dir+'/'+e.name,relative+'/'+e.name);else z[relative+'/'+e.name]=new Uint8Array(await readFile(dir+'/'+e.name));}}
 await add(src,'emulators');
 z['emulators/PHASE9_2_CHANGES.json']=new TextEncoder().encode(JSON.stringify(changes,null,2));
 z['emulators/BUILD.md']=new TextEncoder().encode(`# Phase 9-2 corresponding source\n\nBase commit ${manifest.sourceCommit}; Asyncify Reboot_Handler retained, BIOS/DOS/CPU observation added. No game data.\n\nUse official emsdk **3.1.21** (release a16a8bca2466eb144f7c93fa899c0272c8815dc3), Node 14.18.2, CMake 3.24.2, Ninja 1.11.1. Activate emsdk_env.sh, then in this directory:\n\n    emcmake cmake -S . -B build -G Ninja\n    cmake --build build --target wdosbox --parallel 4\n    cat build/wdosbox.js src/dos/dosbox/ts/worker-server.js > wdosbox.js\n\nUse build/wdosbox.wasm and build/wdosbox.js.symbols alongside wdosbox.js. Source path strings affect exact output hashes. CMake options are unmodified; compiler SDK is pinned. Full local commands/toolchain provenance: PHASE9_2_REBOOT_REPORT.md in launcher source.\n`);
 const archive=zipSync(z,{level:6}),zipPath='public/sources/emulators-0.73.8-phase9-2-source.zip';
 await writeFile(zipPath,archive);
 await cp(out,'public/vendor/experimental/phase9-2',{recursive:true});
 const reviewed={...manifest,files:{...manifest.files},sourceZipSha256:hash(archive)};
 for(const file of ['LICENSE','DOSBOX-COPYING','SOURCE.txt']){const b=await readFile(`${out}/${file}`);reviewed.files[file]={sha256:hash(b),bytes:b.length};}
 await writeFile('licenses/phase9-2-engine.json',JSON.stringify(reviewed,null,2));
 await writeFile('public/vendor/experimental/phase9-2/manifest.json',JSON.stringify(reviewed,null,2));
 await writeFile(`${root}/deployment-gate.json`,JSON.stringify({wasmSha256:manifest.files['wdosbox.wasm'].sha256,tests:results.stats,sourceZipSha256:hash(archive),sourceEntries:Object.keys(z).length},null,2));
}
