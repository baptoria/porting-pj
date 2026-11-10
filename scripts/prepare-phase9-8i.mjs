// GPL-2.0-only. Isolated H derivative; no opcode, VGA, device or file changes.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
const root='artifacts/phase9-8i',src=root+'/source/instrumented',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile('licenses/phase9-8h-engine.json')),zip=await readFile('public/sources/emulators-0.73.8-phase9-8h-source.zip');
if(hash(zip)!==manifest.sourceZipSha256)throw Error('H source mismatch');
for(const [name,b]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;const path=resolve(src,name.slice(10));if(!path.startsWith(resolve(src)+sep))throw Error('Unsafe source path');await mkdir(dirname(path),{recursive:true});await writeFile(path,b,{flag:'wx'});}
const path='native/dosbox/src/dosbox.cpp',before=await readFile(src+'/'+path,'utf8');
const needle='static unsigned ed4_test_speed=1;';if(before.split(needle).length!==2)throw Error('Context mismatch');
const after=before.replace(needle,needle+`
// Explicit session-only comparison, applied AFTER boot at the 2x request.
// 0 restores the CPU policy observed before override; never edits guest BAT.
static bool ed4_cycles_active=false,ed4_saved_auto=false;
static Bits ed4_saved_cycles=0;
extern "C" EMSCRIPTEN_KEEPALIVE int ed4_cycles_override(int value) {
 if(value!=0 && value!=12000 && value!=16000 && value!=24000)return -1;
 if(value==0){if(ed4_cycles_active){CPU_CycleAutoAdjust=ed4_saved_auto;CPU_CycleMax=ed4_saved_cycles;ed4_cycles_active=false;}return 0;}
 if(!ed4_cycles_active){ed4_saved_auto=CPU_CycleAutoAdjust;ed4_saved_cycles=CPU_CycleMax;ed4_cycles_active=true;}
 CPU_CycleAutoAdjust=false;CPU_CycleMax=value;CPU_CycleLeft=0;return CPU_CycleMax;
}
`);
await writeFile(src+'/'+path,after);
await writeFile(root+'/source-changes.json',JSON.stringify({baseSourceSha256:hash(zip),changes:[{path,before:hash(before),after:hash(after)}],timerSource:'Unchanged H tick multiplier',audioClock:'Unchanged H PIC_Ticks; host worklet experiment',cycles:'Explicit temporary override on 2x, restore on 1x'},null,2));
