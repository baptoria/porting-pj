import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex');
const before=JSON.parse(await readFile('artifacts/phase9-2/preserved-before.json','utf8'));
let preserved=0;
for(const [path,expected]of Object.entries(before))if(path.startsWith('public/vendor/')||path.startsWith('docs/ed4/vendor/')||path.startsWith('tests/e2e/')||['docs/index.html','docs/sw.js','docs/ed4/manifest.webmanifest'].includes(path)){
 if(hash(await readFile(path))!==expected)throw Error('Protected file changed: '+path);preserved++;
}
const existingTestDiff=execFileSync('git',['diff','--name-only','--','tests'],{encoding:'utf8'}).trim();
if(existingTestDiff)throw Error('Existing tracked tests changed: '+existingTestDiff);
const manifest=JSON.parse(await readFile('licenses/phase9-2-engine.json','utf8'));
for(const [file,e]of Object.entries(manifest.files))for(const root of ['public','docs/ed4'])if(hash(await readFile(`${root}/vendor/experimental/phase9-2/${file}`))!==e.sha256)throw Error('Experimental artifact mismatch: '+file);
const typed=await readFile('src/experimental-engine.ts','utf8');if(!typed.includes(manifest.files['wdosbox.wasm'].sha256))throw Error('Launcher pin mismatch');
const baseline=JSON.parse(await readFile('artifacts/phase9-1/engine-manifest.json','utf8'));
for(const [variant,files]of Object.entries(baseline))for(const [file,e]of Object.entries(files))if(hash(await readFile(`artifacts/phase9-1/engines/${variant}/${file}`))!==e.sha256)throw Error('Phase 9-1 artifact changed');
const originalZip=await readFile('public/sources/emulators-0.73.8-source.zip');
if(hash(originalZip)!=='884e7b8e525392fe0f64e4872ee8e2e82ba58e8a320e078297b90938279b6840')throw Error('Original corresponding source changed');
const zip=await readFile('docs/ed4/sources/emulators-0.73.8-phase9-2-source.zip');
if(hash(zip)!==manifest.sourceZipSha256)throw Error('GPL source ZIP mismatch');
const sources=unzipSync(zip),changes=JSON.parse(await readFile('artifacts/phase9-2/source-changes.json','utf8'));
for(const c of changes)if(hash(sources['emulators/'+c.path])!==c.after)throw Error('GPL patch mismatch: '+c.path);
if(Object.keys(sources).some(n=>/\.(raw|sav|efc|exe|com|iso|img)$/i.test(n)))throw Error('Unexpected payload in corresponding source');
const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else files.push(p);}}
await walk('docs');
const oversized=[],forbidden=[];let totalBytes=0;
for(const f of files){const b=await readFile(f);totalBytes+=b.length;if(b.length>100*1024*1024)oversized.push({path:f,bytes:b.length});if(/\.(raw|sav|sve|efc|exe|com|iso|img)$/i.test(f))forbidden.push(f);}
if(forbidden.length)throw Error('Unexpected deployment payload: '+forbidden.join(','));
const result={preservedFiles:preserved,existingTrackedTestsUnchanged:true,phase9_1EnginesUnchanged:true,
 stableWasmSha256:hash(await readFile('docs/ed4/vendor/wdosbox.wasm')),experimentalWasmSha256:manifest.files['wdosbox.wasm'].sha256,
 sourceZipSha256:manifest.sourceZipSha256,sourceEntries:Object.keys(sources).length,patchedSources:changes.length,
 deploymentFiles:files.length,totalBytes,oversized,forbidden,
 note:'Byte hashes compare existing stable vendors/tests/root pages. Extension/archive checks complement the reviewed build inputs, not a universal secret scanner. Public CC0 test ZIP is intentional; no user browser profile is accessed.'};
await writeFile('artifacts/phase9-2/preservation-check.json',JSON.stringify(result,null,2));console.log(result);
