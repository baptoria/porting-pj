import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const core=(await readFile('scripts/phase9-8i-ring.mjs','utf8')).replace('export class','class');
const code=core+`
class Ed4PcmProcessor extends AudioWorkletProcessor {
 constructor(){super();this.ring=new PcmRing(sampleRate);this.frames=0;this.supply={packets:0,arrivalMaxMs:0,arrivalSumMs:0,last:0};this.receive=p=>{try{
  if(p.kind==='pcm'){const now=currentTime*1000;if(this.supply.last){const dt=now-this.supply.last;this.supply.arrivalSumMs+=dt;this.supply.arrivalMaxMs=Math.max(this.supply.arrivalMaxMs,dt);}this.supply.last=now;this.supply.packets++;this.ring.push(p.samples,p.sourceRate);}
  else if(p.kind==='attach'){this.input=p.port;this.input.onmessage=e=>this.receive(e.data);this.input.start();}
  else if(p.kind==='speed'){this.ring.setRate(p.rate);this.port.postMessage({kind:'ack',id:p.id,rate:this.ring.rate});}
  else if(p.kind==='status')this.port.postMessage({kind:'stats',stats:{...this.ring.report(),transport:{...this.supply,arrivalMeanMs:this.supply.arrivalSumMs/Math.max(1,this.supply.packets-1)},mainPcmMessages:0}});
 }catch(error){this.port.postMessage({kind:'error',message:String(error.message)});}};this.port.onmessage=e=>this.receive(e.data);}
 process(_inputs,outputs){const out=outputs[0]?.[0];if(!out)return true;this.ring.render(out);this.frames+=out.length;if(this.frames>=sampleRate/4){this.frames=0;this.port.postMessage({kind:'stats',stats:{...this.ring.report(),transport:{...this.supply,arrivalMeanMs:this.supply.arrivalSumMs/Math.max(1,this.supply.packets-1)},mainPcmMessages:0}});}return true;}
}
registerProcessor('ed4-pcm-i',Ed4PcmProcessor);
`;
const sha256=createHash('sha256').update(code).digest('hex'),file='audio-worklet-phase9-8i-'+sha256.slice(0,16)+'.js';
await writeFile('public/'+file,code);await writeFile('src/generated/phase9-8i-worklet.ts','export const PCM_WORKLET='+JSON.stringify({file,sha256})+' as const;\n');
console.log({file,sha256});
