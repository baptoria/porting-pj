import {it,expect} from 'vitest';
import {SpeedHealth} from '../src/speed-health';
function fixture(){
 const h=new SpeedHealth(),n={rate:2,audioUnderflows:0,audioClamps:0},w={rate:2,outputRate:48000,underflowFrames:0,underruns:0,overflows:0,droppedFrames:0,receivedFrames:0,consumedFrames:0,outputFrames:0,queueAheadMs:40,observedAtMs:0};let now=0;
 h.baseline(now,n,w);h.switched(2,now);
 const tick=(gap=0,episodes=gap?1:0)=>{now+=1000;w.observedAtMs=now;w.underflowFrames+=gap*48;w.underruns+=episodes;w.receivedFrames+=22050*n.rate;w.consumedFrames+=22050*n.rate;w.outputFrames+=48000;return h.observe(now,n,w,'running');};
 const recover=()=>{h.recovering('test',now);n.rate=w.rate=1;h.recovered(now,n,w);};
 return {h,n,w,tick,recover,now:()=>now};
}
for(const gap of [23.9,24,24.1,30])it(`single ${gap}ms gap stays at 2x, retained overlapping window is not a new incident`,()=>{
 const f=fixture();expect(f.tick(gap).action).toBe('none');expect(f.h.phase).toBe('transient-warning');for(let i=0;i<5;i++)expect(f.tick().action).toBe('none');expect(f.h.phase).toBe('normal-2x');expect(f.h.events.filter(e=>e.kind==='new-audio-incident')).toHaveLength(1);
});
it('repeated distinct gaps recover, healthy same session explicitly retries without replaying old counters',()=>{
 const f=fixture();f.tick(14);expect(f.tick(14).action).toBe('recover');f.recover();
 for(let i=0;i<7;i++){f.tick();expect(f.h.phase).toBe('stabilizing');}f.tick();expect(f.h.phase).toBe('ready-to-retry');
 f.n.rate=f.w.rate=2;f.h.switched(2,f.now());expect(f.tick().action).toBe('none');expect(f.h.phase).toBe('normal-2x');
});
it('severe gaps and multiple episodes within one poll are not hidden by hysteresis',()=>{
 expect(fixture().tick(120).action).toBe('recover');expect(fixture().tick(30,3).action).toBe('recover');
});
it('native cumulative underflows/clamps use increments; same historical value cannot lock a recovered session',()=>{
 const f=fixture();f.n.audioClamps=1;expect(f.tick().action).toBe('recover');f.recover();for(let i=0;i<8;i++)f.tick();expect(f.h.phase).toBe('ready-to-retry');expect(f.tick().action).toBe('none');f.n.audioUnderflows=3;expect(f.tick().action).toBe('recover');
});
it('three native underflows spread over recent polls trigger recovery',()=>{const f=fixture();for(let i=1;i<=3;i++){f.n.audioUnderflows=i;expect(f.tick().action).toBe(i===3?'recover':'none');}});
it('stable means receiving and consuming PCM, not just rate ACK or elapsed time',()=>{
 const f=fixture();f.recover();for(let i=1;i<=15;i++){f.w.observedAtMs=i*1000;const r=f.h.observe(i*1000,f.n,f.w,'running');expect(r.action).toBe(i===15?'fatal':'none');}expect(f.h.phase).not.toBe('ready-to-retry');
});
it('new gaps restart stable interval; pause time is excluded',()=>{
 const f=fixture();f.recover();for(let i=0;i<5;i++)f.tick();f.h.paused(f.now());f.tick(1);for(let i=0;i<7;i++)f.tick();expect(f.h.phase).toBe('stabilizing');f.tick();expect(f.h.phase).toBe('ready-to-retry');
});
it('rate mismatch, overflow, dropped data, counter regression and stalled/context clock stay protected',()=>{
 for(const kind of ['rate','overflow','dropped','counter']){const f=fixture();if(kind==='rate')f.w.rate=1;if(kind==='overflow')f.w.overflows=1;if(kind==='dropped')f.w.droppedFrames=5;if(kind==='counter')f.n.audioClamps=-1;expect(f.tick().action).toBe('fatal');}
 for(const context of ['running','suspended']){const f=fixture();for(let i=1;i<=3;i++){const r=f.h.observe(i*2000,f.n,f.w,context);expect(r.action).toBe(i===3?'fatal':'none');}}
});
it('three recoveries in sixty seconds limit retry, metadata bounded',()=>{
 const f=fixture();for(let i=0;i<3;i++)f.recover();expect(f.h.phase).toBe('fatal-fault');expect(f.h.blocked).toBe(true);
 for(let i=0;i<200;i++)f.h.paused(i);expect(f.h.report().events).toHaveLength(128);
});
