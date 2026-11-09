import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
test('independent real-time synthetic RAW: looping, pause, transition, stop, stale reads, gating',async({page})=>{
 await page.route('**/local-bgm.mjs',async r=>r.fulfill({contentType:'text/javascript',body:await readFile('scripts/phase9-8b-bgm.mjs')}));
 await page.goto('/porting-pj/ed4/');
 const result=await page.evaluate(async()=>{
  const moduleUrl='/porting-pj/ed4/local-bgm.mjs';const {RealtimeBgm}=await import(/* @vite-ignore */ moduleUrl);
  // CC0 generated samples, NOT the user's RAW files or an asserted ED4 codec.
  const tone=(hz:number,seconds:number)=>{const b=new ArrayBuffer(8+22050*seconds*4),d=new DataView(b);d.setUint16(0,3,true);d.setUint16(2,22050,true);d.setUint32(4,b.byteLength-8,true);for(let i=0;i<(b.byteLength-8)/4;i++)for(let c=0;c<2;c++)d.setInt16(8+i*4+c*2,Math.sin(2*Math.PI*hz*i/22050)*12000,true);return new Blob([b]);};
  const format={encoding:'pcm16le',channels:2,rate:22050,offset:8};
  const render=async(guestRate:number)=>{
   const ctx=new OfflineAudioContext(2,48000*3,48000);const bgm=new RealtimeBgm(ctx,ctx.destination,(c:any)=>c.provenance==='public-fixture'&&c.suppressed===true);
   await bgm.command({sequence:1,type:'play',file:tone(440,1),format,loop:true,provenance:'public-fixture',suppressed:true});
   const checkpoints=[];for(let t=.2;t<2.8;t+=.2){const at=t;checkpoints.push(ctx.suspend(at).then(async()=>{await bgm.pump();await ctx.resume();}));}
   const audio=await ctx.startRendering();await Promise.all(checkpoints);const samples=audio.getChannelData(0);let crossings=0;for(let i=4801;i<48000*2.5;i++)if(samples[i-1]<=0&&samples[i]>0)crossings++;
   return {guestRate,hz:crossings/2.4,seconds:audio.duration,maxRead:bgm.maxRead,underruns:bgm.underruns,samples:Array.from(samples)};
  };
  const one=await render(1),two=await render(2); // guestRate is deliberately not a BGM input.
  const ctx=new AudioContext();await ctx.resume();const p=new RealtimeBgm(ctx,ctx.destination,(c:any)=>c.suppressed===true&&c.provenance==='public-fixture');
  const cmd={type:'play',file:tone(330,2),format,provenance:'public-fixture',suppressed:true,loop:true};let rejected=false;
  try{await p.command({...cmd,sequence:1,suppressed:false});}catch{rejected=true;}
  await p.command({...cmd,sequence:1});await new Promise(r=>setTimeout(r,90));await p.command({sequence:2,type:'pause'});const paused={state:p.state,nodes:p.nodes.size,frame:p.pausedFrame};
  await p.command({sequence:3,type:'resume'});const resumed=p.startedFrame;await p.command({...cmd,sequence:4,file:tone(550,1)});const transition={cursor:p.cursor,nodes:p.nodes.size};
  await p.command({sequence:5,type:'stop'});const stopped={state:p.state,nodes:p.nodes.size};const stale=await p.command({...cmd,sequence:4});
  // A delayed file read finishing after a stop must not start audio.
  let finish:any;const file={size:cmd.file.size,slice:(a:number,b:number)=>({arrayBuffer:()=>new Promise<ArrayBuffer>(r=>{finish=()=>void cmd.file.slice(a,b).arrayBuffer().then(r);})})};
  const pending=p.command({...cmd,sequence:6,file});await p.command({sequence:7,type:'stop'});finish();await pending;const cancelledNodes=p.nodes.size;
  p.dispose();await ctx.close();
  return {one,two,rejected,paused,resumed,transition,stopped,stale,cancelledNodes};
 });
 expect(result.one.hz).toBeGreaterThan(439);expect(result.one.hz).toBeLessThan(441);expect(result.two.samples).toEqual(result.one.samples);expect(result.one.underruns).toBe(0);expect(result.one.maxRead).toBeLessThanOrEqual(44100);
 expect(result.rejected).toBe(true);expect(result.paused.state).toBe('paused');expect(result.paused.nodes).toBe(0);expect(result.paused.frame).toBeGreaterThan(0);expect(result.resumed).toBe(result.paused.frame);expect(result.transition.nodes).toBe(1);expect(result.stopped).toEqual({state:'stopped',nodes:0});expect(result.stale).toBe(false);expect(result.cancelledNodes).toBe(0);
 const {samples:_,...one}=result.one,{samples:__,...two}=result.two;
 await writeFile('artifacts/phase9-8b/bgm.json',JSON.stringify({...result,one,two,scope:'synthetic explicit commands with simulated suppression; NOT detected ED4 commands'},null,2));
});
