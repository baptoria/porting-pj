import {readFile} from 'node:fs/promises';
import {checkWorkerBundle} from './phase9-3-worker-bundle.mjs';
const common=await readFile('public/dos-worker.js');
for(const root of ['public','docs/ed4']){
 const manifest=JSON.parse(await readFile(root+'/phase9-3-worker.json','utf8'));
 const b=checkWorkerBundle(common,await readFile(root+'/'+manifest.entry),await readFile(root+'/'+manifest.common),manifest);
 if(!(await readFile(root+'/dos-worker-phase9-3.js')).equals(Buffer.from(b.code)))throw Error('Phase 9-3 compatibility alias mismatch: '+root);
 if((await readFile('src/generated/phase9-3-worker.ts','utf8'))!==b.typescript)throw Error('Stale launcher Worker manifest');
 if(root==='docs/ed4'){
  const sw=await readFile(root+'/sw.js','utf8');for(const f of [manifest.entry,manifest.common,'phase9-3-worker.json'])if(!sw.includes('./'+f))throw Error('Offline cache missing '+f);
 }
}
console.log('Phase 9-3 Worker source, deployed bytes, hashes, launcher paths and offline cache agree.');
