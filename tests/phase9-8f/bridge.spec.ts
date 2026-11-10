import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
test.use({serviceWorkers:'block'});
test('bridge gates native ownership, follows explicit 9/10/9 paths, keeps loops and continuous BGM at 2x',async({page},info)=>{
 for(const name of ['phase9-8f-bgm-bridge.mjs','phase9-8b-bgm.mjs'])await page.route('**/'+name,async r=>r.fulfill({contentType:'text/javascript',body:await readFile('scripts/'+name)}));
 await page.goto('/porting-pj/ed4/');
 const result=await page.evaluate(async()=>{
  const url='/porting-pj/ed4/phase9-8f-bgm-bridge.mjs';const {BgmBridge}=await import(/* @vite-ignore */ url);
  const ctx=new AudioContext();await ctx.resume();const output:any[]=[],make=ctx.createBufferSource.bind(ctx);
  ctx.createBufferSource=()=>{const node=make(),start=node.start.bind(node);node.start=((at?:number)=>{const b=node.buffer!,s=b.getChannelData(0);let z=0;for(let i=1;i<s.length;i++)if(s[i-1]<=0&&s[i]>0)z++;output.push({hz:z/b.duration,seconds:b.duration,rate:node.playbackRate.value});start(at);}) as any;return node;};
  function tone(hz:number){const bytes=new ArrayBuffer(8+44100*4),v=new DataView(bytes);for(let i=0;i<44100;i++)for(let c=0;c<2;c++)v.setInt16(8+i*4+c*2,12000*Math.sin(2*Math.PI*hz*i/22050),true);return new Blob([bytes]);}
  const files:any={'CUSTOM/FIELD.RAW':tone(440),'MOD/BATTLE.RAW':tone(660)},released=new Set(),speed:number[]=[];let allow=false,revoked=false,failOpen=false;
  const adapter={session:'fixture',commandVerified:(c:any)=>c.provenance==='synthetic-owned-stream',open:async(p:string)=>{if(failOpen)throw Error('Synthetic read failure');return files[p];},acquire:async()=>allow?{session:'fixture',exclusiveBgm:true,preservesSeIrqDma:true}:null,isCurrent:(lease:any)=>!revoked&&!released.has(lease),release:async(l:any)=>{released.add(l);},setSpeed:async(r:number)=>{speed.push(r);return r;}};
  const bridge=new BgmBridge(ctx,ctx.destination,adapter),format={encoding:'pcm16le',channels:2,rate:22050,offset:8};let seq=0;
  const send=(c:any)=>bridge.dispatch({session:'fixture',sequence:++seq,provenance:'synthetic-owned-stream',...c});let denied=0;
  try{await send({type:'speed',rate:2});}catch{denied++;}
  try{await send({type:'play',selection:9,path:'CUSTOM/FIELD.RAW',format,loop:true});}catch{denied++;}
  const noAudioBeforeVerified=output.length===0;allow=true;
  await send({type:'play',selection:9,path:'CUSTOM/FIELD.RAW',format,loop:true});const epoch=bridge.player.epoch,at=bridge.player.startedAt;
  await send({type:'speed',rate:2});await send({type:'speed',rate:1});const continuous=bridge.player.epoch===epoch&&bridge.player.startedAt===at;
  await send({type:'play',selection:10,path:'MOD/BATTLE.RAW',format,loop:true});await send({type:'play',selection:9,path:'CUSTOM/FIELD.RAW',format,loop:true});
  await send({type:'pause'});const paused=bridge.player.state;await send({type:'resume'});const resumed=bridge.player.state;
  bridge.player.cursor=bridge.player.total;bridge.player.at=ctx.currentTime;await bridge.pump();const looped=bridge.player.state==='playing'&&bridge.player.cursor>0;
  await send({type:'stop'});const stopped=bridge.player.nodes.size===0&&bridge.lease===null&&bridge.rate===1;
  await send({type:'play',selection:9,path:'CUSTOM/FIELD.RAW',format,loop:true});await send({type:'speed',rate:2});revoked=true;let lost=false;try{await bridge.pump();}catch{lost=true;}const recovered=bridge.rate===1&&bridge.player.nodes.size===0&&bridge.lease===null;
  revoked=false;await send({type:'play',selection:9,path:'CUSTOM/FIELD.RAW',format,loop:true});await send({type:'speed',rate:2});failOpen=true;let failedRead=false;try{await send({type:'play',selection:10,path:'MOD/BATTLE.RAW',format,loop:true});}catch{failedRead=true;}const readRecovered=failedRead&&bridge.rate===1&&bridge.player.nodes.size===0&&bridge.lease===null;
  let stale=false;try{await bridge.dispatch({session:'old-session',sequence:++seq,type:'play'});}catch{stale=true;}
  await bridge.dispose();await ctx.close();return {denied,noAudioBeforeVerified,continuous,paused,resumed,looped,stopped,lost,recovered,stale,readRecovered,output,speed,scope:'synthetic ownership adapter; not an ED4 BGM mute implementation'};
 });
 expect(result.denied).toBe(2);for(const key of ['noAudioBeforeVerified','continuous','looped','stopped','lost','recovered','stale','readRecovered'])expect((result as any)[key],key).toBe(true);expect(result.paused).toBe('paused');expect(result.resumed).toBe('playing');expect(result.output.slice(0,3).map(x=>Math.round(x.hz))).toEqual([440,660,440]);expect(result.output.every(x=>x.rate===1)).toBe(true);await writeFile(info.outputPath('bridge.json'),JSON.stringify(result,null,2));
});
