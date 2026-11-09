import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {unzipSync} from 'fflate';
const root='artifacts/phase9-4',source=`${root}/source/instrumented`,hash=b=>createHash('sha256').update(b).digest('hex');
const zip=await readFile('public/sources/emulators-0.73.8-phase9-3-source.zip');
if(hash(zip)!=='796202ee431d795d1e4b70339b9ac23ddf538b482a64baceb119b9c1563c0a0a')throw Error('Wrong Phase 9-3 source');
await mkdir(root,{recursive:true});const before={};
async function snapshot(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await snapshot(p);else before[p]=hash(await readFile(p));}}
for(const d of ['docs','public/vendor','src','tests','scripts/phase9-2','scripts/phase9-3','public/sources'])await snapshot(d);
await writeFile(`${root}/preserved-before.json`,JSON.stringify(before,null,2),{flag:'wx'});
const base={};for(const [name,bytes]of Object.entries(unzipSync(zip))){if(!name.startsWith('emulators/')||name.endsWith('/'))continue;
 const rel=name.slice(10),p=resolve(source,rel);if(!p.startsWith(resolve(source)+sep))throw Error('Unsafe path');
 await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes,{flag:'wx'});base[rel]=hash(bytes);
}
await writeFile(`${root}/base-source-manifest.json`,JSON.stringify(base,null,2));const changes=[];
async function patch(file,edits){let s=await readFile(source+'/'+file,'utf8');const original=hash(s);
 for(const [from,to,all=false]of edits){const count=s.split(from).length-1;if(!count||(!all&&count!==1))throw Error('Patch mismatch '+file+': '+from);s=all?s.split(from).join(to):s.replace(from,to);}
 await writeFile(source+'/'+file,s);const found=changes.find(c=>c.path===file);if(found)found.after=hash(s);else changes.push({path:file,before:original,after:hash(s)});
}
await patch('native/dosbox/src/cpu/core_normal.cpp', [['ED4_CPU_Opcode(core.opcode_index+Fetchb())','ED4_CPU_Opcode(core.opcode_index+Fetchb(),core.prefixes&1)']]);
for(const [name,path]of [['ed4_cpu_trace.h','native/dosbox/include/ed4_cpu_trace.h'],['ed4_cpu_trace.inc','native/dosbox/src/cpu/ed4_cpu_trace.inc']]){const before=hash(await readFile(source+'/'+path));const b=await readFile('scripts/phase9-4/'+name);await writeFile(source+'/'+path,b);changes.push({path,before,after:hash(b)});}
await writeFile(root+'/source-changes.json',JSON.stringify(changes,null,2));console.log(changes);
