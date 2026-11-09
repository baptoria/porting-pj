import {common95b} from './phase9-5b-common.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {workerBundle,checkWorkerBundle} from './phase9-5b-worker-bundle.mjs';
const common=await common95b(),b=workerBundle(common);
// Content-addressed files must never silently change under an existing name.
for(const [file,bytes]of [[b.manifest.common,common],[b.manifest.entry,Buffer.from(b.code)]]){
 const path='public/'+file;
 try{if(!(await readFile(path)).equals(bytes))throw Error('Immutable Worker path already contains different bytes: '+path);}
 catch(e){if(e.code!=='ENOENT')throw e;await writeFile(path,bytes);}
}
// Compatibility alias for an uncached older launcher; updated launcher uses the
// content-addressed entry so a cached old alias cannot select the old common file.
await writeFile('public/dos-worker-phase9-5b.js',b.code);
await mkdir('src/generated',{recursive:true});
await writeFile('src/generated/phase9-5b-worker.ts',b.typescript);
await writeFile('public/phase9-5b-worker.json',JSON.stringify(b.manifest,null,2)+'\n');
checkWorkerBundle(common,await readFile('public/'+b.manifest.entry),await readFile('public/'+b.manifest.common),b.manifest);
console.log('Pinned Phase 9-5B Worker:',b.manifest.sha256);
