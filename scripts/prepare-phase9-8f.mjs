import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex'),root='artifacts/phase9-8f',source=root+'/source/instrumented';
const zip=await readFile('public/sources/emulators-0.73.8-phase9-8d-source.zip'),manifest=JSON.parse(await readFile('licenses/phase9-8d-engine.json'));
if(hash(zip)!==manifest.sourceZipSha256)throw Error('Wrong 9-8D source');
for(const [name,bytes]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;const p=resolve(source,name.slice(10));if(!p.startsWith(resolve(source)+sep))throw Error('Unsafe path');await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes,{flag:'wx'});}
const changes=[];async function edit(path,fn){const before=await readFile(source+'/'+path,'utf8'),after=fn(before);await writeFile(source+'/'+path,after);changes.push({path,before:hash(before),after:hash(after)});}
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Context mismatch '+a);return s.replace(a,b);}
await edit('native/dosbox/include/ed4_bgm.h',s=>s+'\nvoid ED4_BgmAfterIret();\nstruct ED4_BgmIretScope {~ED4_BgmIretScope(){ED4_BgmAfterIret();}};\n');
await edit('native/dosbox/src/cpu/cpu.cpp',s=>replace(s,'void CPU_IRET(bool use32,Bitu oldeip) {','void CPU_IRET(bool use32,Bitu oldeip) {\n ED4_BgmIretScope bgm_return_scope;'));
const returns=await readFile('scripts/phase9-8f-return.inc','utf8');
await edit('native/dosbox/src/cpu/ed4_bgm.inc',s=>replace(replace(replace(s,'void ED4_BgmInterrupt(Bitu num,Bitu oldip) {',returns+'\nvoid ED4_BgmInterrupt(Bitu num,Bitu oldip) {'),'r[5]=oldip;BgmStore(r);return;','r[5]=oldip;BgmStore(r);BgmPendingStart(r[0],oldip);return;'),'if(row==-1){','if(row==-2)return BgmReturnInfo(col);\n if(row==-1){'));
// Reuse the exact reviewed 9-8B timer delta, not a new clock implementation.
const timer=await readFile('artifacts/phase9-8b/source/instrumented/native/dosbox/src/dosbox.cpp','utf8');
const delta=JSON.parse(await readFile('artifacts/phase9-8b/source-changes.json')).changes.find(c=>c.path==='native/dosbox/src/dosbox.cpp');
await edit(delta.path,s=>{if(hash(s)!==delta.before||hash(timer)!==delta.after)throw Error('9-8B timer provenance mismatch');return timer;});
await writeFile(root+'/source-changes.json',JSON.stringify({baseSourceSha256:hash(zip),changes,timerSource:'exact reviewed 9-8B dosbox.cpp'},null,2));
