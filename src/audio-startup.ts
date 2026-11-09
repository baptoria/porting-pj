/** Metadata only. No PCM arrays, individual samples or game memory are retained. */
export function audioSchedule(next:number,now:number,duration:number){
 const behind=next<now;
 const at=behind?now+.025:next;
 return {at,next:at+duration,resync:behind,queueAheadMs:Math.max(0,next-now)*1000};
}
export class AudioStartup {
 private blocks=0;private lastAt=-Infinity;private previousEnd:number|undefined;
 private first:Record<string,unknown>[]=[];private tail:Record<string,unknown>[]=[];
 private states:{atMs:number;state:string}[]=[];
 state(atMs:number,state:string){if(this.states.length<16)this.states.push({atMs,state});}
 observe(samples:Float32Array,info:{atMs:number;contextTime:number;rate:number;scheduledAt:number|null;queueEnd:number;state:string;program?:string}){
  const sequence=++this.blocks,edge=this.previousEnd;this.previousEnd=samples.at(-1);
  if(info.atMs>60000||(sequence>32&&info.atMs-this.lastAt<250))return;
  this.lastAt=info.atMs;let peak=0,sum=0,squares=0,nonFinite=0,clipped=0;
  for(const s of samples){if(!Number.isFinite(s)){nonFinite++;continue;}peak=Math.max(peak,Math.abs(s));sum+=s;squares+=s*s;if(Math.abs(s)>=1)clipped++;}
  const count=samples.length-nonFinite;
  const row={sequence,...info,frames:samples.length,peak,rms:count?Math.sqrt(squares/count):0,mean:count?sum/count:0,nonFinite,clipped,
   edgeJump:edge!==undefined&&Number.isFinite(edge)&&Number.isFinite(samples[0])?Math.abs(samples[0]-edge):null,
   gapMs:info.scheduledAt===null?null:Math.max(0,info.scheduledAt-info.queueEnd)*1000,
   overlapMs:info.scheduledAt===null?null:Math.max(0,info.queueEnd-info.scheduledAt)*1000};
  if(this.first.length<32)this.first.push(row);else{if(this.tail.length===64)this.tail.shift();this.tail.push(row);}
 }
 report(){return {scope:'first 60 seconds; first32 blocks then at most4/s; last64 sampled records',blocks:this.blocks,states:[...this.states],events:[...this.first,...this.tail],samplesExported:false,
  note:'Mixed stream statistics are not device attribution, a recording, or proof of audible noise. EXEC labels are requests, not completed initialization.'};}
}
