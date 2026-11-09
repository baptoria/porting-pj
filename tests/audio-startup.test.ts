import {it,expect} from 'vitest';
import {AudioStartup,audioSchedule} from '../src/audio-startup';
it('reproduces old queued-buffer overlap and preserves monotonic scheduling',()=>{
 const now=1,queuedEnd=1.4;
 const oldAt=queuedEnd>now+.25?now+.025:queuedEnd;
 expect(queuedEnd-oldAt).toBeCloseTo(.375);
 const fixed=audioSchedule(queuedEnd,now,.1);
 expect(fixed.at).toBe(queuedEnd);expect(fixed.next).toBe(1.5);expect(fixed.resync).toBe(false);
 expect(audioSchedule(.5,now,.1)).toMatchObject({at:1.025,resync:true});
});
it('bounded startup aggregates expose gaps and clipping without exporting samples',()=>{
 const trace=new AudioStartup();for(let i=0;i<1000;i++)trace.observe(new Float32Array([0,1,NaN,-.5]),{atMs:i*100,contextTime:i*.1,rate:22050,scheduledAt:i*.1+.025,queueEnd:i*.1,state:'running'});
 const r=trace.report();expect(r.events.length).toBeLessThanOrEqual(96);expect(r.events[0]).toMatchObject({nonFinite:1,clipped:1,gapMs:25});expect(r.events.every(e=>(e.atMs as number)<=60000)).toBe(true);expect(r.samplesExported).toBe(false);expect(JSON.stringify(r)).not.toContain('"samples":');
});
