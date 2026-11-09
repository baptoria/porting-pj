// Reproduce upstream gulp dosboxJs footer packaging without changing deployment.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='artifacts/phase9-1',manifest={};
const sources=JSON.parse(await readFile(`${root}/source-manifest.json`,'utf8'));
for(const variant of ['baseline','fixed'])for(const file of sources.files){
 const body=await readFile(`${root}/source/${variant}/${file.path}`);
 const expected=variant==='fixed'&&file.path===sources.change?sources.patchedSha256:file.sha256;
 if(createHash('sha256').update(body).digest('hex')!==expected)throw Error(`Unexpected source change: ${variant}/${file.path}`);
}
for(const variant of ['baseline','fixed']){
 const out=`${root}/engines/${variant}`;await mkdir(out,{recursive:true});
 await writeFile(`${out}/LICENSE`,await readFile(`${root}/source/${variant}/LICENSE`));
 await writeFile(`${out}/DOSBOX-COPYING`,await readFile(`${root}/source/${variant}/native/dosbox/COPYING`));
 await writeFile(`${out}/SOURCE.txt`,`Local experiment only; not deployed. Corresponding source: ../../source/${variant}/\nPinned source manifest: ../../source-manifest.json\nRebuild: scripts/build-phase9-1.sh, scripts/package-phase9-1.mjs (project root).\n`);
 manifest[variant]={};
 for(const file of ['wdosbox.js','wdosbox.wasm','wdosbox.js.symbols']){
  let body=await readFile(`${root}/build/${variant}/${file}`);
  if(file==='wdosbox.js')body=Buffer.concat([body,await readFile(`${root}/source/${variant}/src/dos/dosbox/ts/worker-server.js`)]);
  await writeFile(`${out}/${file}`,body);
  manifest[variant][file]={bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};
 }
}
await writeFile(`${root}/engine-manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest,null,2));
