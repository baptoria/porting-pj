// GPL-2.0-only. Reuse EXACT 9-6 common code + WASM; only add an on-demand
// numerical RAW status query. No FS reads, persistence or audio sample exports.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const pinned=JSON.parse(await readFile('public/phase9-6-worker.json','utf8'));
if(hash(await readFile('public/'+pinned.common))!==pinned.sha256)throw Error('Phase 9-6 common hash mismatch');
const entry=(await readFile('public/'+pinned.entry,'utf8')).replace("self.ed4DiagnosticEngine='phase9-6';",`self.ed4DiagnosticEngine='phase9-6';
// Listener precedes the common protocol listener, so this never enters js-dos.
self.addEventListener('message',event=>{
  if(event.data?.name!=='ed4-audio-status')return;
  event.stopImmediatePropagation();
  const id=event.data.id;if(!Number.isSafeInteger(id)||id<1)return;
  bootstrapSend({name:'ed4-audio-status',props:{id,reads:musicStats.reads,
    bytes:musicStats.bytes,largestRead:musicStats.largestRead,mounted:music.length}});
});`);
if(!entry.includes("name:'ed4-audio-status'"))throw Error('Missing status listener');
const entrySha256=hash(entry),manifest={...pinned,entry:`dos-worker-phase9-7-${entrySha256.slice(0,16)}.js`,entrySha256};
try{if(!(await readFile('public/'+manifest.entry)).equals(Buffer.from(entry)))throw Error('Immutable path differs');}
catch(e){if(e.code!=='ENOENT')throw e;await writeFile('public/'+manifest.entry,entry);}
await writeFile('public/phase9-7-worker.json',JSON.stringify(manifest,null,2)+'\n');
await writeFile('src/generated/phase9-7-worker.ts',`// Generated; same reviewed 9-6 common/engine, read-only status query.\nexport const PHASE97_WORKER=${JSON.stringify(manifest,null,2)} as const;\n`);
if(process.argv.includes('--check')){
 for(const root of ['public','docs/ed4']){
  const m=JSON.parse(await readFile(root+'/phase9-7-worker.json','utf8'));
  if(JSON.stringify(m)!==JSON.stringify(manifest)||hash(await readFile(root+'/'+m.entry))!==entrySha256||hash(await readFile(root+'/'+m.common))!==pinned.sha256)throw Error('Phase 9-7 deployed Worker mismatch');
 }
 const sw=await readFile('docs/ed4/sw.js','utf8');
 for(const f of [manifest.entry,manifest.common,'phase9-7-worker.json'])if(!sw.includes('./'+f))throw Error('Offline omission: '+f);
}
console.log('Pinned audio status Worker:',entrySha256,'common:',pinned.sha256);
