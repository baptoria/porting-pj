// Read-only Git inventory and deployment checks. Never stages, commits or connects.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'});
execFileSync(process.execPath,['scripts/package-manual.mjs','--audit-only'],{stdio:'inherit'});
const paths=[...new Set(git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean))].sort();
const inventory=[],problems=[],deletedTrackedPaths=[];
const forbidden=/(?:^|\/)(?:node_modules|artifacts|research|dist|test-results[^/]*|games?|roms|music|raw|saves?|backups|uploads|personal|private|user-data|\.aws|\.ssh|\.codex|\.agents)(?:\/|$)|(?:^|\/)\.env|\.(?:raw|sav|sve|exe|com|jsdos|pem|key|pfx|p12|iso|img|bin|dat|mp3|wav|ogg|flac|7z|rar)$/i;
const reviewedZip=new Set(['public/sources/emulators-0.73.8-source.zip','docs/ed4/sources/emulators-0.73.8-source.zip','docs/ed4/sources/ed4-mobile-source.zip','docs/ed4/test-program.zip']);
const secret=/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|[A-Z]:[\\/]Users[\\/][^\s"']+)/;
for(const path of paths){
 const st=await lstat(path).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
 if(!st){deletedTrackedPaths.push(path);continue;}
 if(st.isSymbolicLink()||!st.isFile()){problems.push({path,reason:'non-regular file'});continue;}
 if(forbidden.test(path)||(/\.zip$/i.test(path)&&!reviewedZip.has(path)))problems.push({path,reason:'unreviewed payload/private path'});
 if(st.size>100*1024*1024){inventory.push({path,bytes:st.size});continue;}
 const b=await readFile(path);
 if(!/\.(?:zip|png|wasm)$/i.test(path)&&secret.test(b.toString('utf8')))problems.push({path,reason:'secret/private-home pattern'});
 inventory.push({path,bytes:st.size,sha256:createHash('sha256').update(b).digest('hex')});
}
const docsAudit=JSON.parse(await readFile('artifacts/desktop-deploy/file-audit.json','utf8'));
for(const f of docsAudit.files)if(!paths.includes('docs/'+f.path))problems.push({path:'docs/'+f.path,reason:'deployment file excluded from Git'});
for(const p of ['LICENSE','THIRD_PARTY_NOTICES.md','public/sources/emulators-0.73.8-source.zip','GITHUB_DESKTOP_GUIDE.md','DEPLOY_CHECK_REPORT.md'])if(!paths.includes(p))problems.push({path:p,reason:'required source/guide missing from Git candidates'});
const probes=['node_modules/example.js','artifacts/private.zip','games/GAME.BAT','GAME.ZIP','ED4-01.RAW','SAVE.SAV','private/settings.json','.env.local','docs/unreviewed.zip','docs/ed4/ED4-01.RAW'];
for(const p of probes){try{git('check-ignore','--no-index','-q',p);}catch{problems.push({path:p,reason:'ignore probe failed'});}}
const oversized=inventory.filter(f=>f.bytes>100*1024*1024);
const result={deletedTrackedPaths,directory:'docs',fileLimitBytes:100*1024*1024,fileCount:inventory.length,totalBytes:inventory.reduce((n,f)=>n+f.bytes,0),largestFiles:[...inventory].sort((a,b)=>b.bytes-a.bytes).slice(0,5),oversized,problems,ignoreProbes:probes,branch:git('symbolic-ref','--short','HEAD').trim(),stagedCount:git('diff','--cached','--name-only','-z').split('\0').filter(Boolean).length,remoteNames:git('remote').trim().split('\n').filter(Boolean),files:inventory,published:false};
await mkdir('artifacts/desktop-deploy',{recursive:true});
await writeFile('artifacts/desktop-deploy/git-file-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,files:undefined},null,2));
if(oversized.length||problems.length)throw Error('Desktop audit failed; inspect git-file-audit.json. No file was removed or split.');
