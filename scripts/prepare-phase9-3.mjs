import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {unzipSync} from 'fflate';
const root='artifacts/phase9-3',source=`${root}/source/instrumented`,hash=b=>createHash('sha256').update(b).digest('hex');
const zip=await readFile('public/sources/emulators-0.73.8-phase9-2-source.zip');
if(hash(zip)!=='96fe5a21e15c84b93b2915eb794065face69d88a599c3d85fd59df626c8536d8')throw Error('Wrong Phase 9-2 source');
await mkdir(root,{recursive:true});const before={};
async function snapshot(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await snapshot(p);else before[p]=hash(await readFile(p));}}
for(const d of ['docs','public/vendor','src','tests','scripts/phase9-2'])await snapshot(d);
await writeFile(`${root}/preserved-before.json`,JSON.stringify(before,null,2),{flag:'wx'});
const base={};for(const [name,bytes]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;
 const rel=name.slice(10),p=resolve(source,rel);if(!p.startsWith(resolve(source)+sep))throw Error('Unsafe path');
 await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes,{flag:'wx'});base[rel]=hash(bytes);
}
await writeFile(`${root}/base-source-manifest.json`,JSON.stringify(base,null,2));const changes=[];
async function patch(file,edits){let s=await readFile(source+'/'+file,'utf8');const original=hash(s);
 for(const [from,to,all=false]of edits){const count=s.split(from).length-1;if(!count||(!all&&count!==1))throw Error('Patch mismatch '+file+': '+from);s=all?s.split(from).join(to):s.replace(from,to);}
 await writeFile(source+'/'+file,s);const found=changes.find(c=>c.path===file);if(found)found.after=hash(s);else changes.push({path:file,before:original,after:hash(s)});
}
const inc=['#include "ed4_trace.h"','#include "ed4_trace.h"\n#include "ed4_cpu_trace.h"'];
await patch('native/dosbox/src/cpu/core_normal.cpp',[inc,
 ['#include "core_normal/string.h"','#include "core_normal/string.h"\n#undef GetRM\n#define GetRM Bit8u rm=Fetchb(); ED4_CPU_ModRM(rm);'],
 ['ED4_Fetch(core.cseip);','ED4_Fetch(core.cseip);\n\t\tED4_InstructionScope ed4_instruction(core.cseip);'],
 ['switch (core.opcode_index+Fetchb())','switch (ED4_CPU_Opcode(core.opcode_index+Fetchb()))'],
 ['decode_end:\n\tSAVEIP;','decode_end:\n\tSAVEIP;\n\tED4_CPU_End();']]);
// These shared headers also compile into other cores; only the normal core
// enables the defer hook. Macro expands to a no-op in uninstrumented cores.
await patch('native/dosbox/src/cpu/core_normal.cpp', [['#define CPU_TRAP_CHECK 1','#define CPU_TRAP_CHECK 1\n#define ED4_DEFER_TRACE() ED4_CPU_Defer()']]);
for(const f of ['prefix_none.h','prefix_66.h'])await patch('native/dosbox/src/cpu/core_normal/'+f,[
 ['/*\n *  Copyright','#ifndef ED4_DEFER_TRACE\n#define ED4_DEFER_TRACE() ((void)0)\n#endif\n/*\n *  Copyright'],
 ['goto decode_end;','{ ED4_DEFER_TRACE(); goto decode_end; }',true]]);
await patch('native/dosbox/src/cpu/cpu.cpp',[inc,
 ['void CPU_Interrupt(Bitu num,Bitu type,Bitu oldeip) {','void CPU_Interrupt(Bitu num,Bitu type,Bitu oldeip) {\n\tED4_ControlScope ed4_control(8,num,type);'],
 ...[['void CPU_JMP(bool use32,Bitu selector,Bitu offset,Bitu oldeip) {',1],['void CPU_RET(bool use32,Bitu bytes,Bitu oldeip) {',2],['void CPU_IRET(bool use32,Bitu oldeip) {',4],['void CPU_CALL(bool use32,Bitu selector,Bitu offset,Bitu oldeip) {',64],['bool CPU_SetSegGeneral(SegNames seg,Bitu value) {',32]].map(([s,n])=>[s,s+`\n\tED4_ControlScope ed4_control(${n});`]),
 ['void CPU_SET_CRX(Bitu cr,Bitu value) {','void CPU_SET_CRX(Bitu cr,Bitu value) {\n\tED4_ControlScope ed4_control(cr==0?16:0);'],
 ['#include "ed4_trace.inc"','#include "ed4_trace.inc"\n#include "ed4_cpu_trace.inc"']]);
await patch('native/dosbox/src/cpu/ed4_trace.inc',[inc,
 ['if(linear==ed4_trace_reset) {','if(linear==ed4_trace_reset) {\n    ED4_CPU_Flush(1,ed4_sequence+1);'],
 ['void ED4_Reboot(void) {','void ED4_Reboot(void) {\n  ED4_CPU_Flush(2,ed4_sequence+1);'],
 ['ed4_exec_result=result?1:2;ed4_error=result?-1:dos.errorcode;','ed4_exec_result=result?1:2;ed4_error=result?-1:dos.errorcode;\n  ED4_CPU_ExecResult(result);']]);
await patch('native/dosbox/src/dosbox.cpp',[inc,
 ['ret = (*cpudecoder)();','ED4_CPU_CoreBoundary(true);\n\t\t\tret = (*cpudecoder)();\n\t\t\tED4_CPU_CoreBoundary(false);'],
 ['Bitu blah = (*CallBack_Handlers[ret])();','ED4_CPU_Boundary(18,ret);\n\t\t\t\tBitu blah = (*CallBack_Handlers[ret])();\n\t\t\t\tED4_CPU_Boundary(19,ret);']]);
await patch('native/dosbox/src/dos/dos_execute.cpp',[
 ['#include "dosbox.h"','#include "dosbox.h"\n#include "ed4_cpu_trace.h"'],
 ['\tif (flags==LOAD) {','\tED4_CPU_Prepared(RealSeg(csip),RealOff(csip),RealSeg(sssp),RealOff(sssp),pspseg,flags);\n\tif (flags==LOAD) {']]);
for(const [name,path]of [['ed4_cpu_trace.h','native/dosbox/include/ed4_cpu_trace.h'],['ed4_cpu_trace.inc','native/dosbox/src/cpu/ed4_cpu_trace.inc']]){
 const b=await readFile('scripts/phase9-3/'+name);await writeFile(source+'/'+path,b);changes.push({path,before:null,after:hash(b)});
}
await writeFile(`${root}/source-changes.json`,JSON.stringify(changes,null,2));console.log(changes);
