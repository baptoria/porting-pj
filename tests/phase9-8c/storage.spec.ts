import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
import {probes,loader} from '../../scripts/phase9-4-probes.mjs';
import {createHash} from 'node:crypto';
const app='/porting-pj/ed4/',hash='d7478cb33e9e8a575f5c22789f69f243365aff3fc77543adf5f99cd013994eee';
const text=(s:string)=>new TextEncoder().encode(s);
async function register(page:Page,probe?:number[]){
 page.on('dialog',d=>void d.accept());await page.goto(app);
 const files:Record<string,Uint8Array>={...unzipSync(new Uint8Array(await readFile('public/test-program.zip'))),'ED4-01.RAW':text('RAWTEST1\0\0\0\0')};
 if(probe){files['ED4TEST.COM']=new Uint8Array(loader());files['ED4.EXE']=new Uint8Array(probe);}
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-engine-test.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('ED4TEST.COM');await page.locator('#simple-confirm').click();
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
}
async function open(page:Page){await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await expect(page.locator('#boot-engine')).toHaveValue('stable');}
async function choose(page:Page){await open(page);await page.locator('#boot-engine').selectOption('phase9-8c');await page.locator('#boot-start').click();}
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
 const data=await report(page);expect(data.engine.artifact).toMatchObject({id:'phase9-8c',wasmSha256:hash,verification:'sha256-of-compiled-module'});
 expect(data.engine.musicObservation.source).toBe('live-worker-query');expect(data.engine.music.reads).toBeGreaterThan(0);expect(data.engine.music.bytes).toBeGreaterThan(0);expect(data.engine.artifact.worker.entry).toContain('phase9-8c-');expect(data.engine.artifact.worker.common).toContain('phase9-8c-');
 expect(data.engine.audioOutput.adapter).toBe('mono-v1');expect(data.engine.audioOutput.runtimeEngine).toBe('phase9-8c');expect(data.engine.audioOutput.outputBufferChannels).toBe(1);
 expect(data.engine.reboot.events.some((e:any)=>e.kind==='exec-result'&&e.lastExec.result==='loader-prepared')).toBe(true);
 expect(data.engine.runtimeErrors.events).toEqual([]);expect(data.bootSettings.comparison).toEqual(data.bootSettings.original);
 await page.screenshot({path:info.outputPath('mobile-experiment.png')});await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');expect(await snapshot(page)).toBe(before);
 await open(page);await page.locator('#boot-close').click();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');
 const stable=await report(page);expect(stable.engine.artifact.id).toBe('stable');expect(stable.engine.artifact.wasmSha256).toBe('5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf');expect(stable.engine.reboot.events).toEqual([]);expect(stable.engine.cpuHistory.history).toBeUndefined();
 await writeFile(info.outputPath('result.json'),JSON.stringify({experiment:data,stable},null,2));await page.locator('#stop').click();
});
