import {outDir,developer} from './build-target.mjs';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const digest=b=>createHash('sha256').update(b).digest('hex');
async function walk(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
const build=JSON.parse(await readFile('src/build-info.json','utf8'));
const files=[];
for(const file of (await walk(outDir)).sort()){
 if(file.includes('/sources/')||/\/(sw.js|build-manifest.json)$/.test(file))continue;
 const bytes=await readFile(file);files.push({path:file.slice(outDir.length+1),bytes:bytes.length,sha256:digest(bytes)});
}
const version=digest(JSON.stringify({build,files})).slice(0,16);
const sw=`const BUILD=${JSON.stringify(build)};\nconst FILES=${JSON.stringify(files)};\nconst URLS=${JSON.stringify(files.map(f=>'./'+f.path))};\nconst PREFIX='ed4-shell-'+encodeURIComponent(new URL(self.registration.scope).pathname)+'-';\nconst CACHE=PREFIX+'${version}';\n`+await readFile('scripts/shell-worker.js','utf8');
await writeFile(outDir+'/sw.js',sw);
await writeFile(outDir+'/build-manifest.json',JSON.stringify({format:'ed4-shell-release',version:1,build,files,swSha256:digest(sw)},null,2)+'\n');
console.log(`Verified offline release: ${files.length} files, ${build.id}, ${version}`);
if(!developer)await (await import('./pages-root.mjs')).writePagesRoot();
