import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const core=(await readFile('scripts/phase9-8k-ring.mjs','utf8')).replace('export class','class');
const code=core+`
function compact(r){const s=r.report();return {...s,rateWindows:{...s.rateWindows,windows:s.rateWindows.windows.slice(-2)}};}
class Ed4PcmProcessor extends AudioWorkletProcessor {
 constructor(){super();this.ring=new PcmRing(sampleRate);this.frames=0;this.supply={packets:0,arrivalMaxMs:0,arrivalSumMs:0,last:0};this.receive=p=>{try{
  if(p.kind==='pcm'){const now=currentTime*1000;if(this.supply.last){const dt=now-this.supply.last;this.supply.arrivalSumMs+=dt;this.supply.arrivalMaxMs=Math.max(this.supply.arrivalMaxMs,dt);}this.supply.last=now;this.supply.packets++;this.ring.push(p.samples,p.sourceRate);}
  else if(p.kind==='attach'){this.input=p.port;this.input.onmessage=e=>this.receive(e.data);this.input.start();}
  else if(p.kind==='speed'){
    if(p.rate!==1&&p.rate!==2)throw Error('Only 1x/2x');
    this.pendingSpeed=p;this.applySpeed();
  }
  else if(p.kind==='status')this.port.postMessage({kind:'stats',stats:{...compact(this.ring),transport:{...this.supply,arrivalMeanMs:this.supply.arrivalSumMs/Math.max(1,this.supply.packets-1)},pendingSpeed:this.pendingSpeed?.rate??null,transitionPolicy:"60ms real-time reserve before 2x ACK; no rebuffer on underrun",mainPcmMessages:0}});
 }catch(error){this.port.postMessage({kind:'error',message:String(error.message)});}};this.port.onmessage=e=>this.receive(e.data);}
 applySpeed(){
  const p=this.pendingSpeed;if(!p)return;
  // Keep playing old queued PCM at 1x until a 60ms *real* 2x reserve exists.
  // No dropped/repeated samples. Host timeout restores native 1x if supply cannot fill it.
  if(p.rate===2&&this.ring.rate===1&&this.ring.started&&this.ring.count<this.ring.sourceRate*2*0.06)return;
  this.pendingSpeed=null;this.ring.setRate(p.rate);this.port.postMessage({kind:'ack',id:p.id,rate:this.ring.rate});
 }
 process(_inputs,outputs){this.applySpeed();const out=outputs[0]?.[0];if(!out)return true;this.ring.render(out);this.frames+=out.length;if(this.frames>=sampleRate/4){this.frames=0;this.port.postMessage({kind:'stats',stats:{...compact(this.ring),transport:{...this.supply,arrivalMeanMs:this.supply.arrivalSumMs/Math.max(1,this.supply.packets-1)},pendingSpeed:this.pendingSpeed?.rate??null,transitionPolicy:"60ms real-time reserve before 2x ACK; no rebuffer on underrun",mainPcmMessages:0}});}return true;}
}
registerProcessor('ed4-pcm-k',Ed4PcmProcessor);
`;
const sha256=createHash('sha256').update(code).digest('hex'),file='audio-worklet-phase9-8k-'+sha256.slice(0,16)+'.js';
await writeFile('public/'+file,code);await writeFile('src/generated/phase9-8k-worklet.ts','export const PCM_WORKLET='+JSON.stringify({file,sha256})+' as const;\n');
console.log({file,sha256});
