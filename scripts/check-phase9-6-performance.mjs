// Evidence summary, no commercial files or external network.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='artifacts/phase9-6',hash=b=>createHash('sha256').update(b).digest('hex');
const results={};
for(const group of ['bench','fixed','overhead']){
 const all=[];try{for(const d of await readdir(root+'/'+group,{withFileTypes:true})){if(!d.isDirectory())continue;try{all.push(JSON.parse(await readFile(`${root}/${group}/${d.name}/result.json`,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}}}catch(e){if(e.code!=='ENOENT')throw e;}
 results[group]=Object.fromEntries([...new Set(all.map(x=>x.variant+(group==='overhead'?':'+x.samplerEnabled:'')))].map(id=>{
 const values=all.filter(x=>x.variant+(group==='overhead'?':'+x.samplerEnabled:'')===id).flatMap(x=>x.trials.map(t=>t.ms)).sort((a,b)=>a-b);
 return [id,{n:values.length,min:values[0],median:(values[Math.floor((values.length-1)/2)]+values[Math.floor(values.length/2)])/2,max:values.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length,values}];
 }));
}
const symbols=await readFile(root+'/engines/instrumented/wdosbox.js.symbols','utf8');
if(/ED4_CPU_|ED4_InstructionScope|ED4_ControlScope|ED4_FirstObserve/.test(symbols))throw Error('Instruction history symbol survived');
const source=root+'/source/instrumented';
for(const file of ['native/dosbox/src/hardware/vga_memory.cpp','native/dosbox-jsdos/asyncify.txt']){
 if(hash(await readFile(source+'/'+file))!==hash(await readFile('artifacts/phase9-5b/source/instrumented/'+file)))throw Error('Compatibility source changed '+file);
}
const command=await readFile(root+'/logs/commands.txt','utf8');if(!command.includes('-DED4_CPU_TRACE_ENABLED=0'))throw Error('Missing compile-time exclusion');
const output={results,sourceChecks:{vgaAndAsyncifyUnchanged:true,traceSymbolsAbsent:true,compileFlag:'ED4_CPU_TRACE_ENABLED=0'},wasmSha256:hash(await readFile(root+'/engines/instrumented/wdosbox.wasm'))};
await writeFile(root+'/performance-summary.json',JSON.stringify(output,null,2));console.log(output);
