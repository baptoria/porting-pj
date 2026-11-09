// Read-only inspection of the PINNED runtime; no compilation or binary edits.
// Usage: node scripts/inspect-wasm.mjs [function-index] [absolute-hex-offset]
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bytes=await readFile('public/vendor/wdosbox.wasm');
const packageInfo=JSON.parse(await readFile('node_modules/emulators/package.json','utf8'));
const packaged=await readFile('node_modules/emulators/dist/wdosbox.wasm');
if(packageInfo.version!=='0.73.8'||!bytes.equals(packaged))throw Error('Runtime/package mismatch: do not use a different symbol map');
const symbolBytes=await readFile('node_modules/emulators/dist/wdosbox.js.symbols');
const symbolMap=Object.fromEntries(symbolBytes.toString('utf8').trim().split(/\r?\n/).map(line=>{const colon=line.indexOf(':');return [Number(line.slice(0,colon)),line.slice(colon+1).replace(/\\([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)))];}));
const module=new WebAssembly.Module(bytes),imports=WebAssembly.Module.imports(module),exports=WebAssembly.Module.exports(module);
let cursor=8;
function uint(){let value=0,shift=0,b;do{if(cursor>=bytes.length||shift>35)throw Error('Invalid LEB');b=bytes[cursor++];value+=(b&127)*2**shift;shift+=7;}while(b&128);return value;}
function string(){const n=uint(),s=bytes.subarray(cursor,cursor+n).toString('utf8');cursor+=n;return s;}
const sections=[],functions=[],names={},tables=[];
const importedFunctions=imports.filter(i=>i.kind==='function').length;
while(cursor<bytes.length){
 const id=bytes[cursor++],size=uint(),start=cursor,end=start+size;
 if(end>bytes.length)throw Error('Invalid section size');
 const section={id,start,end,size};
 if(id===0){section.name=string();if(section.name==='name')while(cursor<end){const sub=bytes[cursor++],length=uint(),stop=cursor+length;if(sub===1){const n=uint();for(let i=0;i<n;i++){const index=uint();names[index]=string();}}cursor=stop;}}
 if(id===4){const n=uint();for(let i=0;i<n;i++){const type=bytes[cursor++],flags=uint(),min=uint(),max=flags&1?uint():undefined;tables.push({type,flags,min,max});}}
 if(id===9){
  section.segments=uint();
  // Pinned MVP active segment; report, never modify its table contents.
  if(section.segments===1&&uint()===0&&bytes[cursor++]===0x41){
   section.tableOffset=uint();if(bytes[cursor++]!==0x0b)throw Error('Unexpected table offset expression');section.initializedEntries=uint();
  }
 }
 if(id===10){const n=uint();for(let i=0;i<n;i++){const length=uint(),bodyStart=cursor;functions.push({functionIndex:importedFunctions+i,bodyStart,bodyEnd:bodyStart+length});cursor+=length;}}
 sections.push(section);cursor=end;
}
if(Object.keys(symbolMap).length!==importedFunctions+functions.length)throw Error('Symbol count does not match function space');
for(const f of functions)f.name=names[f.functionIndex]??symbolMap[f.functionIndex];
const result={wasm:'wdosbox.wasm',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),symbolMapSha256:createHash('sha256').update(symbolBytes).digest('hex'),imports,exports,importedFunctions,definedFunctions:functions.length,tables,sections,functions,
 note:'Names use wdosbox.js.symbols shipped in the same pinned npm package; runtime byte equality and function count checked. Body ranges are absolute module byte offsets (end exclusive), not C++ line mappings. Interpret browser offset convention before matching. Same binary hash required.'};
await mkdir('artifacts/phase7',{recursive:true});await writeFile('artifacts/phase7/wasm-inventory.json',JSON.stringify(result,null,2));
const requested=process.argv[2]===undefined?undefined:Number(process.argv[2]),offset=process.argv[3]===undefined?undefined:Number(process.argv[3]);
console.log(JSON.stringify({...result,imports:undefined,exports:undefined,functions:undefined,
 selectedFunction:requested===undefined?undefined:functions.find(f=>f.functionIndex===requested),
 offsetMatch:offset===undefined?undefined:functions.filter(f=>offset>=f.bodyStart&&offset<f.bodyEnd)},null,2));
