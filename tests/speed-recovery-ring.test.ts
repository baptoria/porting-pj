import {it,expect} from 'vitest';
// Same immutable production ring; virtual render clock gives exact input starvation.
// @ts-ignore native JS module
import {PcmRing} from '../scripts/phase9-8k-ring.mjs';
import {SpeedHealth} from '../src/speed-health';
it('actual production ring measures 24ms input starvation and later recurrence without altering queued samples',()=>{
 const r=new PcmRing(48000),h=new SpeedHealth(),n={rate:2,audioUnderflows:0,audioClamps:0};r.setRate(2);r.started=true;r.lastSignal=true;
 h.baseline(0,n,r.report());r.render(new Float32Array(1152));
 let w={...r.report(),observedAtMs:1000};expect(w.windowGapMs).toBeCloseTo(24);expect(w.underflowFrames).toBe(1152);expect(h.observe(1000,n,w,'running').action).toBe('none');
 r.push(new Float32Array(3000).fill(.25),22050);const out=new Float32Array(128);r.render(out);expect(out[0]).toBeCloseTo(.25);
 // Consume the whole available queue, then another known gap.
 for(let i=0;i<35;i++)r.render(new Float32Array(128));w={...r.report(),observedAtMs:2000};expect(h.observe(2000,n,w,'running').action).toBe('recover');
 expect(w.overflows).toBe(0);expect(w.droppedFrames).toBe(0);
});
