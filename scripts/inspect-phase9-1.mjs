// Read-only symbol/body/Asyncify comparison of the two recorded build outputs.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector';
const root='artifacts/phase9-1',manifest=JSON.parse(await readFile(`${root}/engine-manifest.json`,'utf8'));
const results={};
for(const variant of ['baseline','fixed']){
 const b=await readFile(`${root}/engines/${variant}/wdosbox.wasm`),hash=createHash('sha256').update(b).digest('hex');
 if(hash!==manifest[variant]['wdosbox.wasm'].sha256)throw Error('Build changed');
 const symbols=Object.fromEntries((await readFile(`${root}/engines/${variant}/wdosbox.js.symbols`,'utf8')).trim().split(/\r?\n/).map(l=>{const c=l.indexOf(':');return [Number(l.slice(0,c)),l.slice(c+1).replace(/\\([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))];}));
 let p=8,imports=WebAssembly.Module.imports(new WebAssembly.Module(b)).filter(i=>i.kind==='function').length;
 const uint=()=>{let v=0,s=0,x;do{x=b[p++];v+=(x&127)*2**s;s+=7;}while(x&128);return v;};
 const functions=[];
 while(p<b.length){const id=b[p++],len=uint(),end=p+len;if(id===10){const n=uint();for(let i=0;i<n;i++){const len=uint(),start=p,index=imports+i;p+=len;if(['Reboot_Handler()','DOSBOX_RunMachine()','Normal_Loop()'].includes(symbols[index]))functions.push({index,name:symbols[index],start,end:p,instructions:[]});}}p=end;}
 const session=new Session();session.connect();const post=(m,args={})=>new Promise((resolve,reject)=>session.post(m,args,(e,r)=>e?reject(e):resolve(r)));
 let scriptId;session.on('Debugger.scriptParsed',({params})=>{if(params.scriptLanguage==='WebAssembly')scriptId=params.scriptId;});
 await post('Debugger.enable');new WebAssembly.Module(b);
 const first=await post('Debugger.disassembleWasmModule',{scriptId});let chunk=first.chunk,count=0;
 while(chunk.lines.length){count+=chunk.lines.length;for(let i=0;i<chunk.lines.length;i++){const offset=chunk.bytecodeOffsets[i],f=functions.find(f=>offset>=f.start&&offset<f.end);if(f)f.instructions.push({offset,hex:'0x'+offset.toString(16),instruction:chunk.lines[i].trim()});}if(count>=first.totalNumberOfLines)break;chunk=(await post('Debugger.nextWasmDisassemblyChunk',{streamId:first.streamId})).chunk;}
 session.disconnect();results[variant]={hash,functions};
 const reboot=functions.find(f=>f.name==='Reboot_Handler()');if(!reboot)throw Error('Missing reboot symbol');
 console.log(variant,hash,{index:reboot.index,bodyBytes:reboot.end-reboot.start,globalInstructions:reboot.instructions.filter(i=>/global\.(get|set)/.test(i.instruction)).length});
}
await writeFile(`${root}/build-disassembly.json`,JSON.stringify(results,null,2));
