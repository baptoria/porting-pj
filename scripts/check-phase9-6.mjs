// Read-only deployment audit; no Git mutation or network access.
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {testProgram} from './test-program.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const check=(v,m)=>{if(!v)throw Error(m);};
const git=(...a)=>execFileSync('git',['-c','core.safecrlf=false',...a],{encoding:'utf8'}).trim();
const protectedPaths=['public/vendor','docs/ed4/vendor','public/dos-worker*','docs/ed4/dos-worker*','scripts/phase9-2','scripts/phase9-3','scripts/phase9-4','src/style.css','docs/index.html','tests/e2e','tests/phase9-2','tests/phase9-2-ui','tests/phase9-3','tests/phase9-3-ui','tests/phase9-4','tests/phase9-4-ui','tests/phase9-4-cache','tests/phase9-5b','tests/phase9-5b-ui','tests/phase9-5b-cache','scripts/phase9-5b-probe.mjs'];
check(!git('diff','HEAD','--name-only','--',...protectedPaths),'Protected engine/design/test file changed');
const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;check(!e.isSymbolicLink(),'Symlink '+p);if(e.isDirectory())await walk(p);else{const b=await readFile(p);files.push({path:p,bytes:b.length,sha256:hash(b)});}}}
await walk('docs');
check(files.every(f=>f.bytes<=100*1024*1024),'GitHub size limit');
check(!files.some(f=>/\.(raw|sav|sve|efc|exe|com|iso|img|dat)$/i.test(f.path)),'Unexpected deployed payload');
const expectedSources=new Set(['ed4-mobile-source.zip','emulators-0.73.8-source.zip',...['2','3','4','5b','6'].map(n=>`emulators-0.73.8-phase9-${n}-source.zip`)]);
for(const f of files.filter(f=>f.path.endsWith('.zip'))){
 const z=unzipSync(await readFile(f.path));
 if(f.path==='docs/ed4/test-program.zip'){
  check(Object.keys(z).sort().join(',')==='ED4TEST.COM,README.TXT,RESOURCE.DAT,START.BAT','Unexpected public DOS ZIP entries');
  check(hash(z['ED4TEST.COM'])===hash(testProgram()),'Public DOS bytes changed');
 }else{
  check(f.path.startsWith('docs/ed4/sources/')&&expectedSources.has(f.path.split('/').pop()),'Unknown ZIP '+f.path);
  check(!Object.keys(z).some(p=>/\.(raw|sav|sve|efc|exe|com|iso|img|dat)$/i.test(p)),'Unexpected source payload '+f.path);
 }
}
for(const n of ['emulators.js','wdosbox.js','wdosbox.wasm','wlibzip.js','wlibzip.wasm'])check(hash(await readFile('docs/ed4/vendor/'+n))===hash(await readFile('node_modules/emulators/dist/'+n)),'Stable engine mismatch '+n);
const engineHashes={stable:hash(await readFile('docs/ed4/vendor/wdosbox.wasm'))};
for(const id of ['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6']){
 const m=JSON.parse(await readFile('licenses/'+id+'-engine.json'));
 for(const [p,meta]of Object.entries(m.files))for(const root of ['public','docs/ed4'])check(hash(await readFile(`${root}/vendor/experimental/${id}/${p}`))===meta.sha256,'Experimental asset '+id+'/'+p);
 check(hash(await readFile(`docs/ed4/sources/emulators-0.73.8-${id}-source.zip`))===m.sourceZipSha256,'GPL source '+id);
 engineHashes[id]=m.files['wdosbox.wasm'].sha256;
}
const upstream=JSON.parse(await readFile('licenses/source-manifest.json'));
check(hash(await readFile('docs/ed4/sources/emulators-0.73.8-source.zip'))===upstream.sha256,'Upstream GPL source');
check((await readFile('docs/ed4/index.html','utf8')).includes('/porting-pj/ed4/assets/'),'Pages path');
const source=unzipSync(await readFile('docs/ed4/sources/ed4-mobile-source.zip'));
for(const p of ['src/environment-comparison.ts','src/main.ts','PHASE9_6_PERFORMANCE_REPORT.md','GALAXY_TEST_GUIDE.md'])check(hash(source['ed4-mobile/'+p])===hash(await readFile(p)),'Launcher source stale '+p);
const report={head:git('rev-parse','HEAD'),staged:git('diff','--cached','--name-only'),published:false,protectedPathsUnchanged:true,engineHashes,sourceAndPayloadChecks:true,files,largest:[...files].sort((a,b)=>b.bytes-a.bytes).slice(0,3)};
await mkdir('artifacts/phase9-6',{recursive:true});await writeFile('artifacts/phase9-6/deployment-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,files:undefined},null,2));
