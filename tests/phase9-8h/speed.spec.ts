import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
import {timeProbe} from '../../scripts/phase9-8-time-probe.mjs';
async function start(page:Page,files:Record<string,Uint8Array>){page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'speed-public.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-8h');await page.locator('#boot-start').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await expect(page.locator('#speed-toggle')).toBeEnabled();await page.locator('#fullscreen').click();}
async function menu(page:Page){if(!((await page.locator('#play-area').getAttribute('class'))??'').includes('menu-open'))await page.locator('#player-menu').click();}
async function stop(page:Page){await menu(page);await page.locator('#stop').click();}
async function diagnostic(page:Page){await menu(page);const p=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const d=JSON.parse(await readFile((await(await p).path())!,'utf8'));await page.locator('#player-menu').click();return d;}
for(const cycles of ['12000','max'])test(`actual H product Worker, UI 1 -> 2 -> 1 -> 2 -> 1, BIOS time, scene export and restart, cycles ${cycles}`,async({page},info)=>{
 const bundle=zipSync({'TIMER.COM':timeProbe(),'.jsdos/dosbox.conf':new TextEncoder().encode(`[dosbox]\nmemsize=16\n[cpu]\ncore=normal\ncycles=${cycles}\n[mixer]\nrate=22050\n[sblaster]\nsbtype=sb16\n[autoexec]\nmount c .\nc:\nTIMER.COM\n`)});
 await page.addInitScript(({bundle})=>{const w=window as any;w.timerEvents=[];const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(e.data?.name==='ws-stdout')for(const m of e.data.props.message.matchAll(/TIMER_BEGIN|TIMER_DONE/g))w.timerEvents.push({kind:m[0],time:performance.now()});});}postMessage(m:any,t?:any){if(m?.name==='wc-run'){const bytes=new Uint8Array(bundle);m={...m,props:{...m.props,bundles:[bytes]}};t=[bytes.buffer];}super.postMessage(m,t);}};},{bundle:Array.from(bundle)});
 await start(page,{'TIMER.COM':timeProbe()});await expect(page.locator('#logs')).toContainText('TIMER_READY');const rows:any[]=[];let n=0;
 for(const rate of [1,2,1,2,1]){if(rows.length){await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(rate===2));await expect(page.locator('#speed-toggle')).toBeEnabled();}
  await page.locator('#canvas').focus();await page.keyboard.press('t');n+=2;await expect.poll(()=>page.evaluate(()=>(window as any).timerEvents.length)).toBe(n);const es=await page.evaluate(()=>(window as any).timerEvents);rows.push({rate,ms:es[n-1].time-es[n-2].time});
 }
 expect(rows[0].ms/rows[1].ms).toBeGreaterThan(1.7);expect(rows[0].ms/rows[1].ms).toBeLessThan(2.3);expect(rows[2].ms/rows[0].ms).toBeGreaterThan(.85);expect(rows[2].ms/rows[0].ms).toBeLessThan(1.15);
 await menu(page);await page.locator('#scene-panel').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#scene-name').selectOption('필드');await page.locator('#scene-capture').click();await expect(page.locator('#scene-status')).toContainText('1개 장면');
 const d=await diagnostic(page);expect(d.engine.artifact.id).toBe('phase9-8h');expect(d.engine.artifact.verification).toBe('sha256-of-compiled-module');expect(d.engine.integratedSpeed.control.events.some((e:any)=>e.kind==='ack'&&e.rate===2)).toBe(true);expect(d.engine.integratedSpeed.fault).toBeNull();expect(d.engine.cpuHistory.enabled).toBe(false);expect(d.engine.runtimeErrors.events).toEqual([]);
 await writeFile(info.outputPath('timings.json'),JSON.stringify({rows,engine:d.engine},null,2));await page.locator('#canvas').focus();await page.keyboard.press('q');await stop(page);await expect(page.locator('#speed-toggle')).toBeDisabled();
 await page.locator('#boot-open').click();await expect(page.locator('#boot-engine')).toHaveValue('stable');await page.locator('#boot-engine').selectOption('phase9-8h');await page.locator('#boot-start').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await expect(page.locator('#speed-toggle')).toBeEnabled();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');await page.locator('#fullscreen').click();await stop(page);
});
for(const cycles of ['12000'])test(`H simultaneous public BGM+SE output, audible scheduling duration and bounded queue across switches, cycles ${cycles}`,async({page},info)=>{
 await page.addInitScript(()=>{const w=window as any;w.audioCapture={blocks:[],rate:0};const native=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a:Parameters<typeof native>){if(this.buffer&&w.audioCapture.blocks.length<2000)w.audioCapture.blocks.push({at:a[0],offset:a[1]??0,rate:this.playbackRate.value,duration:this.buffer.duration,now:this.context.currentTime,samples:Array.from(this.buffer.getChannelData(0))});return native.apply(this,a);};});
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8g-mix-probe.b64','utf8')).trim(),'base64');
 const bundle=zipSync({'MIX.COM':program,'.jsdos/dosbox.conf':new TextEncoder().encode(`[dosbox]\nmemsize=16\n[cpu]\ncore=normal\ncycles=${cycles}\n[mixer]\nrate=22050\n[sblaster]\nsbtype=sb16\n[autoexec]\nmount c .\nc:\nMIX.COM\n`)});
 await page.addInitScript(({bundle})=>{const Native=Worker;window.Worker=class extends Native{postMessage(m:any,t?:any){if(m?.name==='wc-run'){const bytes=new Uint8Array(bundle);m={...m,props:{...m.props,bundles:[bytes]}};t=[bytes.buffer];}super.postMessage(m,t);}};},{bundle:Array.from(bundle)});
 await start(page,{'MIX.COM':program});await expect(page.locator('#logs')).toContainText('MIX_READY');
 const results=[];
 for(const rate of [1,2,1]){if(results.length){await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(rate===2));await expect(page.locator('#speed-toggle')).toBeEnabled();}
  await page.evaluate(()=>{(window as any).audioCapture.blocks=[];});await page.locator('#canvas').focus();await page.keyboard.press('3');await expect.poll(async()=>((await page.locator('#logs').textContent())!.match(/MIX_DONE/g)??[]).length).toBe(results.length+1);await page.waitForTimeout(150);
  results.push({...await page.evaluate(()=>(window as any).audioCapture),rate,diagnostic:await diagnostic(page)});
 }
 await writeFile(info.outputPath('audio-before-analysis.json'),JSON.stringify(results));
 for(const row of results){expect(row.diagnostic.engine.integratedSpeed.fault).toBeNull();expect(row.diagnostic.engine.integratedSpeed.audio.queueAheadMs).toBeLessThan(500);expect(row.diagnostic.engine.integratedSpeed.audio.droppedFrames).toBe(0);expect(row.blocks.every((b:any)=>b.rate===row.rate)).toBe(true);
  (row as any).rendered=await page.evaluate(async({blocks,rate})=>{
   const origin=blocks[0].at,end=Math.max(...blocks.map((b:any)=>b.at-origin+(b.duration-b.offset)/b.rate));
   const ctx=new OfflineAudioContext(1,Math.ceil((end+.1)*48000),48000);
   for(const b of blocks){const node=ctx.createBufferSource(),buffer=ctx.createBuffer(1,b.samples.length,22050);buffer.copyToChannel(new Float32Array(b.samples),0);node.buffer=buffer;node.playbackRate.value=b.rate;node.connect(ctx.destination);node.start(b.at-origin,b.offset);}
   const samples=(await ctx.startRendering()).getChannelData(0),first=samples.findIndex(x=>Math.abs(x)>.01),last=samples.reduce((n,x,i)=>Math.abs(x)>.01?i:n,-1);
   const at=first+Math.floor(.12/rate*48000),window=samples.slice(at,at+Math.floor(.25/rate*48000));
   const amplitude=(hz:number)=>{let a=0,b=0;for(let i=0;i<window.length;i++){a+=window[i]*Math.cos(2*Math.PI*hz*i/48000);b+=window[i]*Math.sin(2*Math.PI*hz*i/48000);}return 2*Math.hypot(a,b)/window.length;};
   return {sampleRate:48000,span:(last-first)/48000,bgmHz:500*rate,seHz:1000*rate,bgmAmplitude:amplitude(500*rate),seAmplitude:amplitude(1000*rate),scheduledEnd:end};
  },{blocks:row.blocks,rate:row.rate});
  expect((row as any).rendered.bgmAmplitude).toBeGreaterThan(.02);expect((row as any).rendered.seAmplitude).toBeGreaterThan(.02);
 }
 expect((results[0] as any).rendered.span/(results[1] as any).rendered.span).toBeGreaterThan(1.7);expect((results[0] as any).rendered.span/(results[1] as any).rendered.span).toBeLessThan(2.3);
 await writeFile(info.outputPath('audio.json'),JSON.stringify(results));await page.locator('#canvas').focus();await page.keyboard.press('q');await stop(page);
});

test('pending taps are blocked; rejected 2x acknowledgment requires actual native 1x recovery',async({page},info)=>{
 await page.addInitScript(()=>{const w=window as any;w.speedRequests=[];const Native=Worker;window.Worker=class extends Native{
  constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(e.data?.name==='ed4-speed-response'&&e.data.props.rate===2){e.data.props.ok=false;e.data.props.error='public test: reject 2x acknowledgment';}});}
  postMessage(m:any,t?:any){if(m?.name==='ed4-speed-request'){w.speedRequests.push(m.props);if(m.props.rate===2){setTimeout(()=>super.postMessage(m,t),250);return;}}super.postMessage(m,t);}
 };});
 await start(page,{'TIMER.COM':timeProbe()});await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toBeDisabled();await expect(page.locator('#speed-limit')).toContainText('1× 복구 확인');
 const d=await diagnostic(page);expect(d.engine.integratedSpeed.rate).toBe(1);expect(d.engine.integratedSpeed.verified).toBe(true);expect(d.engine.integratedSpeed.recoveries).toBe(1);expect(d.engine.integratedSpeed.control.events.some((e:any)=>e.kind==='ack'&&e.rate===1)).toBe(true);
 expect((await page.evaluate(()=>(window as any).speedRequests)).filter((m:any)=>m.rate===2)).toHaveLength(1);await writeFile(info.outputPath('recovery.json'),JSON.stringify(d.engine.integratedSpeed,null,2));await stop(page);
});

test('unresponsive native control does not claim recovery or silently select another engine',async({page},info)=>{
 await page.addInitScript(()=>{const Native=Worker;window.Worker=class extends Native{private silence=false;constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(this.silence&&e.data?.name==='ed4-speed-response')e.stopImmediatePropagation();});}postMessage(m:any,t?:any){if(m?.name==='ed4-speed-request'&&m.props.rate===2)this.silence=true;super.postMessage(m,t);}};});
 await start(page,{'TIMER.COM':timeProbe()});await page.locator('#speed-toggle').click();await menu(page);await expect(page.locator('#speed-limit')).toContainText('복구 확인 실패',{timeout:15000});const d=await diagnostic(page);
 expect(d.engine.artifact.id).toBe('phase9-8h');expect(d.engine.integratedSpeed.verified).toBe(false);expect(d.engine.integratedSpeed.fault).toContain('중단');await expect(page.locator('#speed-toggle')).toBeDisabled();await writeFile(info.outputPath('failed-recovery.json'),JSON.stringify(d.engine.integratedSpeed,null,2));await stop(page);
});

test('H sustained 2x audio queue, pause/resume and 1x return retain all pending samples',async({page},info)=>{
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8g-mix-probe.b64','utf8')).trim(),'base64');await start(page,{'MIX.COM':program});await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');
 const began=Date.now();let count=0;while(Date.now()-began<20000){await page.locator('#canvas').focus();await page.keyboard.press('3');await expect.poll(async()=>((await page.locator('#logs').textContent())!.match(/MIX_DONE/g)??[]).length).toBe(++count);}
 await menu(page);await page.locator('#pause').click();await expect(page.locator('#run-state')).toHaveText('일시 정지');await expect(page.locator('#speed-toggle')).toBeDisabled();await page.waitForTimeout(1200);await page.locator('#pause').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await page.locator('#player-menu').click();await expect(page.locator('#speed-toggle')).toBeEnabled();
 await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');await page.waitForTimeout(1500);const d=await diagnostic(page);
 expect(d.engine.integratedSpeed.fault).toBeNull();expect(d.engine.integratedSpeed.audio.droppedFrames).toBe(0);expect(d.engine.integratedSpeed.audio.overlaps).toBe(0);expect(d.engine.integratedSpeed.audio.queueAheadMs).toBeLessThan(200);expect(d.engine.integratedSpeed.control.last.audioClamps).toBe(0);expect(d.engine.integratedSpeed.control.last.audioUnderflows).toBe(0);await writeFile(info.outputPath('sustained.json'),JSON.stringify({seconds:(Date.now()-began)/1000,count,engine:d.engine},null,2));await stop(page);
});

// The earlier max-saturation tone experiment failed duration/queue stability.
// Keep max enabled only while the actual native/host stream remains healthy.
test('cycles max stress either sustains confirmed 2x or explicitly recovers native 1x on first audio starvation',async({page},info)=>{
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8g-mix-probe.b64','utf8')).trim(),'base64');
 const bundle=zipSync({'MIX.COM':program,'.jsdos/dosbox.conf':new TextEncoder().encode('[dosbox]\nmemsize=16\n[cpu]\ncore=normal\ncycles=max\n[mixer]\nrate=22050\n[sblaster]\nsbtype=sb16\n[autoexec]\nmount c .\nc:\nMIX.COM\n')});
 await page.addInitScript(({bundle})=>{const Native=Worker;window.Worker=class extends Native{postMessage(m:any,t?:any){if(m?.name==='wc-run'){const bytes=new Uint8Array(bundle);m={...m,props:{...m.props,bundles:[bytes]}};t=[bytes.buffer];}super.postMessage(m,t);}};},{bundle:Array.from(bundle)});
 await start(page,{'MIX.COM':program});await expect(page.locator('#logs')).toContainText('MIX_READY');const before=await diagnostic(page);
 await page.locator('#speed-toggle').click();await expect.poll(async()=>{const s=await page.locator('#speed-limit').textContent();return s?.includes('전체 2×')||s?.includes('1× 복구 확인');}).toBe(true);
 for(let i=1;i<=4;i++){await page.locator('#canvas').focus();await page.keyboard.press('3');await expect.poll(async()=>((await page.locator('#logs').textContent())!.match(/MIX_DONE/g)??[]).length).toBe(i);}
 const d=await diagnostic(page),s=d.engine.integratedSpeed;expect(d.engine.artifact.id).toBe('phase9-8h');expect(s.audio.droppedFrames).toBe(0);expect(s.audio.overlaps).toBe(0);
 if(s.fault){expect(s.fault).toContain('1× 복구 확인');expect(s.fault).not.toContain('실패');expect(s.rate).toBe(1);expect(s.verified).toBe(true);expect(s.control.events.some((e:any)=>e.kind==='ack'&&e.rate===2)).toBe(true);expect(s.control.events.some((e:any)=>e.kind==='ack'&&e.rate===1)).toBe(true);await expect(page.locator('#speed-toggle')).toBeDisabled();}
 else {expect(s.rate).toBe(2);expect(s.verified).toBe(true);expect(s.audio.audibleUnderruns).toBe(before.engine.integratedSpeed.audio.audibleUnderruns);}
 await writeFile(info.outputPath('max-stress.json'),JSON.stringify({before:before.engine.integratedSpeed,after:s},null,2));await stop(page);
});

test('audible 2x starvation from a bounded main-thread stall restores real native 1x and preserves audio',async({page},info)=>{
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8g-mix-probe.b64','utf8')).trim(),'base64');await start(page,{'MIX.COM':program});await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await page.locator('#canvas').focus();await page.keyboard.press('3');await page.waitForTimeout(120);
 await page.evaluate(()=>{const end=performance.now()+220;while(performance.now()<end){/* public-test-only consumer starvation */}});
 await menu(page);await expect(page.locator('#speed-limit')).toContainText('1× 복구 확인');const d=await diagnostic(page),s=d.engine.integratedSpeed;
 expect(s.fault).toContain('오디오 공급 지연');expect(s.fault).not.toContain('실패');expect(s.rate).toBe(1);expect(s.verified).toBe(true);expect(s.audio.audibleUnderruns).toBeGreaterThan(0);expect(s.audio.droppedFrames).toBe(0);expect(s.audio.overlaps).toBe(0);await expect(page.locator('#speed-toggle')).toBeDisabled();
 await writeFile(info.outputPath('audio-recovery.json'),JSON.stringify(s,null,2));await stop(page);
});
