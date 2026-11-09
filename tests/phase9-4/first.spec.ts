// CC0 synthetic COMs only. No commercial files or persistent browser profile.
import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {probes,loader,returning,mz} from '../../scripts/phase9-4-probes.mjs';
import {firstHistory} from '../../src/first-anomaly';
type Variant='baseline'|'first-trace';
async function setup(page:Page,variant:Variant,code?:number[]){
 const dir=variant==='baseline'?'artifacts/phase9-3/engines/instrumented':'artifacts/phase9-4/engines/instrumented';
 const wasm=await readFile(`${dir}/wdosbox.wasm`),js=await readFile(`${dir}/wdosbox.js`);
 await page.route('**/vendor/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:wasm}));
 await page.route('**/vendor/wdosbox.js',r=>r.fulfill({contentType:'text/javascript',body:js}));
 if(code)await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':new Uint8Array(loader()),'ED4.EXE':new Uint8Array(code)}))}));
 await page.addInitScript(()=>{
  const records:any[]=[];(window as any).__rebootWorkers=records;const Native=window.Worker;
  window.Worker=class extends Native{
   record:any;
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.record={url:String(url),events:[],histories:[],messages:[],terminated:false};records.push(this.record);
    this.addEventListener('message',e=>{if(e.data?.name==='ed4-cpu-history'){this.record.histories.push(e.data.props);e.stopImmediatePropagation();}else if(e.data?.name==='ed4-reboot-event'){this.record.events.push(e.data.props);e.stopImmediatePropagation();}else if(!this.record.messages.includes(e.data?.name))this.record.messages.push(e.data?.name);});
   }
   terminate(){this.record.terminated=true;super.terminate();}
  };
 });
 page.on('dialog',d=>void d.accept());
 await page.goto('/porting-pj/ed4/');await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);
 await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();
 return {variant,wasmSha256:createHash('sha256').update(wasm).digest('hex')};
}
async function diagnostics(page:Page){const wait=page.waitForEvent('download');await page.locator('#run-diagnostics').click();return JSON.parse(await readFile((await(await wait).path())!,'utf8'));}
async function observation(page:Page){return page.evaluate(()=>(window as any).__rebootWorkers.find((w:any)=>w.url.includes('dos-worker.js')));}
for(const variant of ['baseline','first-trace'] as const)for(const p of probes)test(`${variant} ${p.name}`,async({page},info)=>{
 const engine=await setup(page,variant,p.mz?mz(p.code):p.code);await expect(page.locator('#logs')).toContainText('Aborted',{timeout:20000});
 const data=await diagnostics(page),worker=await observation(page);await writeFile(info.outputPath('result.json'),JSON.stringify({engine,worker,diagnostics:data},null,2));
 expect(data.engine.runtimeErrors.events.some((e:any)=>/null function/.test(e.message))).toBe(false);
 expect(data.engine.runtimeErrors.events.some((e:any)=>e.source==='emscripten-abort')).toBe(true);
 expect(worker.histories).toHaveLength(1);
 if(variant==='first-trace'){
  const h=worker.histories[0];expect(h.version).toBe(2);expect(h.storageBytes).toBe(100588);expect(h.records).toHaveLength(128);
  expect(h.first.armed).toBe(true);expect(h.first.targetEntry.program).toBe('ED4.EXE');expect(h.first.targetEntry.observed).toBe(true);
  const parsed=firstHistory(h);expect(parsed).toBeDefined();const anchors=h.first.anchors,by=(id:number)=>anchors.find((a:any)=>a.type===id);
  expect(by(0).event.before.ip).toBe(p.mz?0:256);expect(by(0).after).toHaveLength(16);
  expect(by(0).event.sequence).toBeLessThan(h.records[0].sequence); // first event survived overwrite
  for(const a of anchors){expect(a.before.length).toBeLessThanOrEqual(24);expect(a.after.length).toBeLessThanOrEqual(16);expect(a.occurrences).toBeGreaterThan(0);expect(a.event.before.sp).toBe(a.event.before.esp&65535);}
  expect(parsed!.first.anchors.every(a=>a.assessment!=='error')).toBe(true);
  if(['far-call','far-jmp','retf','iret'].includes(p.name)){
   const expected=({'far-call':9,'far-jmp':1,retf:3,iret:4} as Record<string,number>)[p.name];expect(by(7).event.kind).toBe(expected);expect(by(7).continuity).toBe(1);expect(by(7).fetchConfirmed).toBe(true);expect(by(5)).toBeUndefined();
  }
  if(p.name==='bios-int10'){expect(by(3).event.interruptNumber).toBe(16);expect(by(3).event.sequence).toBeLessThan(by(4).event.sequence);expect(by(3).fetchConfirmed).toBe(true);expect(by(5)).toBeUndefined();}
  if(p.name==='eip-boundary'){expect(by(2).event.before.ip).toBe(65535);expect(by(2).event.after.ip).toBe(65536);expect(by(2).event.after.ip16).toBe(0);expect(by(2).event.before.codeBig).toBe(false);expect(by(2).event.sequence).toBeLessThan(by(1).event.sequence);}
  if(p.name==='mode-roundtrip'){expect(by(6).event.before.mode).toBe(0);expect(by(6).event.after.mode).toBe(1);expect(by(6).occurrences).toBe(2);expect(by(6).after.some((r:any)=>r.before.mode===1&&r.after.mode===0)).toBe(true);}
  if(p.name==='ffff-corridor'){
   expect(by(1).event.after).toMatchObject({cs:65535,ip:0xfff0,codeBig:false,a20:true});expect(by(1).after).toHaveLength(16);expect(by(1).before).toHaveLength(24);
   expect(by(2).event.before.ip).toBe(0xffff);expect(by(2).event.after.ip).toBe(0x10000);expect(by(1).event.sequence).toBeLessThan(by(2).event.sequence);
   expect(by(2).event.sequence).toBeLessThan(h.records[0].sequence);expect(by(2).after).toHaveLength(16);
   expect(h.records.at(-1)).toMatchObject({kind:9,before:{cs:65535,ip:0x1101d},after:{cs:65535,ip:0}});
   expect(by(4).event.sequence).toBe(h.records.at(-1).sequence);expect(by(4).after).toEqual([]);expect(by(4).fetchConfirmed).toBe(true);
   expect(by(0).after.some((r:any)=>r.addressBits===32)).toBe(true);
  }
 }
 await page.locator('#stop').click();await expect.poll(async()=>(await observation(page)).terminated).toBe(true);
});
for(const variant of ['baseline','first-trace'] as const){
 test(`${variant} target returns and DOS shell exits`,async({page},info)=>{
  const engine=await setup(page,variant,returning);await expect(page.locator('#logs')).toContainText('TARGET_RETURN_OK');await page.locator('#canvas').focus();await page.keyboard.type('exit');await page.keyboard.press('Enter');
  await expect.poll(async()=>(await observation(page)).messages.includes('ws-exit')).toBe(true);const data=await diagnostics(page),worker=await observation(page);expect(data.engine.runtimeErrors.events).toEqual([]);expect(worker.histories).toEqual([]);await writeFile(info.outputPath('result.json'),JSON.stringify({engine,worker,data},null,2));
 });
 test(`${variant} ordinary DOS keyboard screen and stop`,async({page},info)=>{
  const engine=await setup(page,variant);await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('ArrowUp');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');const data=await diagnostics(page);expect(data.engine.frames).toBeGreaterThan(0);expect(data.engine.runtimeErrors.events).toEqual([]);await page.locator('#stop').click();await expect.poll(async()=>(await observation(page)).terminated).toBe(true);const worker=await observation(page);expect(worker.histories).toEqual([]);await writeFile(info.outputPath('result.json'),JSON.stringify({engine,worker,data},null,2));
 });
}
