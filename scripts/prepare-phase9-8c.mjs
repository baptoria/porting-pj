import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex'),root='artifacts/phase9-8c',source=root+'/source/instrumented';
const zip=await readFile('public/sources/emulators-0.73.8-phase9-6-source.zip');
if(hash(zip)!=='26d14da06eed3d038d72e0e9d259effb677d3bd46d6d70c2d4e416ac901543bf')throw Error('Wrong base');
for(const [name,bytes]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;const p=resolve(source,name.slice(10));if(!p.startsWith(resolve(source)+sep))throw Error('Unsafe source path');await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes,{flag:'wx'});}
const changes=[];async function edit(path,fn){const original=await readFile(source+'/'+path,'utf8'),modified=fn(original);await writeFile(source+'/'+path,modified);changes.push({path,before:hash(original),after:hash(modified)});}
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Context mismatch '+a);return s.replace(a,b);}
const header='#include "ed4_bgm.h"\n';
await edit('native/dosbox/src/cpu/cpu.cpp',s=>replace(replace(s,'#include "ed4_trace.h"',header+'#include "ed4_trace.h"'),'void CPU_Interrupt(Bitu num,Bitu type,Bitu oldeip) {','void CPU_Interrupt(Bitu num,Bitu type,Bitu oldeip) {\n ED4_BgmInterrupt(num,oldeip);')+'\n#include "ed4_bgm.inc"\n');
await edit('native/dosbox/src/dos/dos.cpp',s=>replace(replace(s,'#include "ed4_trace.h"',header+'#include "ed4_trace.h"'),'MEM_BlockWrite(SegPhys(ds)+reg_dx,dos_copybuf,toread);','MEM_BlockWrite(SegPhys(ds)+reg_dx,dos_copybuf,toread);\n                ED4_BgmRead(reg_bx,SegPhys(ds)+reg_dx,toread);'));
const added={'native/dosbox/include/ed4_bgm.h':'// GPL-2.0-or-later\n#include "dosbox.h"\nvoid ED4_BgmInterrupt(Bitu,Bitu);\nvoid ED4_BgmRead(Bit16u,Bit32u,Bit16u);\n','native/dosbox/src/cpu/ed4_bgm.inc':await readFile('scripts/phase9-8c-trace.inc','utf8')};
for(const [path,data]of Object.entries(added)){await writeFile(source+'/'+path,data,{flag:'wx'});changes.push({path,before:null,after:hash(data)});}
await writeFile(root+'/source-changes.json',JSON.stringify({baseSourceSha256:hash(zip),changes},null,2));
