// Isolated source preparation. Never writes public/, docs/, or application data.
import {readFile,writeFile,mkdir,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
const root=resolve('artifacts/phase9-1');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await readFile('public/sources/emulators-0.73.8-source.zip');
if(hash(source)!=='884e7b8e525392fe0f64e4872ee8e2e82ba58e8a320e078297b90938279b6840')throw Error('Unexpected corresponding source');
const symbols=(await readFile('node_modules/emulators/dist/wdosbox.js.symbols','utf8')).replace(/\\([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));
if(!symbols.includes('2613:Reboot_Handler()'))throw Error('Verify exact symbol first');
await mkdir(root,{recursive:true});
const files=unzipSync(source),changed='native/dosbox-jsdos/asyncify.txt';
const original=Buffer.from(files['emulators/'+changed]).toString('utf8');
if(JSON.parse(original).includes('Reboot_Handler()'))throw Error('Source already patched');
const patched=original.replace(/\](\s*)$/,',"Reboot_Handler()"]$1');
if(JSON.parse(patched).length!==JSON.parse(original).length+1)throw Error('Unexpected patch');
const manifest={sourceSha256:hash(source),change:changed,originalSha256:hash(original),patchedSha256:hash(patched),files:[]};
for(const variant of ['baseline','fixed']){
 const targetRoot=resolve(root,'source',variant);
 for(const [name,body] of Object.entries(files)){
  if(!name.startsWith('emulators/')||name.endsWith('/'))continue;
  const relative=name.slice(10),target=resolve(targetRoot,relative);
  if(!target.startsWith(targetRoot+sep))throw Error('Unsafe archive path');
  const output=variant==='fixed'&&relative===changed?Buffer.from(patched):body;
  await mkdir(dirname(target),{recursive:true});
  try {const existing=await readFile(target);if(!existing.equals(Buffer.from(output)))throw Error('Existing experiment differs: '+target);}
  catch(e){if(e.code!=='ENOENT')throw e;await writeFile(target,output,{flag:'wx'});}
  if(variant==='baseline')manifest.files.push({path:relative,sha256:hash(body)});
 }
}
await writeFile(resolve(root,'source-manifest.json'),JSON.stringify(manifest,null,2));
const snapshot={};
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+item.name;if(item.isDirectory())await walk(path);else if(item.isFile())snapshot[path]=hash(await readFile(path));}}
for(const dir of ['docs','public','src','tests/e2e'])await walk(dir);
const snapshotPath=resolve(root,'preserved-before.json');
try{await stat(snapshotPath);}catch(e){if(e.code!=='ENOENT')throw e;await writeFile(snapshotPath,JSON.stringify(snapshot,null,2),{flag:'wx'});}
console.log(JSON.stringify({root,files:manifest.files.length,change:changed,originalSha256:manifest.originalSha256,patchedSha256:manifest.patchedSha256}));
