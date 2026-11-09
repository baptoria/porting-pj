// CC0 synthetic COMs only. No commercial files or persistent browser profile.
import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
type Variant='baseline'|'cpu-trace';
async function setup(page:Page,variant:Variant,code?:number[]){
 const dir=variant==='baseline'?'artifacts/phase9-2/engines/instrumented':'artifacts/phase9-3/engines/instrumented';
 const wasm=await readFile(`${dir}/wdosbox.wasm`),js=await readFile(`${dir}/wdosbox.js`);
 await page.route('**/vendor/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:wasm}));
 await page.route('**/vendor/wdosbox.js',r=>r.fulfill({contentType:'text/javascript',body:js}));
 if(code)await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':new Uint8Array(code)}))}));
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
const probes=[
 {name:'far-jmp',route:3,kind:1,ip:0x100,code:[0xea,0,0,255,255]},
 {name:'retf',route:3,kind:3,ip:0x106,code:[0x68,255,255,0x68,0,0,0xcb]},
 {name:'iret',route:3,kind:4,ip:0x107,code:[0x9c,0x68,255,255,0x68,0,0,0xcf]},
 {name:'indirect-far-jmp',route:3,kind:2,ip:0x100,code:[0xff,0x2e,4,1,0,0,255,255]},
 {name:'ring-wrap',route:3,kind:1,ip:0x200,code:[...Array(256).fill(0x90),0xea,0,0,255,255]},
 {name:'int18',route:1,kind:5,ip:0x100,code:[0xcd,0x18]},
 {name:'int19',route:2,kind:5,ip:0x100,code:[0xcd,0x19]},
 {name:'redirected-int60',route:3,kind:5,ip:0x10e,code:[0x1e,0xb8,255,255,0x8e,0xd8,0x31,0xd2,0xb8,0x60,0x25,0xcd,0x21,0x1f,0xcd,0x60]},
 {name:'divide-exception',route:3,kind:0,ip:0x110,code:[0x1e,0xb8,255,255,0x8e,0xd8,0x31,0xd2,0xb8,0,0x25,0xcd,0x21,0x1f,0x31,0xc0,0xf6,0xf0]},
 {name:'protected-real-transition',route:3,kind:1,ip:0x10e,code:[0xfa,0x0f,0x20,0xc0,0x0c,1,0x0f,0x22,0xc0,0x24,0xfe,0x0f,0x22,0xc0,0xea,0,0,255,255]},
];
for(const variant of ['baseline','cpu-trace'] as const)for(const p of probes)test(`${variant} ${p.name}`,async({page},info)=>{
 const code=[...p.code];if(p.name==='indirect-far-jmp')code[3]=2;
 const start=Date.now(),engine=await setup(page,variant,[...Array(256).fill(0x90),...code]);
 await expect(page.locator('#logs')).toContainText('Aborted',{timeout:20000});
 const data=await diagnostics(page),worker=await observation(page);
 await writeFile(info.outputPath('result.json'),JSON.stringify({engine,worker,diagnostics:data,wallMs:Date.now()-start},null,2));
 expect(data.engine.runtimeErrors.events.some((e:any)=>/null function/.test(e.message))).toBe(false);
 expect(data.engine.runtimeErrors.events.some((e:any)=>e.source==='emscripten-abort')).toBe(true);
 expect(worker.events.find((e:any)=>e.kind===4).route).toBe(p.route);
 expect(worker.messages).not.toContain('ws-exit');
 if(variant==='cpu-trace'){
  expect(worker.histories).toHaveLength(1);const h=worker.histories[0];
  expect(h.capacity).toBe(128);expect(h.records).toHaveLength(128);expect(h.storageBytes).toBe(17240);
  expect(h.overwritten).toBeGreaterThan(0);expect(h.records.every((r:any)=>r.complete)).toBe(true);
  expect(h.records.map((r:any)=>r.sequence)).toEqual([...new Set(h.records.map((r:any)=>r.sequence))].sort((a:any,b:any)=>a-b));
  const entry=h.execEntries.find((e:any)=>e.program==='ED4TEST.COM');
  expect(entry.result).toBe(1);expect(entry.observed).toBe(true);expect(entry.firstInstruction.before.ip).toBe(0x100);
  const transfer=[...h.records].reverse().find((r:any)=>r.source===1&&r.before.cs===entry.cs&&r.before.ip===p.ip+256);
  expect(transfer?.kind).toBe(p.kind);expect(transfer.before.psp).toBe(entry.psp);
  if(p.name==='redirected-int60')expect(transfer.interruptNumber).toBe(0x60);
  if(p.name==='divide-exception'){expect(transfer.interruptNumber).toBe(0);expect(transfer.interruptType&2).toBe(2);}
  if(p.name==='protected-real-transition'){
   expect(h.records.some((r:any)=>r.before.mode===0&&r.after.mode===1&&(r.apiMask&16))).toBe(true);
   expect(h.records.some((r:any)=>r.before.mode===1&&r.after.mode===0&&(r.apiMask&16))).toBe(true);
  }
  if(p.route===3){expect(h.reason).toBe(1);expect(transfer.after).toMatchObject({cs:65535,ip:0,linear:0xffff0,mode:0});expect(h.records.at(-1)).toEqual(transfer);expect(h.trigger).toMatchObject({cs:65535,ip:0,linear:0xffff0});}
  else {expect(h.reason).toBe(2);expect(transfer.interruptNumber).toBe(p.route===1?24:25);}
  expect(JSON.stringify(h)).not.toMatch(/opcodeBytes|heapDump|SAVE\.DAT|RAWTEST1/);
 }else expect(worker.histories).toHaveLength(0);
 await page.locator('#stop').click();await expect.poll(async()=>(await observation(page)).terminated).toBe(true);
});
for(const variant of ['baseline','cpu-trace'] as const){
 test(`${variant} keyboard screen stop`,async({page},info)=>{
  const engine=await setup(page,variant);await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
  await page.keyboard.press('ArrowUp');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');
  const data=await diagnostics(page);expect(data.engine.frames).toBeGreaterThan(0);expect(data.engine.runtimeErrors.events).toEqual([]);
  const pixels=await page.locator('#canvas').evaluate(el=>{const c=el as HTMLCanvasElement,p=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;return p.filter((v,i)=>i%4!==3&&v>0).length;});expect(pixels).toBeGreaterThan(100);
  await page.locator('#stop').click();await expect.poll(async()=>(await observation(page)).terminated).toBe(true);
  const worker=await observation(page);expect(worker.histories).toEqual([]);await writeFile(info.outputPath('result.json'),JSON.stringify({engine,data,worker,pixels},null,2));
 });
 test(`${variant} DOS return shell exit`,async({page},info)=>{
  const engine=await setup(page,variant,[0xba,0x0c,1,0xb4,9,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21,...Buffer.from('PUBLIC_RETURN_OK\r\n$')]);
  await expect(page.locator('#logs')).toContainText('PUBLIC_RETURN_OK');await page.locator('#canvas').focus();await page.keyboard.type('exit');await page.keyboard.press('Enter');
  await expect.poll(async()=>(await observation(page)).messages.includes('ws-exit')).toBe(true);
  const data=await diagnostics(page),worker=await observation(page);expect(data.engine.runtimeErrors.events).toEqual([]);expect(worker.histories).toEqual([]);
  await writeFile(info.outputPath('result.json'),JSON.stringify({engine,data,worker},null,2));
 });
}
