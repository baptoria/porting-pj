import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {unzipSync} from 'fflate';
const root='artifacts/phase9-5b',source=`${root}/source/instrumented`,hash=b=>createHash('sha256').update(b).digest('hex');
const zip=await readFile('public/sources/emulators-0.73.8-phase9-4-source.zip');
if(hash(zip)!=='845783c9038cc727ef2e7ceb3509cdf0c9376aa34874f4b8aeeed8b59d4adaa9')throw Error('Wrong Phase 9-4 source');
const base={};for(const [name,bytes] of Object.entries(unzipSync(zip))){
 if(!name.startsWith('emulators/')||name.endsWith('/'))continue;
 const rel=name.slice(10),p=resolve(source,rel);if(!p.startsWith(resolve(source)+sep))throw Error('Unsafe path');
 await mkdir(dirname(p),{recursive:true});await writeFile(p,bytes,{flag:'wx'});base[rel]=hash(bytes);
}
await writeFile(`${root}/base-source-manifest.json`,JSON.stringify(base,null,2),{flag:'wx'});
const path='native/dosbox/src/hardware/vga_memory.cpp';let text=await readFile(`${source}/${path}`,'utf8');
const from='\tcase 3:\n\t\tvgapages.base = VGA_PAGE_B8;\n\t\tvgapages.mask = 0x7fff;\n\t\tMEM_SetPageHandler( VGA_PAGE_B8, 8, newHandler );\n\t\tMEM_SetPageHandler( VGA_PAGE_A0, 16, &vgaph.empty );';
const to=from.replace('\t\tMEM_SetPageHandler( VGA_PAGE_A0, 16, &vgaph.empty );',`\t\t// Phase 9-5B: opt-in engine restores 0.74-3 inactive text aperture RAM.
\t\t// Not DOS-allocated memory. Keep graphics, other SVGA cards and MMIO unchanged.
\t\tif (vga.mode == M_TEXT && svgaCard == SVGA_S3Trio)
\t\t\tMEM_ResetPageHandler(VGA_PAGE_A0, 16);
\t\telse
\t\t\tMEM_SetPageHandler(VGA_PAGE_A0, 16, &vgaph.empty);`);
if(text.split(from).length!==2)throw Error('Reviewed source context changed');text=text.replace(from,to);await writeFile(`${source}/${path}`,text);
await writeFile(root+'/source-changes.json',JSON.stringify([{path,before:base[path],after:hash(text),from,to}],null,2),{flag:'wx'});
console.log('One VGA aperture mapping change; all inherited CPU/Asyncify code unchanged.');
