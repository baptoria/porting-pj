// CC0 synthetic COMs only. No commercial files or persistent browser profile.
import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
type Variant='fixed'|'instrumented';
async function setup(page:Page,variant:Variant,code?:number[]){
 const dir=variant==='fixed'?'artifacts/phase9-1/engines/fixed':'artifacts/phase9-2/engines/instrumented';
 const wasm=await readFile(`${dir}/wdosbox.wasm`),js=await readFile(`${dir}/wdosbox.js`);
 await page.route('**/vendor/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:wasm}));
 await page.route('**/vendor/wdosbox.js',r=>r.fulfill({contentType:'text/javascript',body:js}));
 if(code)await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':new Uint8Array(code)}))}));
 await page.addInitScript(()=>{
  const records:any[]=[];(window as any).__rebootWorkers=records;const Native=window.Worker;
  window.Worker=class extends Native{
   record:any;
   constructor(url:string|URL,options?:WorkerOptions){super(url,options);this.record={url:String(url),events:[],messages:[],terminated:false};records.push(this.record);
    this.addEventListener('message',e=>{if(e.data?.name==='ed4-reboot-event'){this.record.events.push(e.data.props);e.stopImmediatePropagation();}else if(!this.record.messages.includes(e.data?.name))this.record.messages.push(e.data?.name);});
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
for(const variant of ['fixed','instrumented'] as const)for(const [name,route,code]of [
 ['int18',1,[0xcd,0x18]],['int19',2,[0xcd,0x19]],['reset-vector',3,[0xea,0xf0,0xff,0,0xf0]],
] as const)test(`${variant} ${name}`,async({page},info)=>{
 const engine=await setup(page,variant,[...code,0xb8,0,0x4c,0xcd,0x21]);
 await expect(page.locator('#logs')).toContainText('Aborted',{timeout:20000});
 const data=await diagnostics(page),worker=await observation(page);
 await writeFile(info.outputPath('result.json'),JSON.stringify({engine,worker,diagnostics:data},null,2));await page.screenshot({path:info.outputPath('screen.png')});
 expect(data.engine.runtimeErrors.events.some((e:any)=>/null function/.test(e.message))).toBe(false);
 expect(data.engine.runtimeErrors.events.filter((e:any)=>e.name==='RuntimeError').every((e:any)=>/Aborted/.test(e.message))).toBe(true);
 expect(data.engine.runtimeErrors.events.some((e:any)=>e.source==='emscripten-abort')).toBe(true);
 expect(worker.messages).not.toContain('ws-exit'); // Intentional abort is not a clean exit.
 if(variant==='instrumented'){
  const events=worker.events,boot=events.filter((e:any)=>e.kind===4);expect(boot).toHaveLength(1);
  expect(boot[0].route).toBe(route);const origin=events.find((e:any)=>e.sequence===boot[0].originSequence);
  expect(origin.kind).toBe(route===3?2:1);expect(origin.cs).toBe(origin.psp);expect(origin.ss).toBe(origin.psp);
  expect(origin.flags&0x200).toBe(0x200);expect(origin.protectedMode).toBe(false);expect(origin.cr0&1).toBe(0);
  if(route!==3){expect(origin.extra&1).toBe(1);expect(boot[0].flags&0x200).toBe(0);} // software INT, IF cleared AFTER transfer
  expect(boot[0].cs).not.toBe(origin.cs);expect(boot[0].program).toBe('ED4TEST.COM');expect(boot[0].execResult).toBe(1);expect(boot[0].errorCode).toBe(-1);
  expect(events.filter((e:any)=>e.kind===5)).toHaveLength(1);
  expect(events.map((e:any)=>e.sequence)).toEqual([...new Set(events.map((e:any)=>e.sequence))].sort((a:any,b:any)=>a-b));
 }else expect(worker.events).toEqual([]);
 await page.locator('#stop').click();await expect.poll(async()=>(await observation(page)).terminated).toBe(true);
});
for(const variant of ['fixed','instrumented'] as const)test(`${variant} keyboard screen and launcher stop`,async({page},info)=>{
 const engine=await setup(page,variant);await expect(page.locator('#run-state')).toHaveText('실행 중');
 await page.keyboard.press('ArrowUp');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');
 const data=await diagnostics(page);expect(data.engine.frames).toBeGreaterThan(0);expect(data.engine.runtimeErrors.events).toEqual([]);
 const pixels=await page.locator('#canvas').evaluate(el=>{const c=el as HTMLCanvasElement,p=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]||p[i+1]||p[i+2])n++;return n;});expect(pixels).toBeGreaterThan(100);
 await page.locator('#stop').click();await expect.poll(async()=>(await observation(page)).terminated).toBe(true);
 await writeFile(info.outputPath('result.json'),JSON.stringify({engine,data,pixels,worker:await observation(page)},null,2));
});
for(const variant of ['fixed','instrumented'] as const)test(`${variant} normal DOS return and shell exit`,async({page},info)=>{
 const engine=await setup(page,variant,[0xba,0x0c,1,0xb4,9,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21,...Buffer.from('PUBLIC_RETURN_OK\r\n$')]);
 await expect(page.locator('#logs')).toContainText('PUBLIC_RETURN_OK');await page.locator('#canvas').focus();await page.keyboard.type('exit');await page.keyboard.press('Enter');
 await expect.poll(async()=>(await observation(page)).messages.includes('ws-exit')).toBe(true);
 const data=await diagnostics(page);expect(data.engine.runtimeErrors.events).toEqual([]);
 await writeFile(info.outputPath('result.json'),JSON.stringify({engine,data,worker:await observation(page)},null,2));
});
// Obtain INT19 vector via DOS, jump directly: entering same handler does not prove INT19.
for(const stale of [false,true])test(`instrumented unknown direct callback${stale?' after redirected INT18':''}`,async({page},info)=>{
 const pre=stale?[0xba,0x14,1,0xb8,0x18,0x25,0xcd,0x21,0xcd,0x18]:[];
 const code=[...pre,0xb8,0x19,0x35,0xcd,0x21,0x06,0x53,0xcb];
 while(code.length<20)code.push(0x90);code.push(0xcf); // custom INT18 IRET at 0114
 const engine=await setup(page,'instrumented',code);await expect(page.locator('#logs')).toContainText('Aborted',{timeout:20000});
 const worker=await observation(page);await writeFile(info.outputPath('result.json'),JSON.stringify({engine,worker},null,2));
 const boot=worker.events.find((e:any)=>e.kind===4);expect(boot.route).toBe(0);expect(boot.originSequence).toBe(0);
 expect(worker.events.some((e:any)=>e.kind===5)).toBe(true);
});
test('instrumented failed EXEC preserves error and caller context',async({page},info)=>{
 // DS:DX=0120 filename, ES:BX=0140 zero parameter block. Failure precedes allocation.
 const code=[0x0e,0x07,0xbb,0x40,1,0xba,0x20,1,0xb8,0,0x4b,0xcd,0x21,0xcd,0x18];
 while(code.length<32)code.push(0);code.push(...Buffer.from('MISSING.COM\0'));while(code.length<80)code.push(0);
 const engine=await setup(page,'instrumented',code);await expect(page.locator('#logs')).toContainText('Aborted',{timeout:20000});
 const worker=await observation(page);await writeFile(info.outputPath('result.json'),JSON.stringify({engine,worker},null,2));
 const request=worker.events.find((e:any)=>e.kind===6&&e.program==='MISSING.COM'),result=worker.events.find((e:any)=>e.kind===7&&e.program==='MISSING.COM');
 expect(result.execResult).toBe(2);expect(result.errorCode).toBe(2);expect(result.psp).toBe(request.psp);
 const boot=worker.events.find((e:any)=>e.kind===4);expect(boot.route).toBe(1);expect(boot.execId).toBe(result.execId);expect(boot.errorCode).toBe(2);
});
