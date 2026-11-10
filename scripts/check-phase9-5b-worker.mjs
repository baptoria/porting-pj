import {outDir} from './build-target.mjs';
import {common95b} from './phase9-5b-common.mjs';
import {readFile} from 'node:fs/promises';
import {checkWorkerBundle} from './phase9-5b-worker-bundle.mjs';
const common=await common95b();
for(const root of ['public',outDir]){
 const manifest=JSON.parse(await readFile(root+'/phase9-5b-worker.json','utf8'));
 const b=checkWorkerBundle(common,await readFile(root+'/'+manifest.entry),await readFile(root+'/'+manifest.common),manifest);
 if(!(await readFile(root+'/dos-worker-phase9-5b.js')).equals(Buffer.from(b.code)))throw Error('Phase 9-5B compatibility alias mismatch: '+root);
 if((await readFile('src/generated/phase9-5b-worker.ts','utf8'))!==b.typescript)throw Error('Stale launcher Worker manifest');
 if(root===outDir){
  const sw=await readFile(root+'/sw.js','utf8');for(const f of [manifest.entry,manifest.common,'phase9-5b-worker.json'])if(!sw.includes('./'+f))throw Error('Offline cache missing '+f);
 }
}
console.log('Phase 9-5B Worker source, deployed bytes, hashes, launcher paths and offline cache agree.');
