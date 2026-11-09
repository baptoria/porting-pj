import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='artifacts/phase9-2', source=`${root}/source/instrumented`;
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(root,{recursive:true});
const before={};
async function snapshot(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await snapshot(p);else before[p]=hash(await readFile(p));}}
for(const d of ['docs','public/vendor','src','tests/e2e'])await snapshot(d);
await writeFile(`${root}/preserved-before.json`,JSON.stringify(before,null,2),{flag:'wx'});
await cp('artifacts/phase9-1/source/fixed',source,{recursive:true,errorOnExist:true,force:false});
const changes=[];
async function patch(file,edits){const path=source+'/'+file;let s=await readFile(path,'utf8');const original=hash(s);
 for(const [from,to]of edits){if(s.split(from).length!==2)throw Error('Non-unique patch '+file+': '+from);s=s.replace(from,to);}
 await writeFile(path,s);changes.push({path:file,before:original,after:hash(s)});
}
const inc=['#include "dosbox.h"','#include "dosbox.h"\n#include "ed4_trace.h"'];
await patch('native/dosbox/src/cpu/cpu.cpp',[
 inc,
 ['\tlastint=num;\n\tFillFlags();','\tlastint=num;\n\tFillFlags();\n\tED4_Interrupt(num,type,oldeip);'],
 ['Segs.phys[cs]=Segs.val[cs]<<4;','Segs.phys[cs]=Segs.val[cs]<<4;\n\t\tED4_InterruptTarget(SegPhys(cs)+reg_eip);'],
 ['void CPU_JMP(bool use32,Bitu selector,Bitu offset,Bitu oldeip) {\n\tif (!cpu.pmode || (reg_flags & FLAG_VM)) {','void CPU_JMP(bool use32,Bitu selector,Bitu offset,Bitu oldeip) {\n\tif (!cpu.pmode || (reg_flags & FLAG_VM)) {\n\t\tED4_Jump(selector,use32?offset:(offset&0xffff),oldeip);'],
 ]);
await writeFile(source+'/native/dosbox/src/cpu/cpu.cpp','\n#include "ed4_trace.inc"\n',{flag:'a'});
await patch('native/dosbox/src/cpu/core_normal.cpp',[inc,['\t\tLOADIP;\n\t\tcore.opcode_index','\t\tLOADIP;\n\t\tif(ed4_trace_pending || core.cseip==ed4_trace_reset) ED4_Fetch(core.cseip);\n\t\tcore.opcode_index']]);
await patch('native/dosbox/src/dosbox.cpp',[inc,['Bitu blah = (*CallBack_Handlers[ret])();','ED4_Dispatch(ret);\n\t\t\t\tBitu blah = (*CallBack_Handlers[ret])();']]);
await patch('native/dosbox/src/ints/bios.cpp',[inc,
 ['static Bitu Reboot_Handler(void) {','static Bitu Reboot_Handler(void) {\n\tED4_Reboot();'],
 ['\tabort();','\tED4_Abort();\n\tabort();'],
 ['RealPt rptr = callback[10].Get_RealPointer();','RealPt rptr = callback[10].Get_RealPointer();\n\t\tED4_Configure(Real2Phys(rptr),Real2Phys(BIOS_DEFAULT_RESET_LOCATION),callback[10].Get_callback());']]);
await patch('native/dosbox/src/dos/dos.cpp',[inc,['\t\t\tif (!DOS_Execute(name1,SegPhys(es)+reg_bx,reg_al)) {','\t\t\tED4_ExecRequest(name1,reg_al);\n\t\t\tconst bool ed4_loaded=DOS_Execute(name1,SegPhys(es)+reg_bx,reg_al);\n\t\t\tED4_ExecResult(ed4_loaded);\n\t\t\tif (!ed4_loaded) {']]);
for(const [name,path]of [['ed4_trace.h','native/dosbox/include/ed4_trace.h'],['ed4_trace.inc','native/dosbox/src/cpu/ed4_trace.inc']]){
 const bytes=await readFile('scripts/phase9-2/'+name);await writeFile(source+'/'+path,bytes);changes.push({path,before:null,after:hash(bytes)});
}
// Recompute after hashes, including the implementation include appended above.
for(const c of changes)c.after=hash(await readFile(source+'/'+c.path));
await writeFile(`${root}/source-changes.json`,JSON.stringify(changes,null,2));
console.log(changes);
