// Audits the complete static artifact before creating the manual-upload ZIP.
import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strFromU8} from 'fflate';
import {testProgram} from './test-program.mjs';
import {rootIndex,retiredRootWorker} from './pages-root.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const auditOnly=process.argv.includes('--audit-only');
const limitBytes=(auditOnly?100:25)*1024*1024;
const auditDir=auditOnly?'artifacts/desktop-deploy':'artifacts/manual-deploy';
const deploymentFiles=Object.create(null), inventory=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
 const path=`${dir}/${e.name}`;
 if(e.isSymbolicLink())throw Error('Symlink in deployment: '+path);
 if(e.isDirectory())await walk(path);
 else {const b=new Uint8Array(await readFile(path));deploymentFiles[path.slice(5)]=b;inventory.push({path:path.slice(5),bytes:b.length,MiB:b.length/1048576,sha256:hash(b)});}
}}
await walk('docs');
for(const path of Object.keys(deploymentFiles))if(!path.startsWith('ed4/')&&!['index.html','.nojekyll','sw.js'].includes(path))throw Error('Unreviewed Pages root file: '+path);
if(strFromU8(deploymentFiles['index.html'])!==rootIndex||strFromU8(deploymentFiles['sw.js'])!==retiredRootWorker||deploymentFiles['.nojekyll']?.length!==0)throw Error('Wrong Pages root');
const files=Object.fromEntries(Object.entries(deploymentFiles).filter(([path])=>path.startsWith('ed4/')).map(([path,b])=>[path.slice(4),b]));
const allowed=/^(?:\.nojekyll|index\.html|sw\.js|manifest\.webmanifest|dos-worker\.js|icon\.svg|icon-(?:192|512)\.png|test-program\.zip|assets\/(?:index|zip-worker|runtime-worker|source-worker)-[A-Za-z0-9_-]+\.(?:js|css)|vendor\/(?:emulators\.js|wdosbox\.(?:js|wasm)|wlibzip\.(?:js|wasm))|licenses\/(?:NOTICE\.html|emulators-GPL-2\.0\.txt|fflate-MIT\.txt|idb-ISC\.txt)|sources\/(?:emulators-0\.73\.8-source|ed4-mobile-source)\.zip)$/;
for(const path of Object.keys(files))if(!allowed.test(path))throw Error('Unreviewed deployment file: '+path);
for(const path of ['.nojekyll','index.html','sw.js','manifest.webmanifest','dos-worker.js','vendor/wdosbox.wasm','licenses/NOTICE.html','licenses/emulators-GPL-2.0.txt','sources/emulators-0.73.8-source.zip','sources/ed4-mobile-source.zip'])if(!files[path])throw Error('Missing required file: '+path);
if(files['.nojekyll'].length!==0)throw Error('.nojekyll must be empty');
if(!strFromU8(files['index.html']).includes('/porting-pj/ed4/assets/'))throw Error('Wrong Vite base');
const upstream=JSON.parse(await readFile('licenses/source-manifest.json','utf8'));
if(hash(files['sources/emulators-0.73.8-source.zip'])!==upstream.sha256)throw Error('Upstream source mismatch');
for(const name of ['emulators.js','wdosbox.js','wdosbox.wasm','wlibzip.js','wlibzip.wasm'])if(hash(files['vendor/'+name])!==hash(await readFile('node_modules/emulators/dist/'+name)))throw Error('Runtime modified: '+name);
const dos=unzipSync(files['test-program.zip']);
if(Object.keys(dos).sort().join(',')!=='ED4TEST.COM,README.TXT,RESOURCE.DAT,START.BAT'||hash(dos['ED4TEST.COM'])!==hash(testProgram()))throw Error('Unreviewed DOS fixture');
const bannedPath=/(?:^|\/)(?:\.env(?:\.|$)|\.git\/|node_modules\/|research\/|artifacts\/|test-results[^/]*\/)|\.(?:raw|sav|exe|com|jsdos|pfx|p12|pem|key)$/i;
const secrets=/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|[A-Z]:[\\/]Users[\\/][^\s"']+)/;
const source=unzipSync(files['sources/ed4-mobile-source.zip']);
for(const [name,b] of Object.entries(source)){
 if(bannedPath.test(name)||!name.startsWith('ed4-mobile/'))throw Error('Unreviewed source path: '+name);
 if(secrets.test(strFromU8(b)))throw Error('Credential/private home-path pattern in source: '+name);
}
for(const path of ['LICENSE','THIRD_PARTY_NOTICES.md','package-lock.json','public/.nojekyll','scripts/package-manual.mjs'])if(!source['ed4-mobile/'+path])throw Error('Incomplete launcher source: '+path);
// Upstream archive is separately pinned and contains no game binary payloads.
const upstreamFiles=unzipSync(files['sources/emulators-0.73.8-source.zip']);
for(const path of Object.keys(upstreamFiles))if(/\.(?:raw|sav|exe|com|jsdos|zip)$/i.test(path))throw Error('Binary game data in upstream source: '+path);
const oversized=inventory.filter(f=>f.bytes>limitBytes);
await mkdir(auditDir,{recursive:true});
const checks={base:'/porting-pj/ed4/',pagesRoot:'/porting-pj/',directory:'docs',files:inventory.sort((a,b)=>a.path.localeCompare(b.path)),fileCount:inventory.length,fileLimitBytes:limitBytes,oversized,rawPayloads:0,savePayloads:0,commercialGamePayloads:0,publicDosFixture:'original CC0 testProgram() verified',upstreamSourceHashVerified:true,launcherSourceFiles:Object.keys(source).length,secretPatternScan:'no matches; not a formal secret-audit guarantee',published:false};
await writeFile(auditDir+'/file-audit.json',JSON.stringify(checks,null,2));
if(oversized.length)throw Error('Files exceed '+limitBytes+' bytes; see file-audit.json. No splitting or removal performed.');
if(auditOnly){console.log('docs audit passed: '+inventory.length+' files; limit 100 MiB.');process.exit(0);}
const data=zipSync(deploymentFiles,{level:6});await writeFile('ed4-mobile-deploy.zip',data);
const manifest={file:'ed4-mobile-deploy.zip',bytes:data.length,sha256:hash(data),fileCount:inventory.length,largestFile:[...inventory].sort((a,b)=>b.bytes-a.bytes)[0],oversized};
await writeFile('artifacts/manual-deploy/deploy-manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest,null,2));
