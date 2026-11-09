// Read-only validation of the separated deployment and corresponding source.
import {readFile,readdir,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {unzipSync} from 'fflate';
const hash=b=>createHash('sha256').update(b).digest('hex'),check=(condition,message)=>{if(!condition)throw Error(message);};
const before=JSON.parse(await readFile('artifacts/phase9-3/preserved-before.json'));
let preserved=0;
for(const [path,expected] of Object.entries(before)){
 if(path.startsWith('public/vendor/')||path.startsWith('docs/ed4/vendor/')||path.startsWith('scripts/phase9-2/')||path.startsWith('tests/')||path==='docs/index.html'){
  check(hash(await readFile(path))===expected,'Preserved file changed: '+path);preserved++;
 }
}
for(const id of ['phase9-2','phase9-3']){
 const manifest=JSON.parse(await readFile('licenses/'+id+'-engine.json'));
 for(const [path,meta]of Object.entries(manifest.files))for(const dir of ['public','docs/ed4']){
  const b=await readFile(`${dir}/vendor/experimental/${id}/${path}`);check(hash(b)===meta.sha256,'Wrong engine asset '+id+'/'+path);
 }
 for(const dir of ['public','docs/ed4'])check(hash(await readFile(`${dir}/sources/emulators-0.73.8-${id}-source.zip`))===manifest.sourceZipSha256,'Wrong GPL source '+id);
}
const source=unzipSync(await readFile('docs/ed4/sources/emulators-0.73.8-phase9-3-source.zip'));
const changes=JSON.parse(new TextDecoder().decode(source['emulators/PHASE9_3_CHANGES.json']));
for(const c of changes)check(hash(source['emulators/'+c.path])===c.after,'Source patch mismatch: '+c.path);
check(new TextDecoder().decode(source['emulators/native/dosbox-jsdos/asyncify.txt']).includes('Reboot_Handler()'),'Asyncify fix missing');
check(source['emulators/LICENSE']&&source['emulators/BUILD.md'],'GPL files missing');
check(!Object.keys(source).some(p=>/\.(raw|sav|efc|com|exe)$/i.test(p)),'Unexpected payload in new source');
const files=[];
async function walk(path){for(const d of await readdir(path,{withFileTypes:true})){const p=path+'/'+d.name;if(d.isDirectory())await walk(p);else files.push({path:p,bytes:(await stat(p)).size,sha256:hash(await readFile(p))});}}
await walk('docs');check(files.every(f=>f.bytes<=100*1024*1024),'File exceeds GitHub 100 MiB limit');
check(!files.some(f=>/\.(raw|sav|sve|efc|exe|com|iso|img|dat)$/i.test(f.path)),'Unexpected deployed game/save file');
const sw=await readFile('docs/ed4/sw.js','utf8');for(const id of ['phase9-2','phase9-3']){
 check(sw.includes('./dos-worker-'+id+'.js')&&sw.includes('./vendor/experimental/'+id+'/wdosbox.wasm'),'Offline cache missing '+id);
}
const css=files.filter(f=>f.path.endsWith('.css'));check(css.every(f=>before[f.path]===f.sha256),'Design CSS changed');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const report={preservedFiles:preserved,engineHashesVerified:true,sourceEntries:Object.keys(source).length,sourceChanges:changes.length,
 files,largest:[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,5),head:git('rev-parse','HEAD'),staged:git('diff','--cached','--name-only'),published:false};
await writeFile('artifacts/phase9-3/deployment-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,files:undefined},null,2));
