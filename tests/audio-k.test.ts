import {it,expect} from 'vitest';
// @ts-ignore same source embedded in the production worklet
import {PcmRing as K} from '../scripts/phase9-8k-ring.mjs';
// @ts-ignore preserved I reference
import {PcmRing as I} from '../scripts/phase9-8i-ring.mjs';
it('K metadata never changes PCM or transition queue semantics',()=>{
 const a=new I(48000),b=new K(48000);
 for(let n=0;n<3000;n++){
  if(n%300===0){const rate=n%600===0?1:2;a.setRate(rate);b.setRate(rate);}
  const sample=Float32Array.from({length:n%10===0?1:90},(_,i)=>Math.sin(i+n));a.push(sample,22050);b.push(sample,22050);
  const x=new Float32Array(128),y=new Float32Array(128);a.render(x);b.render(y);expect(y).toEqual(x);
 }
 expect(b.report().consumedFrames).toBe(a.report().consumedFrames);expect(b.report().underflowFrames).toBe(a.report().underflowFrames);
});
it('K rate windows retain gaps at the actual rate and cap metadata history',()=>{
 const r=new K(48000);r.started=true;
 for(let n=0;n<150000;n++){if(n===2000)r.setRate(2);r.render(new Float32Array(128));}
 r.sealWindow();const s=r.report();expect(s.rateWindows.windows).toHaveLength(256);expect(s.rateWindows.overwritten).toBeGreaterThan(0);
 expect(s.rateWindows.totals[1].gapFrames).toBe(256000);expect(s.rateWindows.totals[2].gapFrames).toBe(148000*128);expect(s.underflowFrames).toBe(150000*128);
 expect(s.ringCapacityFrames).toBe(65536);expect(s.rateWindows.windows.every((w:any)=>w.rate===2)).toBe(true);
});
import {RateWindows} from '../src/rate-windows';
it('bounded batched rate telemetry deduplicates overlaps and exposes lost windows',()=>{
 const r=new RateWindows();
 for(let i=1;i<600;i++)r.accept({windows:[{sequence:i,rate:1,ms:500},{sequence:i+1,rate:2,ms:500}],totals:{},clock:'test'});
 expect(r.report().windows).toHaveLength(256);expect(r.report().missingWindows).toBe(0);expect(r.report().lastSequence).toBe(600);
 r.accept({windows:[{sequence:604,rate:2,ms:500}]});expect(r.report().missingWindows).toBe(3);
});
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import {PCM_WORKLET} from '../src/generated/phase9-8k-worklet';
function processor(){const messages:any[]=[];let C:any;runInNewContext(readFileSync('public/'+PCM_WORKLET.file,'utf8'),{Float32Array,sampleRate:48000,currentTime:0,AudioWorkletProcessor:class{port={postMessage:(p:any)=>messages.push(p)}},registerProcessor:(_n:string,c:any)=>C=c});return {p:new C(),messages};}
it('2x ACK waits for bounded real-time reserve while 1x keeps consuming queued data',()=>{
 const {p,messages}=processor();p.ring.started=true;p.receive({kind:'pcm',samples:new Float32Array(1600).fill(.3),sourceRate:22050});
 p.receive({kind:'speed',id:1,rate:2});expect(messages).toEqual([]);
 const out=new Float32Array(128);p.process([],[[out]]);expect(out[0]).toBeCloseTo(.3);expect(p.ring.rate).toBe(1);
 p.receive({kind:'pcm',samples:new Float32Array(1500).fill(.3),sourceRate:22050});p.process([],[[out]]);
 expect(messages.find((m:any)=>m.kind==='ack')).toMatchObject({id:1,rate:2});expect(p.ring.stats.underflowFrames).toBe(0);expect(p.ring.stats.droppedFrames).toBe(0);
});
it('1x recovery cancels unconfirmed 2x; no late 2x ACK or discarded PCM',()=>{
 const {p,messages}=processor();p.ring.started=true;p.receive({kind:'pcm',samples:new Float32Array(1000),sourceRate:22050});p.receive({kind:'speed',id:1,rate:2});
 p.receive({kind:'speed',id:2,rate:1});p.receive({kind:'pcm',samples:new Float32Array(4000),sourceRate:22050});p.process([],[[new Float32Array(128)]]);
 expect(messages.filter((m:any)=>m.kind==='ack')).toEqual([{kind:'ack',id:2,rate:1}]);expect(p.ring.rate).toBe(1);expect(p.ring.stats.droppedFrames).toBe(0);
});
