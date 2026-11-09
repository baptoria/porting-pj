// Read-only V8 disassembly. Compile the module for inspection; never instantiate
// or execute the emulator here. No downloads, symbol guessing or binary edits.
import {Session} from 'node:inspector';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const expected='5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf';
const bytes=await readFile('public/vendor/wdosbox.wasm');
const hash=createHash('sha256').update(bytes).digest('hex');
if(hash!==expected)throw Error('Not the Galaxy stack binary');
await import('./inspect-wasm.mjs');
const inventory=JSON.parse(await readFile('artifacts/phase7/wasm-inventory.json','utf8'));
if(inventory.symbolMapSha256!=='8e026e8603c3bec4935d7f85c415db961a936e2c0b6b43e5d8f9666b7bede64f')throw Error('Not the verified matching symbol map');
const supplied=[[481,0x14405],[379,0xfc63],[2613,0xf6bcb],[2686,0xfeef3],[481,0x14405],[379,0xfc63],[1926,0x74671],[813,0x2255c],[428,0x11f95],[3044,0x11a3f6]];
const stack=supplied.map(([id,offset])=>{const f=inventory.functions.find(f=>f.functionIndex===id);if(!f||offset<f.bodyStart||offset>=f.bodyEnd)throw Error('Offset outside claimed body');return {...f,offset,hex:'0x'+offset.toString(16)};});
const ids=new Set(stack.map(f=>f.functionIndex));
const selected=inventory.functions.filter(f=>ids.has(f.functionIndex));
const session=new Session();session.connect();
const post=(name,params={})=>new Promise((resolve,reject)=>session.post(name,params,(e,r)=>e?reject(e):resolve(r)));
let scriptId;session.on('Debugger.scriptParsed',({params})=>{if(params.scriptLanguage==='WebAssembly')scriptId=params.scriptId;});
await post('Debugger.enable');new WebAssembly.Module(bytes);
const first=await post('Debugger.disassembleWasmModule',{scriptId});
const bodyLines=new Map(selected.map(f=>[f.functionIndex,[]]));
let chunk=first.chunk,lineCount=0;
while(chunk.lines.length){
 lineCount+=chunk.lines.length;
 for(let i=0;i<chunk.lines.length;i++){
  const offset=chunk.bytecodeOffsets[i];
  const f=selected.find(f=>offset>=f.bodyStart&&offset<f.bodyEnd);
  if(f)bodyLines.get(f.functionIndex).push({offset,hex:'0x'+offset.toString(16),instruction:chunk.lines[i].trim()});
 }
 if(lineCount>=first.totalNumberOfLines)break;
 chunk=(await post('Debugger.nextWasmDisassemblyChunk',{streamId:first.streamId})).chunk;
}
session.disconnect();
for(const f of stack){const lines=bodyLines.get(f.functionIndex),at=lines.findIndex(l=>l.offset===f.offset);if(at<0)throw Error('Supplied offset is not an instruction boundary');f.instruction=lines[at].instruction;f.context=lines.slice(Math.max(0,at-10),at+7);}
const output={evidence:'User prompt stack; original ed4-diagnostics (5)/(6).json not found in searched local locations',hash,symbolMapSha256:inventory.symbolMapSha256,node:process.version,v8:process.versions.v8,lineCount,stack,functions:selected.map(f=>({...f,instructions:bodyLines.get(f.functionIndex)}))};
await mkdir('artifacts/phase8',{recursive:true});await writeFile('artifacts/phase8/stack-disassembly.json',JSON.stringify(output,null,2));
await writeFile('artifacts/phase8/selected-functions.wat.txt',output.functions.map(f=>`; ${f.functionIndex} ${f.name}\n`+f.instructions.map(l=>`${l.hex} ${l.instruction}`).join('\n')).join('\n\n'));
console.log(JSON.stringify({hash,lineCount,stack:stack.map(({context,...f})=>f)},null,2));
