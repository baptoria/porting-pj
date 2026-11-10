import {outDir} from './build-target.mjs';
import {common96} from './phase9-6-common.mjs';
import {readFile} from 'node:fs/promises';
import {checkWorkerBundle} from './phase9-6-worker-bundle.mjs';
const common=await common96();
for(const root of ['public',outDir]){
 const manifest=JSON.parse(await readFile(root+'/phase9-6-worker.json','utf8'));
 const b=checkWorkerBundle(common,await readFile(root+'/'+manifest.entry),await readFile(root+'/'+manifest.common),manifest);
 if(!(await readFile(root+'/dos-worker-phase9-6.js')).equals(Buffer.from(b.code)))throw Error('Phase 9-6 compatibility alias mismatch: '+root);
 if((await readFile('src/generated/phase9-6-worker.ts','utf8'))!==b.typescript)throw Error('Stale launcher Worker manifest');
 if(root===outDir){
  const sw=await readFile(root+'/sw.js','utf8');for(const f of [manifest.entry,manifest.common,'phase9-6-worker.json'])if(!sw.includes('./'+f))throw Error('Offline cache missing '+f);
 }
}
console.log('Phase 9-6 Worker source, deployed bytes, hashes, launcher paths and offline cache agree.');
