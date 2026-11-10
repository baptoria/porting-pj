import {readFile,readdir,stat,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='docs/ed4/',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(root+'build-manifest.json'));
const build=JSON.parse(await readFile('src/build-info.json'));
if(manifest.build.id!==build.id)throw Error('Frontend/release build mismatch');
const sw=await readFile(root+'sw.js');if(hash(sw)!==manifest.swSha256)throw Error('SW mismatch');
for(const f of manifest.files){const bytes=await readFile(root+f.path);if(bytes.length!==f.bytes||hash(bytes)!==f.sha256)throw Error('Artifact mismatch '+f.path);}
const html=await readFile(root+'index.html','utf8'),entry=html.match(/src="\/porting-pj\/ed4\/(assets\/[^" ]+\.js)"/)?.[1];
if(!entry)throw Error('Wrong subpath or missing entry');
const js=await readFile(root+entry,'utf8');for(const engine of ['phase9-7','phase9-8c','phase9-8d','phase9-8f','phase9-8h','phase9-8i','phase9-8k'])if(!js.includes(engine))throw Error('Missing engine '+engine);
const helpers=manifest.files.filter(f=>f.path.startsWith('assets/')&&f.path.endsWith('.js'));let hasBuild=false;for(const f of helpers)if((await readFile(root+f.path,'utf8')).includes(build.id))hasBuild=true;if(!hasBuild)throw Error('Build ID not in frontend');
async function walk(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(dir+e.name+'/'):dir+e.name))).flat();}
const oversized=[],forbidden=[],normalization=[];
for(const file of await walk(root)){
 if((await stat(file)).size>100*1024*1024)oversized.push(file);
 if(/\.(raw|efc|sav|iso|cue)$/i.test(file))forbidden.push(file);
 const bytes=await readFile(file),raw=execFileSync('git',['hash-object','--no-filters','--',file],{encoding:'utf8'}).trim(),clean=execFileSync('git',['hash-object','--path='+file,'--',file],{encoding:'utf8'}).trim();if(raw!==clean)normalization.push(file);
}
if(oversized.length||forbidden.length||normalization.length)throw Error(JSON.stringify({oversized,forbidden,normalization}));
const result={build,filesVerified:manifest.files.length,swSha256:manifest.swSha256,entry,oversized,forbidden,gitByteNormalization:normalization,note:'Local build verification only. Does not claim remote Pages deployment.'};
await mkdir('artifacts/phase9-8e',{recursive:true});await writeFile('artifacts/phase9-8e/local-release.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
