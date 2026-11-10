import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
const root='artifacts/phase9-8k',src=root+'/source/instrumented',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile('licenses/phase9-8i-engine.json')),zip=await readFile('public/sources/emulators-0.73.8-phase9-8i-source.zip');
if(hash(zip)!==manifest.sourceZipSha256)throw Error('I source mismatch');
for(const [name,b]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;const path=resolve(src,name.slice(10));if(!path.startsWith(resolve(src)+sep))throw Error('Unsafe source path');await mkdir(dirname(path),{recursive:true});try{await writeFile(path,b,{flag:'wx'});}catch(e){if(e.code!=='EEXIST'||hash(await readFile(path))!==hash(b))throw e;}}
const path='native/dosbox/src/dosbox.cpp',before=await readFile(src+'/'+path,'utf8');
function replace(s,a,b){if(s.split(a).length!==2)throw Error('Context mismatch '+a);return s.replace(a,b);}
let after=replace(before,'static Bitu Normal_Loop(void) {',`// K: coarse guest-tick boundaries only, never per-instruction tracing.
static double ed4_k_yields=0,ed4_k_busy_max=0,ed4_k_clamp_ticks=0,ed4_k_clamps=0,ed4_k_idle_start=-1,ed4_k_idle_fraction=0,ed4_k_idle_ms=0;
extern "C" EMSCRIPTEN_KEEPALIVE double ed4_supply_value(int key) {
 switch(key){case 0:return ed4_k_yields;case 1:return ed4_k_busy_max;case 2:return ed4_k_clamp_ticks;case 3:return ed4_k_clamps;case 4:return ed4_k_idle_ms;default:return -1;}
}
static Bitu Normal_Loop(void) {`);
after=replace(after,`    if (GetTicks() - lastSleepTime > LOOP_EXECUTION_TIME) {
        DelayWithYield(0);
        lastSleepTime = GetTicks();
    }`,`    if (GetTicks() - lastSleepTime >= 4) {
        ed4_k_busy_max=std::max(ed4_k_busy_max,double(GetTicks()-lastSleepTime));
        ++ed4_k_yields;
        DelayWithYield(0);
        lastSleepTime = GetTicks();
    }`);
after=replace(after,'\t\t\tGFX_Events();',`            // Yield between complete PIC/CPU tick slices; retain all pending ticks.
            // Asyncify is already enabled for Normal_Loop; no extra CPU callbacks.
            if (GetTicks()-lastSleepTime>=4) {
                ed4_k_busy_max=std::max(ed4_k_busy_max,double(GetTicks()-lastSleepTime));
                ++ed4_k_yields;DelayWithYield(0);lastSleepTime=GetTicks();
            }
\t\t\tGFX_Events();`);
// Existing JS fork zeros accumulated busy wall time whenever it polls within the
// same millisecond. Keep the accumulator until the original auto-adjust reset.
after=replace(after,'\tticksAdded = 0;\n        ticksDone = 0;\n        return;','    ticksAdded = 0;\n    // K: retain accumulated busy time, measure the wait for the next wall tick.\n    if(ed4_k_idle_start<0)ed4_k_idle_start=emscripten_get_now();\n    return;');
after=replace(after,'\tticksDone += ticksRemain;',`	ticksDone += ticksRemain;
    // The JS fork busy-polls instead of SDL_Delay; exclude only measured idle
    // wall time, not the work of CPU/PIC/mixer or a long processing overrun.
    if(ed4_k_idle_start>=0){
        const double idle=emscripten_get_now()-ed4_k_idle_start;
        ed4_k_idle_ms+=idle;ed4_k_idle_fraction+=idle;ed4_k_idle_start=-1;
        const int whole=static_cast<int>(ed4_k_idle_fraction);
        ed4_k_idle_fraction-=whole;ticksDone=std::max(0,ticksDone-whole);
    }`);
after=replace(after,'\tif ( ticksRemain > 20 ) {','\tif ( ticksRemain > 20 ) {\n        ++ed4_k_clamps;ed4_k_clamp_ticks+=ticksRemain-20;');
await writeFile(src+'/'+path,after);
await writeFile(root+'/source-changes.json',JSON.stringify({baseSourceSha256:hash(zip),changes:[{path,before:hash(before),after:hash(after)}],timerSource:'I multiplier unchanged; 20ms clamp preserved and counted',scheduler:'4ms cooperative deadline at completed guest-tick boundaries; accumulated auto-adjust wall time preserved on zero-duration polls',idleAccounting:'Exclude measured idle wall wait, preserving accumulated CPU/PIC processing wall time and original auto-adjust target',audioClock:'Unchanged I PIC mixer / 512-frame push / ring preroll'},null,2));
