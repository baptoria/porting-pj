import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex'),git=(...a)=>execFileSync('git',['-c','core.safecrlf=false',...a],{encoding:'utf8'}).trim();
// These core paths have no new implementation changes in this phase.
if(git('diff','HEAD','--name-only','--','src/emulator-audio.ts','src/music.ts','src/raw-audio.ts','src/storage.ts','src/model.ts','src/save-state.ts','src/backup.ts','public/dos-worker.js'))throw Error('Protected data/audio core changed');
const engines={};for(const id of ['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6','phase9-8c']){
 const m=JSON.parse(await readFile(`licenses/${id}-engine.json`));for(const [f,v]of Object.entries(m.files))if(hash(await readFile(`docs/ed4/vendor/experimental/${id}/${f}`))!==v.sha256)throw Error('Engine hash mismatch '+id+'/'+f);
 if(hash(await readFile(`docs/ed4/sources/emulators-0.73.8-${id}-source.zip`))!==m.sourceZipSha256)throw Error('GPL mismatch '+id);engines[id]=m.files['wdosbox.wasm'].sha256;
}
if(hash(await readFile('docs/ed4/vendor/wdosbox.wasm'))!=='5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf')throw Error('Stable changed');
for(const id of ['phase9-3','phase9-4','phase9-5b','phase9-6','phase9-7','phase9-8c']){const m=JSON.parse(await readFile(`docs/ed4/${id}-worker.json`));for(const [f,h]of [[m.entry,m.entrySha256],[m.common,m.sha256]])if(hash(await readFile('docs/ed4/'+f))!==h)throw Error('Worker hash mismatch');}
let largest=0;async function walk(p){for(const e of await readdir(p,{withFileTypes:true})){const f=p+'/'+e.name;if(e.isDirectory())await walk(f);else{const b=await readFile(f);largest=Math.max(largest,b.length);if(b.length>100*1024*1024||/\.(raw|efc|sav|sve|iso|exe|com)$/i.test(f))throw Error('Unexpected deployment payload '+f);if(f.includes('/sources/')&&f.endsWith('.zip')){const z=unzipSync(b);if(Object.keys(z).some(n=>/\.(raw|efc|sav|sve|iso|exe|com)$/i.test(n)))throw Error('Unexpected source payload');}}}}await walk('docs');
const z=unzipSync(await readFile('docs/ed4/sources/ed4-mobile-source.zip'));for(const f of ['src/engine.ts','src/bgm-diagnostics.ts','scripts/phase9-8c-trace.inc','PHASE9_8C_BGM_COMMAND_REPORT.md'])if(hash(z['ed4-mobile/'+f])!==hash(await readFile(f)))throw Error('Stale launcher source '+f);
if(git('diff','--cached','--name-only'))throw Error('Unexpected staging');const result={engines,existingDataAudioCoreUnchanged:true,sourceMatches:true,largestBytes:largest,staged:false,published:false};await writeFile('artifacts/phase9-8c/audit.json',JSON.stringify(result,null,2));console.log(result);
