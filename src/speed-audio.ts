import type {Speed} from './speed-control';
type Chunk={buffer:AudioBuffer,node:AudioBufferSourceNode,start:number,offset:number,rate:Speed,end:number};
/** Keep mono sample rate unchanged. Change playback duration once, in WebAudio.
 * Retain only unplayed buffer portions when changing rate; never overlap queues.
 * PCM stays in the live audio queue, never in diagnostic JSON. */
export class SpeedAudio {
 private lastBuffer?:AudioBuffer;private chunks:Chunk[]=[];rate:Speed=1;private next=0;private late:number[]=[];
 private counters={blocks:0,frames:0,reschedules:0,underruns:0,audibleUnderruns:0,gapSeconds:0,maxAheadMs:0,overlaps:0,droppedFrames:0};
 constructor(private ctx:BaseAudioContext,private output:AudioNode){}
 private prune(){const now=this.ctx.currentTime;this.chunks=this.chunks.filter(c=>c.end>now);}
 private add(buffer:AudioBuffer,start:number,offset:number){
  const node=this.ctx.createBufferSource();node.buffer=buffer;node.playbackRate.value=this.rate;node.connect(this.output);
  const c={buffer,node,start,offset,rate:this.rate,end:start+(buffer.duration-offset)/this.rate};
  if(this.chunks.length&&start<this.chunks[this.chunks.length-1].end-1e-7)this.counters.overlaps++;
  node.onended=()=>{node.disconnect();this.chunks=this.chunks.filter(x=>x!==c);};
  node.start(start,offset);this.chunks.push(c);this.next=c.end;return c;
 }
 push(buffer:AudioBuffer){
  this.prune();const now=this.ctx.currentTime,previous=this.next;
  if(this.chunks.length>=128){this.counters.droppedFrames+=buffer.length;throw Error('오디오 큐 상한 초과: 실험 중단 필요');}
  const starved=!!this.counters.blocks&&previous<now-.003;
  const audibleStarved=starved&&[this.lastBuffer,buffer].some(b=>b?.getChannelData?.(0).some(x=>Math.abs(x)>0.0001));
  this.lastBuffer=buffer;if(audibleStarved)this.counters.audibleUnderruns++;
  if(starved){this.counters.underruns++;this.counters.gapSeconds+=now-previous;this.late.push(now);}
  this.late=this.late.filter(t=>now-t<3);
  const at=!this.counters.blocks||this.next<now?now+.06:this.next; // repair only a late queue
  this.add(buffer,at,0);this.counters.blocks++;this.counters.frames+=buffer.length;
  this.counters.maxAheadMs=Math.max(this.counters.maxAheadMs,(this.next-now)*1000);
  return {at,previous,next:this.next,starved,audibleStarved};
 }
 setRate(rate:Speed){
  if(rate!==1&&rate!==2)throw Error('Invalid audio speed');if(rate===this.rate)return;
  this.prune();const now=this.ctx.currentTime,old=this.chunks;this.chunks=[];
  this.rate=rate;this.next=old.length?Math.max(now,old[0].start):now;
  for(const c of old){c.node.onended=null;c.node.stop(now);c.node.disconnect();
   const offset=Math.min(c.buffer.duration,c.offset+Math.max(0,now-c.start)*c.rate);
   if(offset<c.buffer.duration)this.add(c.buffer,this.next,offset);
  }
  this.counters.reschedules++;
 }
 resetHealth(){this.late=[];}
 problem(){const now=this.ctx.currentTime;this.late=this.late.filter(t=>now-t<3);if(this.next-now>.5||this.chunks.length>64)return '오디오 예약 큐가 안전 범위를 초과했습니다.';if(this.late.length>=5)return '오디오 공급 지연이 반복되었습니다.';return null;}
 report(){this.prune();return {...this.counters,rate:this.rate,queueAheadMs:Math.max(0,this.next-this.ctx.currentTime)*1000,queuedBuffers:this.chunks.length,sourceChannels:1,policy:'retain-unplayed; playbackRate=acknowledged speed; no pitch correction',samplesExported:false};}
 dispose(){for(const c of this.chunks){c.node.onended=null;c.node.stop();c.node.disconnect();}this.chunks=[];this.lastBuffer=undefined;this.next=0;this.rate=1;this.late=[];}
}
