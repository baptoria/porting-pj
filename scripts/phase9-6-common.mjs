import {readFile} from 'node:fs/promises';
export async function common96(){
 let s=await readFile('public/dos-worker.js','utf8');
 const from="['phase9-2','phase9-3']",marker="self.ed4CommonWorkerRevision = 'phase9-3-common-1'";
 if(s.split(from).length!==2||s.split(marker).length!==2)throw Error('Review common Worker source before generating Phase 9-6');
 s=s.replace('const send = self.postMessage.bind(self);',(await readFile('scripts/phase9-6-worker-performance.js','utf8'))+'\nconst send = self.postMessage.bind(self);');
 s=s.replace('  return send(message, transfer);',"  if(perfActive && message?.name==='ws-update-lines')message.props.ed4SentAt=performance.timeOrigin+performance.now();\n  return send(message, transfer);");
 return Buffer.from(s.replace(from,"['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6']").replace(marker,"self.ed4CommonWorkerRevision = 'phase9-6-common-1'"));
}
