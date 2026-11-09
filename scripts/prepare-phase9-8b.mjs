// GPL-2.0-only. Isolated local clock experiment; never replaces a shipped engine.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex');
const root='artifacts/phase9-8b',source=root+'/source/instrumented';
const zip=await readFile('public/sources/emulators-0.73.8-phase9-6-source.zip');
if(hash(zip)!=='26d14da06eed3d038d72e0e9d259effb677d3bd46d6d70c2d4e416ac901543bf')throw Error('Wrong source');
for(const [name,bytes]of Object.entries(unzipSync(zip))){
 if(!name.startsWith('emulators/')||name.endsWith('/'))continue;
 const p=resolve(source,name.slice(10));if(!p.startsWith(resolve(source)+sep))throw Error('Unsafe source path');
 await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes,{flag:'wx'});
}
const path='native/dosbox/src/dosbox.cpp',original=await readFile(source+'/'+path,'utf8');
const marker='static Bitu Normal_Loop(void) {';
const call='} else {increaseticks();return 0;}';
if(original.split(marker).length!==2||original.split(call).length!==2)throw Error('Source context mismatch');
const modified=original.replace(marker,`// Local public-probe experiment: change only the number of guest ticks due.
// Host clock, yield deadlines and audio output clock remain real-time.
// This alone is NOT a BGM-safe playable 2x mode.
static unsigned ed4_test_speed=1;
extern "C" EMSCRIPTEN_KEEPALIVE int ed4_test_set_speed(int speed) {
 if(speed!=1 && speed!=2)return -1;
 ed4_test_speed=speed;
 return ed4_test_speed;
}
${marker}`).replace(call,'} else {increaseticks();if(!ticksLocked)ticksRemain*=ed4_test_speed;return 0;}');
await writeFile(source+'/'+path,modified);
await writeFile(root+'/source-changes.json',JSON.stringify({baseSourceSha256:hash(zip),changes:[{path,before:hash(original),after:hash(modified)}],scope:'local public tests only; no production engine registration'},null,2));
console.log('Isolated Phase9-8B source prepared; only dosbox.cpp changed.');
