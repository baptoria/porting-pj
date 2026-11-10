import {outDir,base,audience} from './build-target.mjs';
import {unzipSync} from 'fflate';
import {readFile,readdir,stat,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=outDir+'/',hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(root+'build-manifest.json'));
const build=manifest.build;
if(build.audience!==audience)throw Error('Wrong build audience for output path');
const launcherSource=unzipSync(await readFile(root+'sources/ed4-mobile-source.zip'));
if(JSON.parse(Buffer.from(launcherSource['ed4-mobile/src/build-info.json']).toString()).id!==build.id)throw Error('Corresponding launcher source build mismatch');
for(const name of await readdir('public/sources'))if(name!=='ed4-mobile-source.zip'&&!(await readFile(root+'sources/'+name)).equals(await readFile('public/sources/'+name)))throw Error('Corresponding emulator source mismatch: '+name);
const sw=await readFile(root+'sw.js');if(hash(sw)!==manifest.swSha256)throw Error('SW mismatch');
for(const f of manifest.files){const bytes=await readFile(root+f.path);if(bytes.length!==f.bytes||hash(bytes)!==f.sha256)throw Error('Artifact mismatch '+f.path);}
const html=await readFile(root+'index.html','utf8'),src=html.match(/src="([^" ]+assets\/[^" ]+\.js)"/)?.[1],entry=src?.startsWith(base)?src.slice(base.length):undefined;
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
const result={output:outDir,base,build,filesVerified:manifest.files.length,swSha256:manifest.swSha256,entry,oversized,forbidden,gitByteNormalization:normalization,note:'Local build verification only. Does not claim remote Pages deployment.'};
await mkdir('artifacts/phase9-8e',{recursive:true});await writeFile('artifacts/phase9-8e/local-release-'+audience+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
