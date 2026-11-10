// Fresh checkouts recover the separately versioned experiment from docs/.
// Never substitute stable vendor files or silently deploy an unknown build.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('licenses/phase9-8h-engine.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const relative='vendor/experimental/phase9-8h';
await mkdir('public/'+relative,{recursive:true});
for(const [file,expected]of Object.entries(manifest.files)){
 let bytes;
 try{bytes=await readFile('public/'+relative+'/'+file);}catch(e){if(e.code!=='ENOENT')throw e;bytes=await readFile('docs/ed4/'+relative+'/'+file);}
 if(hash(bytes)!==expected.sha256)throw Error('Unverified Phase 9-8H asset: '+file);
 await writeFile('public/'+relative+'/'+file,bytes);
}
await writeFile('public/'+relative+'/manifest.json',JSON.stringify(manifest,null,2));
const source=await readFile('public/sources/emulators-0.73.8-phase9-8h-source.zip');
if(hash(source)!==manifest.sourceZipSha256)throw Error('Missing/mismatched Phase 9-8H corresponding source');
