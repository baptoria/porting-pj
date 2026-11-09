import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
// Route the fault fixture from the network; a cached production Worker would
// bypass Playwright interception. Existing offline suites keep SW enabled.
test.use({serviceWorkers:'block'});
const app='/porting-pj/ed4/',text=(s:string)=>new TextEncoder().encode(s);
async function register(page:Page){
 page.on('dialog',d=>void d.accept());await page.goto(app);await expect(page.locator('#simple-import')).toBeVisible();
 const files={...unzipSync(new Uint8Array(await readFile('public/test-program.zip'))),'GAME.BAT':text('@SOUNDRV.COM > NUL\r\nED4TEST.COM'),
  'NOSOUND.BAT':text('@ECHO OFF\r\nED4TEST.COM'),'SOUNDRV.COM':new Uint8Array([0xb8,0,0x4c,0xcd,0x21]),'ED4-01.RAW':text('RAWTEST1\0\0\0\0')};
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-runtime.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('GAME.BAT');await page.locator('#simple-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
}
async function choose(page:Page,mode='baseline'){
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await page.locator('#boot-comparison').selectOption(mode);await expect(page.locator('#boot-start')).toBeEnabled();await page.locator('#boot-start').click();
}
async function report(page:Page){const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();return JSON.parse(await readFile((await(await pending).path())!,'utf8'));}
async function snapshot(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('ed4-mobile-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const output:any={};for(const name of ['archives','profiles','saves'])output[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();
 return JSON.stringify(output,(_,v)=>v instanceof Uint8Array?Array.from(v):v);
});}
// Standalone authored WASM fixture: call_indirect into an uninitialized table.
// It is injected ONLY into routed test responses, never into the deployed engine.
const trap=`const testTrap=new WebAssembly.Instance(new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,4,4,1,112,0,1,7,9,1,5,99,114,97,115,104,0,0,10,9,1,7,0,65,0,17,0,0,11])));`;
for(const kind of ['error','unhandledrejection'] as const)test(`captures real WASM ${kind} stack after startup and retains it after diagnostic stop`,async({page},info)=>{
 await page.addInitScript(()=>{const Native=Worker;(window as any).testWorkers=[];window.Worker=class extends Native{constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).endsWith('dos-worker.js'))(window as any).testWorkers.push(this);}};});
 await page.route('**/dos-worker.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+`\n${trap}\nself.addEventListener('message',e=>{if(e.data?.name==='test-phase7-trap'){${kind==='error'?'testTrap.exports.crash();':'Promise.resolve().then(()=>testTrap.exports.crash());'}}});`});});
 await register(page);const before=await snapshot(page);await choose(page);await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 await page.evaluate(()=>(window as any).testWorkers.at(-1).postMessage({name:'test-phase7-trap'}));await expect(page.locator('#logs')).toContainText('null function');
 const data=await report(page),events=data.engine.runtimeErrors.events;
 const event=events.find((e:any)=>e.source===(kind==='error'?'worker-error':kind));expect(event.stackAvailable).toBe(true);expect(event.name).toBe('RuntimeError');expect(event.stack).toContain('wasm-function[0]');expect(event.wasmLocations[0].functionIndex).toBe(0);
 if(kind==='error'){expect(event.lineno).toBeGreaterThan(0);expect(event.colno).toBeGreaterThan(0);expect(event.filename).toMatch(/^wasm:\/\/wasm\//);}
 expect(event.stack).toContain('dos-worker.js:');
 expect(event.stage).toBe('running');expect(event.musicMounted).toBe(1);expect(event.wasmHeapBytes).toBeGreaterThan(0);
 expect(data.engine.execution.latestRequest.program).toContain('ED4TEST.COM');expect(data.diagnosticRevision).toBe('phase7-runtime-1');
 await writeFile(info.outputPath('wasm-error.json'),JSON.stringify(data,null,2));await page.locator('#stop').click();await expect(page.locator('body')).not.toHaveClass(/busy/);expect(await snapshot(page)).toBe(before);
 expect((await report(page)).engine.runtimeErrors.events).toEqual(events);
});
test('startup exception keeps stack after Worker cleanup',async({page})=>{
 await page.route('**/dos-worker.js',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+`\n${trap}\nWDOSBOX=function(){testTrap.exports.crash();};`});});
 await register(page);const before=await snapshot(page);await choose(page);await expect(page.locator('#run-state')).toHaveText('시작 실패');
 const data=await report(page);expect(data.engine.runtimeErrors.events.some((e:any)=>e.stackAvailable&&e.wasmLocations.length)).toBe(true);expect(await snapshot(page)).toBe(before);
});
test('baseline, NOSOUND-only and RAW-only comparisons preserve profile, saves and OPFS music',async({page},info)=>{
 await register(page);await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await page.locator('#stop').click();await expect(page.locator('body')).not.toHaveClass(/busy/);
 const before=await snapshot(page),results=[];
 for(const mode of ['baseline','nosound','no-raw']){
  await choose(page,mode);await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText(mode==='no-raw'?'NO SAVE FILE':'RAWTEST1 RAW READ AND SEEK OK');
  const data=await report(page);expect(data.bootSettings.comparison.cycles).toBe(data.bootSettings.original.cycles);expect(data.bootSettings.comparison.memory).toBe(data.bootSettings.original.memory);expect(data.bootSettings.comparison.sound).toBe('sb16');
  expect(data.bootSettings.runtimeComparison).toMatchObject({mode,entry:mode==='nosound'?'NOSOUND.BAT':'GAME.BAT',mountedFiles:mode==='no-raw'?0:1});
  expect(data.engine.music.mounted).toBe(mode==='no-raw'?0:1);expect(data.engine.runtimeErrors.events).toEqual([]);results.push(data.bootSettings);
  await page.locator('#canvas').focus();await page.keyboard.press('d');await expect(page.locator('#logs')).toContainText('SAVE DELETED');await page.locator('#stop').click();await expect(page.locator('body')).not.toHaveClass(/busy/);expect(await snapshot(page)).toBe(before);
 }
 await writeFile(info.outputPath('comparisons.json'),JSON.stringify(results,null,2));
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');await page.locator('#stop').click();
});
