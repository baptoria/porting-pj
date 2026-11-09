import {common94} from './phase9-4-common.mjs';
import {readFile} from 'node:fs/promises';
import {checkWorkerBundle} from './phase9-4-worker-bundle.mjs';
const common=await common94();
for(const root of ['public','docs/ed4']){
 const manifest=JSON.parse(await readFile(root+'/phase9-4-worker.json','utf8'));
 const b=checkWorkerBundle(common,await readFile(root+'/'+manifest.entry),await readFile(root+'/'+manifest.common),manifest);
 if(!(await readFile(root+'/dos-worker-phase9-4.js')).equals(Buffer.from(b.code)))throw Error('Phase 9-4 compatibility alias mismatch: '+root);
 if((await readFile('src/generated/phase9-4-worker.ts','utf8'))!==b.typescript)throw Error('Stale launcher Worker manifest');
 if(root==='docs/ed4'){
  const sw=await readFile(root+'/sw.js','utf8');for(const f of [manifest.entry,manifest.common,'phase9-4-worker.json'])if(!sw.includes('./'+f))throw Error('Offline cache missing '+f);
 }
}
console.log('Phase 9-4 Worker source, deployed bytes, hashes, launcher paths and offline cache agree.');
