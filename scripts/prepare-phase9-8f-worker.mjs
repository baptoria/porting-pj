import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=JSON.parse(await readFile('public/phase9-6-worker.json'));
let common=await readFile('public/'+base.common,'utf8');if(hash(common)!==base.sha256)throw Error('Wrong 9-6 common');
common=(await readFile('scripts/phase9-8f-worker-query.js','utf8'))+'\n'+common;
common=common.replace("'phase9-5b','phase9-6']","'phase9-5b','phase9-6','phase9-8f']").replace("self.ed4CommonWorkerRevision = 'phase9-6-common-1'","self.ed4CommonWorkerRevision = 'phase9-8f-common-1'");
if(common.split("adapterOperation = 'raw-read-complete';").length!==2)throw Error('Read context mismatch');
common=common.replace("adapterOperation = 'raw-read-complete';","bgmRead(path,position,done);\n        adapterOperation = 'raw-read-complete';");
const sha256=hash(common),file=`dos-worker-common-phase9-8f-${sha256.slice(0,16)}.js`,revision='phase9-8f-common-1';
const entry=`// GPL-2.0-only; immutable diagnostic bootstrap.\nself.ed4DiagnosticEngine='phase9-8f';\ntry{importScripts('./${file}');if(self.ed4CommonWorkerRevision!=='${revision}')throw Error('BGM Worker revision mismatch');self.postMessage({name:'ed4-worker-bootstrap',props:{revision:'${revision}',common:'${file}',sha256:'${sha256}'}});}catch(e){self.postMessage({name:'ed4-runtime-error',props:{source:'worker-bootstrap',stage:'import-common-worker',message:'Phase9-8F Worker mismatch/load failure: '+String(e.message).slice(0,300)}});self.close();}\n`;
const entrySha256=hash(entry),name=`dos-worker-phase9-8f-${entrySha256.slice(0,16)}.js`,manifest={revision,common:file,sha256,entry:name,entrySha256};
for(const [path,content]of [[file,common],[name,entry]]){try{if(!(await readFile('public/'+path)).equals(Buffer.from(content)))throw Error('Immutable path collision');}catch(e){if(e.code!=='ENOENT')throw e;await writeFile('public/'+path,content);}}
await writeFile('public/phase9-8f-worker.json',JSON.stringify(manifest,null,2));
await writeFile('src/generated/phase9-8f-worker.ts','// Generated immutable BGM diagnostic Worker.\nexport const PHASE98F_WORKER='+JSON.stringify(manifest,null,2)+' as const;\n');
if(process.argv.includes('--check'))for(const root of ['public','docs/ed4']){const m=JSON.parse(await readFile(root+'/phase9-8f-worker.json'));if(JSON.stringify(m)!==JSON.stringify(manifest)||hash(await readFile(root+'/'+name))!==entrySha256||hash(await readFile(root+'/'+file))!==sha256)throw Error('Deployed Worker mismatch');if(root.startsWith('docs')){const sw=await readFile(root+'/sw.js','utf8');for(const f of [name,file,'phase9-8f-worker.json'])if(!sw.includes('./'+f))throw Error('Offline cache missing '+f);}}
console.log(manifest);
