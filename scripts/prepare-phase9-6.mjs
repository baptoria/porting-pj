import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {unzipSync} from 'fflate';
const root='artifacts/phase9-6',source=`${root}/source/instrumented`,hash=b=>createHash('sha256').update(b).digest('hex');
const zip=await readFile('public/sources/emulators-0.73.8-phase9-5b-source.zip');
if(hash(zip)!=='191bcfa8fe13d91bc59e34a3faecf53206ba4c52c46ee84050a663c51c856bca')throw Error('Wrong Phase9-5B base');
const base={};for(const [name,bytes]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;const rel=name.slice(10),p=resolve(source,rel);if(!p.startsWith(resolve(source)+sep))throw Error('Unsafe path');await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes,{flag:'wx'});base[rel]=hash(bytes);}
await writeFile(root+'/base-source-manifest.json',JSON.stringify(base,null,2),{flag:'wx'});const changes=[];
async function change(path,fn){const original=await readFile(source+'/'+path,'utf8'),modified=fn(original);if(original===modified)throw Error('No change '+path);await writeFile(source+'/'+path,modified);changes.push({path,before:hash(original),after:hash(modified)});}
function replace(s,from,to){if(s.split(from).length!==2)throw Error('Context mismatch '+from);return s.replace(from,to);}
await change('CMakeLists.txt',s=>replace(s,'set(X86 false)',`option(ED4_CPU_TRACE_ENABLED "Include expensive per-instruction diagnostics" OFF)
if(ED4_CPU_TRACE_ENABLED)
 add_definitions(-DED4_CPU_TRACE_ENABLED=1)
else()
 add_definitions(-DED4_CPU_TRACE_ENABLED=0)
endif()
set(X86 false)`));
await change('native/dosbox/include/ed4_cpu_trace.h',s=>{
 s=replace(s,'class ED4_InstructionScope {','#if ED4_CPU_TRACE_ENABLED\nclass ED4_InstructionScope {');
 return replace(s,'#endif',`#else
// Compile-time removal: no buffers, snapshots, counters, or operand evaluation.
class ED4_InstructionScope { public: explicit ED4_InstructionScope(Bitu) {} };
class ED4_ControlScope { public: ED4_ControlScope(Bitu,Bitu=0xffffffffu,Bitu=0) {} };
inline Bitu ED4_CPU_Opcode(Bitu op,Bitu) { return op; }
inline void ED4_CPU_ModRM(Bitu) {}
inline void ED4_CPU_Defer() {}
inline void ED4_CPU_End() {}
inline void ED4_CPU_Boundary(Bitu,Bitu=0) {}
inline void ED4_CPU_CoreBoundary(bool) {}
inline void ED4_CPU_Flush(Bitu,Bitu) {}
inline void ED4_CPU_Prepared(Bitu,Bitu,Bitu,Bitu,Bitu,Bitu) {}
inline void ED4_CPU_ExecResult(bool) {}
#endif
#endif`);
});
await change('native/dosbox/src/cpu/ed4_cpu_trace.inc',s=>'#if ED4_CPU_TRACE_ENABLED\n'+s+'\n#endif\n');
await change('native/dosbox/src/cpu/core_normal.cpp',s=>replace(s,'\t\tif(ed4_trace_pending || core.cseip==ed4_trace_reset) ED4_Fetch(core.cseip);','#if ED4_CPU_TRACE_ENABLED\n\t\tif(ed4_trace_pending || core.cseip==ed4_trace_reset) ED4_Fetch(core.cseip);\n#endif'));
await change('native/dosbox/src/dosbox.cpp',s=>{
 s=replace(s,'static Bitu Normal_Loop(void) {',`// Read-only coarse sampler. No per-instruction counting. Disabled unless requested.
static bool ed4_perf_active=false;
static double ed4_perf_decoder_ms=0,ed4_perf_slices=0,ed4_perf_timed=0;
static unsigned ed4_perf_sample_counter=0;
extern "C" EMSCRIPTEN_KEEPALIVE double ed4_perf_value(int key) {
 switch(key) {
 case 0: return CPU_CycleMax;
 case 1: return CPU_CycleAutoAdjust?1:0;
 case 2: return PIC_Ticks;
 case 3: return ed4_perf_decoder_ms;
 case 4: return ed4_perf_slices;
 case 5: return cpudecoder==CPU_Core_Normal_Run?1:cpudecoder==CPU_Core_Simple_Run?3:cpudecoder==CPU_Core_Full_Run?4:0;
 case 6: return ed4_perf_timed;
 case 7: return 1024;
 case 10: ed4_perf_decoder_ms=ed4_perf_slices=ed4_perf_timed=0;ed4_perf_sample_counter=0;ed4_perf_active=true;return 1;
 case 11: ed4_perf_active=false;return 0;
 default: return -1;
 }
}
static Bitu Normal_Loop(void) {`);
 return replace(s,'\t\t\tret = (*cpudecoder)();',`            const bool ed4_sample=ed4_perf_active&&((ed4_perf_sample_counter++ & 1023u)==0);
            const double ed4_start=ed4_sample?emscripten_get_now():0;
\t\t\tret = (*cpudecoder)();
            if(ed4_perf_active)++ed4_perf_slices;
            if(ed4_sample){ed4_perf_decoder_ms+=emscripten_get_now()-ed4_start;++ed4_perf_timed;}`);
});
await writeFile(root+'/source-changes.json',JSON.stringify(changes,null,2),{flag:'wx'});
console.log(changes);
