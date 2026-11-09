// CC0 DOS fixtures from Phase 8. Only isolated Playwright contexts; no game data.
import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
type Variant='published'|'baseline'|'fixed';
const variants:Variant[]=['published','baseline','fixed'];
async function setup(page:Page,variant:Variant){
 const dir=variant==='published'?'docs/ed4/vendor':`artifacts/phase9-1/engines/${variant}`;
 const wasm=await readFile(`${dir}/wdosbox.wasm`),js=await readFile(`${dir}/wdosbox.js`);
 await page.route('**/vendor/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:wasm}));
 await page.route('**/vendor/wdosbox.js',r=>r.fulfill({contentType:'text/javascript',body:js}));
 // Observe protocol/parent termination only; never modify Worker execution.
 await page.addInitScript(()=>{
  const records:any[]=[];(window as any).__phase9Workers=records;
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{
   record:any;
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.record={url:String(url),messages:[],errors:[],terminated:false};records.push(this.record);
    this.addEventListener('message',e=>{if(!this.record.messages.includes(e.data?.name))this.record.messages.push(e.data?.name);});
    this.addEventListener('error',e=>this.record.errors.push(e.message));
   }
   terminate(){this.record.terminated=true;super.terminate();}
  };
 });
 page.on('dialog',d=>void d.accept());
 return {variant,wasmSha256:createHash('sha256').update(wasm).digest('hex'),jsSha256:createHash('sha256').update(js).digest('hex')};
}
async function start(page:Page){
 await page.goto('/porting-pj/ed4/');await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);
 await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();
}
async function diagnostics(page:Page){const wait=page.waitForEvent('download');await page.locator('#run-diagnostics').click();return JSON.parse(await readFile((await(await wait).path())!,'utf8'));}
for(const variant of variants)for(const [name,bytes]of [
 ['int18',[0xcd,0x18]],['int19',[0xcd,0x19]],['reset-vector',[0xea,0xf0,0xff,0,0xf0]],
] as const)test(`${variant} ${name}`,async({page},info)=>{
 const engine=await setup(page,variant);
 await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':new Uint8Array([...bytes,0xb8,0,0x4c,0xcd,0x21])}))}));
 await start(page);
 await expect(page.locator('#logs')).toContainText(/DOS Worker 오류/,{timeout:20000});
 const data=await diagnostics(page),events=data.engine.runtimeErrors.events;
 const beforeCleanup=await page.evaluate(()=>(window as any).__phase9Workers);
 const worker=page.workers().find(w=>w.url().endsWith('/dos-worker.js'));
 const workerAfterError=worker?await worker.evaluate('({responsive:true, stage:runtimeStage})').catch(e=>({responsive:false,error:String(e)})):{responsive:false,closed:true};
 await page.screenshot({path:info.outputPath('screen.png')});
 // Preserve all observed errors, including expected abort, before assertions.
 await writeFile(info.outputPath('result.json'),JSON.stringify({engine,diagnosticArtifactWarning:'Launcher artifact label is pinned; actual served hashes are recorded in engine above.',diagnostics:data,beforeCleanup,workerAfterError},null,2));
 console.log(variant,name,events.map((e:any)=>({source:e.source,message:e.message,wasmLocations:e.wasmLocations})),beforeCleanup);
 if(variant==='fixed'){
  expect(events.some((e:any)=>/null function/.test(e.message))).toBe(false);
  // INT 10h draws directly to the BIOS screen, not DOS stdout. Screenshots
  // retain the notice; the fixed binary's exact final abort call proves that
  // the handler completed its text output and three-second idle loop.
  expect(engine.wasmSha256).toBe('5c0378dd9f34df6ac263505a12b88650d1dfc8df5bfea921cd4aafb9e676ac10');
  const abortEvent=events.find((e:any)=>e.source==='worker-error'&&e.name==='RuntimeError');
  expect(abortEvent.wasmLocations[0]).toEqual({functionIndex:2613,offset:'0xf6d21'});
  expect(abortEvent.stack).toContain('at _abort');
  expect(data.engine.frames).toBeGreaterThan(0);
  expect(events.some((e:any)=>e.source==='emscripten-abort')).toBe(true);
  // The unchanged upstream Reboot_Handler explicitly calls abort(), NOT exit(0).
  expect(events.some((e:any)=>e.name==='RuntimeError'&&/Aborted/.test(e.message))).toBe(true);
  expect(events.filter((e:any)=>e.name==='RuntimeError').every((e:any)=>/Aborted/.test(e.message))).toBe(true);
 }else{
  const failure=events.find((e:any)=>e.message==='null function');expect(failure).toBeTruthy();
  if(variant==='published')expect(failure.wasmLocations[0]).toEqual({functionIndex:481,offset:'0x14405'});
 }
});
for(const variant of variants)test(`${variant} DOS shell exit handshake`,async({page},info)=>{
 const engine=await setup(page,variant);
 const code=new Uint8Array([0xba,0x0c,0x01,0xb4,0x09,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21,...Buffer.from('PUBLIC_RETURN_OK\r\n$')]);
 await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':code}))}));
 await start(page);await expect(page.locator('#logs')).toContainText('PUBLIC_RETURN_OK');
 await page.locator('#canvas').focus();await page.keyboard.type('exit');await page.keyboard.press('Enter');
 await expect.poll(async()=>page.evaluate(()=>(window as any).__phase9Workers.find((w:any)=>w.url.includes('dos-worker.js')).messages.includes('ws-exit'))).toBe(true);
 const workers=await page.evaluate(()=>(window as any).__phase9Workers),data=await diagnostics(page);
 await writeFile(info.outputPath('result.json'),JSON.stringify({engine,diagnostics:data,workers},null,2));
 expect(data.engine.runtimeErrors.events).toEqual([]);
});
for(const variant of variants)test(`${variant} public DOS keyboard screen and launcher stop`,async({page},info)=>{
 const engine=await setup(page,variant);await start(page);
 await expect(page.locator('#run-state')).toHaveText('실행 중');await page.keyboard.press('ArrowUp');
 await expect(page.locator('#logs')).toContainText('KEY RECEIVED');
 const data=await diagnostics(page);expect(data.engine.frames).toBeGreaterThan(0);expect(data.engine.runtimeErrors.events).toEqual([]);
 const nonBlackPixels=await page.locator('#canvas').evaluate(el=>{const c=el as HTMLCanvasElement,p=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]||p[i+1]||p[i+2])n++;return n;});expect(nonBlackPixels).toBeGreaterThan(100);
 await page.screenshot({path:info.outputPath('screen.png')});
 await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 const workers=await page.evaluate(()=>(window as any).__phase9Workers);
 expect(workers.find((w:any)=>w.url.includes('dos-worker.js')).terminated).toBe(true);
 await writeFile(info.outputPath('result.json'),JSON.stringify({engine,diagnostics:data,workers,nonBlackPixels,afterStopLogs:await page.locator('#logs').innerText()},null,2));
});
