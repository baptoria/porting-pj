import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
const app='/porting-pj/ed4/',hash='a1bd86ba5cc2ca0f17b50bffdd334bea7980171913c1f74689d31e608ef1980b';
const text=(s:string)=>new TextEncoder().encode(s);
async function register(page:Page,probe?:number[]){
 page.on('dialog',d=>void d.accept());await page.goto(app);
 const files:Record<string,Uint8Array>={...unzipSync(new Uint8Array(await readFile('public/test-program.zip'))),'ED4-01.RAW':text('RAWTEST1\0\0\0\0')};
 if(probe)files['ED4TEST.COM']=new Uint8Array(probe);
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-engine-test.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('ED4TEST.COM');await page.locator('#simple-confirm').click();
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
}
async function open(page:Page){await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await expect(page.locator('#boot-engine')).toHaveValue('stable');}
async function choose(page:Page){await open(page);await page.locator('#boot-engine').selectOption('phase9-3');await page.locator('#boot-start').click();}
async function report(page:Page){const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();return JSON.parse(await readFile((await(await pending).path())!,'utf8'));}
async function snapshot(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('ed4-mobile-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const out:any={db:{},opfs:{}};
 for(const name of Array.from(db.objectStoreNames))out.db[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();
 async function walk(dir:FileSystemDirectoryHandle,path:string){for await(const [name,entry] of (dir as any).entries()){if(entry.kind==='directory')await walk(entry,path+'/'+name);else{const bytes=await(await entry.getFile()).arrayBuffer();out.opfs[path+'/'+name]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}}}
 await walk(await navigator.storage.getDirectory(),'');
 return JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v);
});}
test('one-shot experimental engine reuses saves/RAW, discards writes and returns to stable offline',async({page,context},info)=>{
 await page.setViewportSize({width:960,height:480});await register(page);
 await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.reload();
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 const before=await snapshot(page);await context.setOffline(true);await page.reload();await choose(page);
 await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');
 await page.keyboard.press('d');await expect(page.locator('#logs')).toContainText('SAVE DELETED');
 const data=await report(page);expect(data.engine.artifact).toMatchObject({id:'phase9-3',wasmSha256:hash,verification:'sha256-of-compiled-module'});
 expect(data.engine.reboot.events.some((e:any)=>e.kind==='exec-result'&&e.lastExec.result==='loader-prepared')).toBe(true);
 expect(data.engine.runtimeErrors.events).toEqual([]);expect(data.bootSettings.comparison).toEqual(data.bootSettings.original);
 await page.screenshot({path:info.outputPath('mobile-experiment.png')});await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');expect(await snapshot(page)).toBe(before);
 await open(page);await page.locator('#boot-close').click();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');
 const stable=await report(page);expect(stable.engine.artifact.id).toBe('stable');expect(stable.engine.artifact.wasmSha256).toBe('5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf');expect(stable.engine.reboot.events).toEqual([]);expect(stable.engine.cpuHistory.history).toBeUndefined();
 await writeFile(info.outputPath('result.json'),JSON.stringify({experiment:data,stable},null,2));await page.locator('#stop').click();
});
test('experimental BIOS event and pre-state survive abort and manual diagnostic stop',async({page},info)=>{
 await register(page,[0x68,255,255,0x68,0,0,0xcb]);const before=await snapshot(page);await choose(page);
 await expect(page.locator('#logs')).toContainText('Aborted',{timeout:20000});const data=await report(page);
 expect(data.engine.artifact.wasmSha256).toBe(hash);expect(data.engine.reboot.firstReboot.route).toBe('reset-vector');expect(data.engine.reboot.preTransfer).toBeUndefined();
 expect(data.engine.cpuHistory.rejected).toBe(0);const h=data.engine.cpuHistory.history;expect(h.reason).toBe('reset-vector-fetch');expect(h.records.at(-1)).toMatchObject({kind:'retf',source:'normal-instruction',after:{cs:65535,ip:0,linear:1048560}});
 expect(h.execEntries.some((e:any)=>e.program==='ED4TEST.COM'&&e.entryObserved)).toBe(true);expect(h.rebootSequence).toBe(data.engine.reboot.events.find((e:any)=>e.kind==='reset-entry').sequence);
 expect(data.engine.reboot.events.some((e:any)=>e.kind==='before-abort')).toBe(true);expect(data.engine.runtimeErrors.events.some((e:any)=>/null function/.test(e.message))).toBe(false);
 await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');expect(await snapshot(page)).toBe(before);expect((await report(page)).engine.reboot).toEqual(data.engine.reboot);expect((await report(page)).engine.cpuHistory).toEqual(data.engine.cpuHistory);
 await writeFile(info.outputPath('reboot.json'),JSON.stringify(data,null,2));
});
test.describe('uncached integrity failures',()=>{
 test.use({serviceWorkers:'block'});
 test('wrong experimental WASM is rejected without starting it or mutating data',async({page})=>{
  await register(page);const before=await snapshot(page);let experimentWorkers=0;
  page.on('worker',w=>{if(w.url().includes('phase9-3'))experimentWorkers++;});
  await page.route('**/vendor/experimental/phase9-3/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:Buffer.from([0,97,115,109,1,0,0,0])}));
  await choose(page);await expect(page.locator('#run-state')).toHaveText('시작 실패');await expect(page.locator('#status')).toContainText('SHA-256 불일치');expect(experimentWorkers).toBe(0);expect(await snapshot(page)).toBe(before);
  const data=await report(page);expect(data.engine.artifact.id).toBe('phase9-3');expect(data.engine.artifact.wasmSha256).toBeUndefined();expect(data.engine.artifact.verification).toBe('not-yet-verified');
  await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');expect((await report(page)).engine.artifact.id).toBe('stable');await page.locator('#stop').click();
 });
});
test('Pages experiment assets and full GPL source match reviewed hashes',async({request})=>{
 const manifest=JSON.parse(await readFile('licenses/phase9-3-engine.json','utf8'));
 for(const [file,metadata]of Object.entries(manifest.files) as [string,any][]){const r=await request.get(app+'vendor/experimental/phase9-3/'+file);expect(r.status()).toBe(200);expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(metadata.sha256);if(file.endsWith('.wasm'))expect(r.headers()['content-type']).toBe('application/wasm');}
 const r=await request.get(app+'sources/emulators-0.73.8-phase9-3-source.zip');expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(manifest.sourceZipSha256);
 const files=unzipSync(await r.body());expect(files['emulators/native/dosbox/include/ed4_trace.h']).toBeTruthy();expect(new TextDecoder().decode(files['emulators/native/dosbox-jsdos/asyncify.txt'])).toContain('Reboot_Handler()');
 expect(files['emulators/BUILD.md']).toBeTruthy();expect(files['emulators/native/dosbox/src/cpu/ed4_cpu_trace.inc']).toBeTruthy();expect(Object.keys(files).some(p=>/\.(raw|sav|efc|com|exe)$/i.test(p))).toBe(false);
});
