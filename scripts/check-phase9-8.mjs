// Local audit only; no Git/network/browser mutation.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',['-c','core.safecrlf=false',...a],{encoding:'utf8'}).trim();
const protectedPaths=['public/vendor','docs/ed4/vendor','public/dos-worker*','docs/ed4/dos-worker*','licenses','src/engine.ts','src/emulator-audio.ts','src/experimental-engine.ts','src/music.ts','src/raw-audio.ts','src/archive.ts','src/model.ts','src/storage.ts','src/save-state.ts','src/backup.ts','src/runtime-builder.ts','scripts/build-phase9-6.sh','scripts/prepare-phase9-6.mjs','scripts/phase9-6-common.mjs'];
if(git('diff','HEAD','--name-only','--',...protectedPaths))throw Error('Protected engine/audio/storage source changed');
const engines={stable:hash(await readFile('docs/ed4/vendor/wdosbox.wasm'))};
if(engines.stable!=='5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf')throw Error('Stable hash mismatch');
for(const id of ['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6']){
 const m=JSON.parse(await readFile(`licenses/${id}-engine.json`));
 for(const [name,f]of Object.entries(m.files))if(hash(await readFile(`docs/ed4/vendor/experimental/${id}/${name}`))!==f.sha256)throw Error(id+'/'+name);
 if(hash(await readFile(`docs/ed4/sources/emulators-0.73.8-${id}-source.zip`))!==m.sourceZipSha256)throw Error('GPL source mismatch '+id);
 engines[id]=m.files['wdosbox.wasm'].sha256;
}
const files=[];async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isSymbolicLink())throw Error('Symlink');if(e.isDirectory())await walk(p);else{const b=await readFile(p);if(b.length>100*1024*1024||/\.(raw|efc|sav|sve|iso|exe|com)$/i.test(p))throw Error('Unexpected deployment payload '+p);files.push({path:p,bytes:b.length});if(p.endsWith('.zip')&&p.includes('/sources/')){const z=unzipSync(b);if(Object.keys(z).some(n=>/\.(raw|efc|sav|sve|iso|exe|com)$/i.test(n)))throw Error('Unexpected source payload');}}}}
await walk('docs');const source=unzipSync(await readFile('docs/ed4/sources/ed4-mobile-source.zip'));
for(const p of ['src/play-ui.ts','src/play-input.ts','src/controls.ts','src/style.css','src/main.ts','PHASE9_8_FULLSCREEN_SPEED_REPORT.md'])if(hash(source['ed4-mobile/'+p])!==hash(await readFile(p)))throw Error('Stale launcher source '+p);
const result={head:git('rev-parse','HEAD'),staged:git('diff','--cached','--name-only'),engines,protectedPathsUnchanged:true,sourceMatches:true,published:false,largest:[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,3)};
if(result.staged)throw Error('Unexpected staged changes');await writeFile('artifacts/phase9-8/deployment-audit.json',JSON.stringify(result,null,2));console.log(result);
