import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {timeProbe} from '../../scripts/phase9-8-time-probe.mjs';
import {memoryProbe} from '../../scripts/phase9-5b-probe.mjs';
const txt=(s:string)=>new TextEncoder().encode(s);
for(const cycles of ['12000','max'])test(`local virtual tick budget 1 -> 2 -> 1, cycles ${cycles}`,async({page})=>{
 const dir='artifacts/phase9-8b/engine',wasm=await readFile(dir+'/wdosbox.wasm'),manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));
 expect(createHash('sha256').update(wasm).digest('hex')).toBe(manifest.files['wdosbox.wasm'].sha256);
 await page.route('**/vendor/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:wasm}));
 await page.route('**/vendor/wdosbox.js',async r=>r.fulfill({contentType:'text/javascript',body:await readFile(dir+'/wdosbox.js')}));
 const worker=await readFile('public/dos-worker.js','utf8');
 const prefix=`self.addEventListener('message',e=>{if(e.data?.name==='local-test-speed'){e.stopImmediatePropagation();const result=[1,2].includes(e.data.rate)?runtime._ed4_test_set_speed(e.data.rate):-1;self.postMessage({name:'local-test-speed',result});}});\n`;
 await page.route('**/dos-worker.js',r=>r.fulfill({contentType:'text/javascript',body:prefix+worker}));
 await page.route('**/local-bgm.mjs',async r=>r.fulfill({contentType:'text/javascript',body:await readFile('scripts/phase9-8b-bgm.mjs')}));
 const fixture=zipSync({'TIMER.COM':timeProbe(),'MEM.COM':memoryProbe(3),'.jsdos/dosbox.conf':txt(`[dosbox]\nmemsize=16\n[cpu]\ncore=normal\ncycles=${cycles}\n[mixer]\nnosound=false\nrate=22050\n[sblaster]\nsbtype=sb16\n[autoexec]\nmount c .\nc:\nMEM.COM\nTIMER.COM\n`)});
 await page.addInitScript(({fixture})=>{const w=window as any;w.clockProbe={events:[],acks:[],errors:[]};const Native=Worker;window.Worker=class extends Native{
  constructor(u:string|URL,o?:WorkerOptions){super(u,o);w.testWorker=this;this.addEventListener('message',e=>{const d=e.data;if(d?.name==='local-test-speed')w.clockProbe.acks.push(d.result);if(d?.name==='ed4-runtime-error')w.clockProbe.errors.push(d.props);if(d?.name==='ws-stdout'){for(const m of d.props.message.matchAll(/TIMER_BEGIN|TIMER_DONE/g))w.clockProbe.events.push({kind:m[0],time:performance.now()});}});}
  postMessage(m:any,t?:any){if(m?.name==='wc-run'){const b=new Uint8Array(fixture);m={...m,props:{...m.props,bundles:[b]}};t=[b.buffer];}super.postMessage(m,t);}
 };},{fixture:Array.from(fixture)});
 await page.goto('/porting-pj/ed4/');page.on('dialog',d=>void d.accept());await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();
 await expect(page.locator('#logs')).toContainText('PUBLIC_468_COPY_AND_RETF_OK');await expect(page.locator('#logs')).toContainText('TIMER_READY');
 await page.evaluate(async()=>{
  const moduleUrl='/porting-pj/ed4/local-bgm.mjs';const {RealtimeBgm}=await import(/* @vite-ignore */ moduleUrl);
  const w=window as any,ctx=new AudioContext();await ctx.resume();w.externalBgmEvidence=[];w.externalBgmErrors=[];
  const make=ctx.createBufferSource.bind(ctx);ctx.createBufferSource=()=>{const n=make(),start=n.start.bind(n);n.start=((...a:any[])=>{const b=n.buffer!,s=b.getChannelData(0);let z=0;for(let i=1;i<s.length;i++)if(s[i-1]<=0&&s[i]>0)z++;w.externalBgmEvidence.push({guestRate:w.requestedGuestRate??1,sourceRate:b.sampleRate,playbackRate:n.playbackRate.value,hz:z/b.duration,duration:b.duration});start(...a);}) as typeof n.start;return n;};
  const bytes=new ArrayBuffer(8+22050*4),d=new DataView(bytes);for(let i=0;i<22050;i++)for(let c=0;c<2;c++)d.setInt16(8+i*4+c*2,Math.sin(2*Math.PI*440*i/22050)*12000,true);
  // The public TIMER fixture produces no BGM. This is not a game mute hook.
  w.externalBgm=new RealtimeBgm(ctx,ctx.destination,(c:any)=>c.provenance==='timer-fixture-has-no-bgm');w.externalBgmContext=ctx;
  await w.externalBgm.command({sequence:1,type:'play',file:new Blob([bytes]),format:{encoding:'pcm16le',channels:2,rate:22050,offset:8},loop:true,provenance:'timer-fixture-has-no-bgm'});
  w.externalBgmPoll=setInterval(()=>void w.externalBgm.pump().catch((e:Error)=>w.externalBgmErrors.push(e.message)),60);
 });
 let count=0;const timings:any[]=[];
 for(const rate of [1,2,1]){await page.evaluate(rate=>{(window as any).requestedGuestRate=rate;(window as any).testWorker.postMessage({name:'local-test-speed',rate});},rate);await expect.poll(()=>page.evaluate(()=>(window as any).clockProbe.acks.length)).toBe(timings.length+1);const start=count;
  for(let i=0;i<3;i++){await page.locator('#canvas').focus();await page.keyboard.press('t');count+=2;await expect.poll(()=>page.evaluate(()=>(window as any).clockProbe.events.length)).toBe(count);}
  const events=await page.evaluate(()=>(window as any).clockProbe.events);timings.push({rate,ms:[0,2,4].map(i=>events[start+i+1].time-events[start+i].time)});
 }
 await page.evaluate(()=>(window as any).testWorker.postMessage({name:'local-test-speed',rate:1.5}));await expect.poll(()=>page.evaluate(()=>(window as any).clockProbe.acks.at(-1))).toBe(-1);
 const med=(x:number[])=>[...x].sort((a,b)=>a-b)[1];const ratio=med(timings[0].ms)/med(timings[1].ms);expect(ratio).toBeGreaterThan(1.7);expect(ratio).toBeLessThan(2.3);expect(med(timings[2].ms)/med(timings[0].ms)).toBeGreaterThan(.85);expect(med(timings[2].ms)/med(timings[0].ms)).toBeLessThan(1.15);
 expect(await page.evaluate(()=>(window as any).clockProbe.errors)).toEqual([]);
 const externalBgm=await page.evaluate(async()=>{const w=window as any;clearInterval(w.externalBgmPoll);w.externalBgm.dispose();await w.externalBgmContext.close();return {buffers:w.externalBgmEvidence,errors:w.externalBgmErrors,underruns:w.externalBgm.underruns};});
 expect(externalBgm.errors).toEqual([]);expect(externalBgm.buffers.some((b:any)=>b.guestRate===2)).toBe(true);expect(externalBgm.buffers.every((b:any)=>b.sourceRate===22050&&b.playbackRate===1&&b.hz>=438&&b.hz<=442&&b.duration===.5)).toBe(true);
 await page.keyboard.press('q');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 await writeFile(`artifacts/phase9-8b/clock-${cycles}.json`,JSON.stringify({cycles,timings,ratio,externalBgm,wasmSha256:manifest.files['wdosbox.wasm'].sha256,scope:'public BIOS timer plus simultaneous synthetic BGM; no ED4 command or native suppression hook'},null,2));
});
