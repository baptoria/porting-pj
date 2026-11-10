import {it,expect} from 'vitest';
// @ts-ignore local public experiment; production never imports it.
import {PublicSlotMixer,separationStatus} from '../scripts/phase9-8g-mix-model.mjs';
function slot(format:number,rate=8000,loop=true){const frames=128,channels=format&1?2:1,width=format&2?2:1,bytes=new Uint8Array(frames*channels*width),view=new DataView(bytes.buffer);for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){const x=Math.round(Math.sin(2*Math.PI*i/(c?16:8))*12000);if(width===2)view.setInt16((i*channels+c)*2,x,true);else bytes[i*channels+c]=128+(x>>8);}return {format,rate,loop,bytes,left:32768,right:16384};}
for(const format of [0,1,2,3])it(`pre-mix exclusion preserves SE bytes and cursors, format ${format}`,()=>{
 const bgm=slot(format,11025),se=slot(format),a=new PublicSlotMixer([bgm,se],{format}),b=new PublicSlotMixer([bgm,se],{format}),c=new PublicSlotMixer([se],{format});
 const original=bgm.bytes.slice(),mixed=a.mix(1000),onlySe=b.mix(1000,new Set([0])),expected=c.mix(1000);
 expect(onlySe).toEqual(expected);expect(mixed).not.toEqual(expected);expect(a.state()).toEqual(b.state());expect(bgm.bytes).toEqual(original);
 const silence=new PublicSlotMixer([bgm],{format}).mix(1000,new Set([0]));expect(silence.every((x:number)=>x===(format&2?0:128))).toBe(true);
});
it('muting keeps fractional position, looping, stop and non-loop completion',()=>{
 const a=new PublicSlotMixer([slot(3,22050),slot(0,4000,false)]),b=new PublicSlotMixer([slot(3,22050),slot(0,4000,false)]);
 for(const n of [31,17,311,600]){a.mix(n);b.mix(n,new Set([0]));expect(a.state()).toEqual(b.state());}
 expect(b.state().slots[0].loops).toBeGreaterThan(0);expect(b.state().slots[1].active).toBe(false);a.stop(0);b.stop(0);expect(a.mix(100)).toEqual(b.mix(100,new Set([0])));
});
it('switching suppression off resumes at progressed cursor, not the beginning',()=>{const a=new PublicSlotMixer([slot(0)]),b=new PublicSlotMixer([slot(0)]);a.mix(371);b.mix(371,new Set([0]));expect(a.mix(300)).toEqual(b.mix(300));});
it('static offsets, RAW correlation, mock proof and missing runtime evidence cannot permit 2x',()=>{
 for(const evidence of [undefined,'static-analysis','raw-correlation','public-fixture'])expect(separationStatus({session:'a',observationSession:'a',live:true,gaps:0,evidence,exclusiveBgm:true}).speed2xAllowed).toBe(false);
 expect(separationStatus().normal1xAllowed).toBe(true);
});
it('status requires every live preservation claim; it does not issue a native lease',()=>{
 const e={session:'a',observationSession:'a',live:true,gaps:0,evidence:'runtime-premix-ownership',exclusiveBgm:true,controlSemantics:true,selectiveSuppressionAcknowledged:true,effectsCompared:true,deviceProgressCompared:true,exactPathVerified:true,formatVerified:true,playerReady:true,speedAcknowledged:true};
 expect(separationStatus(e).speed2xAllowed).toBe(true);
 for(const key of ['live','exclusiveBgm','controlSemantics','selectiveSuppressionAcknowledged','effectsCompared','deviceProgressCompared','exactPathVerified','formatVerified','playerReady','speedAcknowledged'])expect(separationStatus({...e,[key]:false}).speed2xAllowed,key).toBe(false);
 expect(separationStatus({...e,gaps:1}).speed2xAllowed).toBe(false);expect(separationStatus({...e,observationSession:'old'}).speed2xAllowed).toBe(false);
});
