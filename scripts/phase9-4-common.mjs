import {readFile} from 'node:fs/promises';
export async function common94(){
 let s=await readFile('public/dos-worker.js','utf8');
 const from="['phase9-2','phase9-3']",marker="self.ed4CommonWorkerRevision = 'phase9-3-common-1'";
 if(s.split(from).length!==2||s.split(marker).length!==2)throw Error('Review common Worker source before generating Phase 9-4');
 return Buffer.from(s.replace(from,"['phase9-2','phase9-3','phase9-4']").replace(marker,"self.ed4CommonWorkerRevision = 'phase9-4-common-1'"));
}
