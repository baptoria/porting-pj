// GPL-2.0-only. Local artifacts only; no public/docs output.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {unzipSync,zipSync} from 'fflate';
const root='artifacts/phase9-8b',src=root+'/source/instrumented',out=root+'/engine';
const hash=b=>createHash('sha256').update(b).digest('hex');
const change=JSON.parse(await readFile(root+'/source-changes.json'));
const original=unzipSync(await readFile('public/sources/emulators-0.73.8-phase9-6-source.zip'));
for(const [p,b]of Object.entries(original)){if(!p.startsWith('emulators/')||p.endsWith('/'))continue;const rel=p.slice(10),expected=change.changes.find(c=>c.path===rel)?.after??hash(b);if(hash(await readFile(src+'/'+rel))!==expected)throw Error('Unexpected source change '+rel);}
await mkdir(out,{recursive:true});const manifest={id:'phase9-8b-local-only',emscripten:'3.1.21',files:{},changes:change};
for(const file of ['wdosbox.js','wdosbox.wasm','wdosbox.js.symbols']){let b=await readFile(root+'/build/instrumented/'+file);if(file==='wdosbox.js')b=Buffer.concat([b,await readFile(src+'/src/dos/dosbox/ts/worker-server.js')]);await writeFile(out+'/'+file,b);manifest.files[file]={sha256:hash(b),bytes:b.length};}
const zip={};async function add(p,r){for(const e of await readdir(p,{withFileTypes:true})){if(e.isDirectory())await add(p+'/'+e.name,r+'/'+e.name);else zip[r+'/'+e.name]=await readFile(p+'/'+e.name);}}
await add(src,'emulators');for(const p of ['prepare-phase9-8b.mjs','build-phase9-8b.sh','package-phase9-8b.mjs'])zip['launcher-scripts/'+p]=await readFile('scripts/'+p);
const source=zipSync(zip,{level:6});await writeFile(out+'/corresponding-source.zip',source);manifest.sourceSha256=hash(source);await writeFile(out+'/manifest.json',JSON.stringify(manifest,null,2));console.log(manifest);
