import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='artifacts/phase9-8e/online',base='https://baptoria.github.io/porting-pj/ed4/',repo='https://raw.githubusercontent.com/baptoria/porting-pj/0ed2f1a0ec1d4ca0f8030c9ab587cc1319b9251b/docs/ed4/';await mkdir(root,{recursive:true});const result={checkedAt:new Date().toISOString(),files:[]};
async function get(label,url){try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)}),b=Buffer.from(await r.arrayBuffer());await writeFile(root+'/'+label,b);result.files.push({label,url,status:r.status,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex'),lastModified:r.headers.get('last-modified'),etag:r.headers.get('etag')});return r.ok?b:null;}catch(e){result.files.push({label,url,error:String(e)});return null;}}
const online=await get('pages-index.html',base),repository=await get('repo-index.html',repo+'index.html');
for(const [label,b,prefix]of [['pages',online,base],['repo',repository,repo]])if(b){const js=b.toString().match(/assets\/[^" ]+\.js/)[0],css=b.toString().match(/assets\/[^" ]+\.css/)[0];const code=await get(label+'-bundle.js',prefix+js);await get(label+'-style.css',prefix+css);await get(label+'-sw.js',prefix+'sw.js');result[label]={js,css,phase98d:code?.includes(Buffer.from('phase9-8d')),phase98c:code?.includes(Buffer.from('phase9-8c'))};}
for(const p of ['phase9-8d-worker.json','vendor/experimental/phase9-8d/wdosbox.wasm','vendor/experimental/phase9-8d/manifest.json']){const label=p.replaceAll('/','_');await get('pages-'+label,base+p);await get('repo-'+label,repo+p);}
await get('pages-settings.json','https://api.github.com/repos/baptoria/porting-pj/pages');
for(const [label,prefix] of [['pages',base],['repo',repo]])await get(label+'-manifest.webmanifest',prefix+'manifest.webmanifest');
const worker=JSON.parse(await readFile(root+'/repo-phase9-8d-worker.json','utf8'));
for(const key of ['entry','common'])for(const [label,prefix] of [['pages',base],['repo',repo]])await get(label+'-worker-'+key+'.js',prefix+worker[key]);
await writeFile(root+'/comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
