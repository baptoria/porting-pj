import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
// Execute the production adapter with genuine browser AudioBuffers.
for(const rate of [44100,48000])for(const mono of [false,true])test(`adapter ${mono?'mono':'legacy'} resampled to ${rate}`,async({page},info)=>{
 await page.goto('/porting-pj/ed4/');
 const source=ts.transpileModule(await readFile('src/emulator-audio.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace('export function','function');
 await page.addScriptTag({content:source+'\nwindow.testAudioAdapter=emulatorAudioBuffer;'});
 const data=await page.evaluate(async({rate,mono})=>{
  const inputRate=22050,n=17640,input=Float32Array.from({length:n},(_,i)=>0.25*Math.sin(2*Math.PI*1000*i/inputRate));
  const c=new OfflineAudioContext(2,rate,rate),b=(window as any).testAudioAdapter(c,input,inputRate,mono),node=c.createBufferSource();node.buffer=b;node.connect(c.destination);node.start(0.05);
  const out=await c.startRendering(),x=out.getChannelData(0),y=out.getChannelData(1),cross:number[]=[];
  for(let i=Math.floor(rate*0.1);i<Math.floor(rate*0.4);i++)if(x[i]<=0&&x[i+1]>0)cross.push(i-x[i]/(x[i+1]-x[i]));
  const active=Array.from(x.keys()).filter(i=>Math.abs(x[i])>0.005);
  return {rate,mono,bufferRate:b.sampleRate,bufferFrames:b.length,channels:b.numberOfChannels,duration:b.duration,
   renderedActive:(active.at(-1)!-active[0])/rate,hz:rate*(cross.length-1)/(cross.at(-1)!-cross[0]),maxChannelDiff:Math.max(...x.map((v,i)=>Math.abs(v-y[i])))};
 },{rate,mono});
 expect(data.bufferRate).toBe(22050);expect(data.duration).toBe(mono?0.8:0.4);
 expect(Math.abs(data.hz-(mono?1000:2000))).toBeLessThan(0.5);
 expect(Math.abs(data.renderedActive-data.duration)).toBeLessThan(0.002);
 if(mono)expect(data.maxChannelDiff).toBe(0);
 await writeFile(info.outputPath('resampling.json'),JSON.stringify(data,null,2));
});
