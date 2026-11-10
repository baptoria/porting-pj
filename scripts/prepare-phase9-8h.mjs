// GPL-2.0-only. Separate 9-8F derivative; no game or BGM mixer hooks.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
const root='artifacts/phase9-8h',src=root+'/source/instrumented',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile('licenses/phase9-8f-engine.json')),zip=await readFile('public/sources/emulators-0.73.8-phase9-8f-source.zip');
if(hash(zip)!==manifest.sourceZipSha256)throw Error('9-8F source mismatch');
for(const [name,b]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;const path=resolve(src,name.slice(10));if(!path.startsWith(resolve(src)+sep))throw Error('Unsafe source path');await mkdir(dirname(path),{recursive:true});await writeFile(path,b,{flag:'wx'});}
const changes=[];function replace(s,a,b){if(s.split(a).length!==2)throw Error('Context mismatch: '+a);return s.replace(a,b);}
async function edit(path,fn){const before=await readFile(src+'/'+path,'utf8'),after=fn(before);await writeFile(src+'/'+path,after);changes.push({path,before:hash(before),after:hash(after)});}
await edit('native/dosbox/src/dosbox.cpp',s=>replace(s,'static unsigned ed4_test_speed=1;','static unsigned ed4_test_speed=1;\nextern "C" EMSCRIPTEN_KEEPALIVE int ed4_speed_value() { return ed4_test_speed; }'));
await edit('native/dosbox-jsdos/jsdos/jsdos-mixer.cpp',s=>{
 s=replace(s,'static void MIXER_CallBack(float *stream, int len);','static bool MIXER_CallBack(float *stream, int len);\nstatic double ed4_audio_sent=0,ed4_audio_underflow=0,ed4_audio_clamped=0;\nextern "C" EMSCRIPTEN_KEEPALIVE double ed4_audio_value(int key) {\n switch(key){case 0:return ed4_audio_sent;case 1:return ed4_audio_underflow;case 2:return ed4_audio_clamped;case 3:return PIC_Ticks;default:return -1;}\n}');
 s=replace(s,'static auto pushedAt = GetMsPassedFromStart();','// Drain in guest time; host plays each packet at the acknowledged 1x/2x.\n  static Bit32u pushedAt = PIC_Ticks;');
 s=replace(s,'auto now = GetMsPassedFromStart();\n  auto dt = now - pushedAt;','Bit32u now = PIC_Ticks;\n  Bit32u dt = now - pushedAt;');
 s=replace(s,'dt * mixer.freq / 1000 + restSamplesCount','static_cast<double>(dt) * mixer.freq / 1000.0 + restSamplesCount');
 s=replace(s,'samplesCount = BLOCK_SIZE;','++ed4_audio_clamped;\n      samplesCount = BLOCK_SIZE;');
 s=replace(s,'MIXER_CallBack(blockBuffer, samplesCount);\n    if (!muted) {','const bool valid=MIXER_CallBack(blockBuffer, samplesCount);\n    if (valid && !muted) {\n        ed4_audio_sent+=samplesCount;');
 s=replace(s,'static void MIXER_CallBack(float *output, int frames) {','static bool MIXER_CallBack(float *output, int frames) {');
 s=replace(s,'if((need - mixer.done) > (need >>7) ) //Max 1 procent stretch.\n\t\t\treturn;','if((need - mixer.done) > (need >>7) ) { // Never resend a stale block on underrun.\n            ++ed4_audio_underflow; return false;\n        }');
 s=replace(s,'\n}\n\nstatic void MIXER_Stop','\n return true;\n}\n\nstatic void MIXER_Stop');return s;
});
await writeFile(root+'/source-changes.json',JSON.stringify({baseSourceSha256:hash(zip),changes,timerSource:'Unchanged 9-8F / 9-8B tick multiplier; new getter only',audioClock:'PIC_Ticks; no BGM separation or device muting'},null,2));
