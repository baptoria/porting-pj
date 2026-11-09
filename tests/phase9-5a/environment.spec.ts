import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
import {apertureProbe} from '../../scripts/phase9-5a-probe.mjs';
const app='/porting-pj/ed4/',hash='13d96ce65d9370acf4a2c3f99a7723872ef6dae193ca4ffdd4944e526a7d3738';
const text=(s:string)=>new TextEncoder().encode(s);
async function register(page:Page,tail=''){
 page.on('dialog',d=>void d.accept());await page.goto(app);
 const files:Record<string,Uint8Array>={...unzipSync(new Uint8Array(await readFile('public/test-program.zip'))),'ED4-01.RAW':text('RAWTEST1\0\0\0\0')};
 files['GAME.BAT']=text('@ECHO OFF\r\nED4TEST.COM\r\n'+tail);
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-engine-test.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 if(tail){await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('GAME.BAT');await page.locator('#simple-confirm').click();}
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await expect(page.locator('#status')).toContainText('등록 완료');
}
async function open(page:Page){await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await expect(page.locator('#boot-engine')).toHaveValue('stable');}
async function choose(page:Page,mode:string,engine='stable'){await open(page);await page.locator('#boot-engine').selectOption(engine);await page.locator('#boot-comparison').selectOption(mode);await page.locator('#boot-start').click();}
async function report(page:Page){const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();return JSON.parse(await readFile((await(await pending).path())!,'utf8'));}
async function snapshot(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('ed4-mobile-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const out:any={db:{},opfs:{}};
 for(const name of Array.from(db.objectStoreNames))out.db[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();
 async function walk(dir:FileSystemDirectoryHandle,path:string){for await(const [name,entry] of (dir as any).entries()){if(entry.kind==='directory')await walk(entry,path+'/'+name);else{const bytes=await(await entry.getFile()).arrayBuffer();out.opfs[path+'/'+name]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}}}
 await walk(await navigator.storage.getDirectory(),'');
 return JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v);
});}

for(const engine of ['stable','phase9-4'])test(`${engine}: one mixer property, native readback, saves and RAW unchanged`,async({page,context},info)=>{
 await register(page);await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 const before=await snapshot(page),results=[];await context.setOffline(true);await page.reload();
 for(const mode of ['pc-baseline','pc-mixer-nosound']){
  await choose(page,mode,engine);await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
  await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');
  const active=await report(page);expect(active.engine.artifact.id).toBe(engine);expect(active.bootSettings.environment.observations).toContainEqual({stage:'BEFORE',key:'mixer.nosound',value:String(mode==='pc-mixer-nosound')});expect(active.bootSettings.environment.observations.some((s:any)=>s.stage==='AFTER')).toBe(false);
  expect(active.bootSettings.environment.files.find((f:any)=>f.name==='GAME.BAT').sha256).toBe(createHash('sha256').update(text('@ECHO OFF\r\nED4TEST.COM\r\n')).digest('hex'));expect(active.bootSettings.comparison).toEqual(active.bootSettings.original);
  await page.keyboard.press('d');await expect(page.locator('#logs')).toContainText('SAVE DELETED');await page.keyboard.press('q');await expect(page.locator('#logs')).toContainText('E4ENV AFTER');
  const ended=await report(page);expect(ended.bootSettings.environment.observations).toContainEqual({stage:'AFTER',key:'mixer.nosound',value:String(mode==='pc-mixer-nosound')});expect(ended.engine.runtimeErrors.events).toEqual([]);results.push(ended);
  await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');expect(await snapshot(page)).toBe(before);
 }
 expect(results[0].bootSettings.config.replace('nosound=false','nosound=true')).toBe(results[1].bootSettings.config);
 await open(page);await expect(page.locator('#boot-comparison')).toHaveValue('manual');await page.locator('#boot-close').click();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');expect((await report(page)).engine.artifact.id).toBe('stable');await page.locator('#stop').click();
 await writeFile(info.outputPath('comparisons.json'),JSON.stringify(results,null,2));
});

test('unmodified stable engine reads default properties and applies cycles max',async({page},info)=>{
 const properties=['dos xms','dos ems','dos umb','cpu core','cpu cputype','cpu cycles','gus gus','sblaster oplemu','sblaster oplrate'];
 // Native keyboard scancodes do not synthesize shifted characters from type().
 // Read properties in an authored public BAT, with literal quotes/percent signs.
 const tail=properties.map((p,i)=>`CONFIG -get "${p}"\r\nECHO.\r\nECHO PROP${i}=%CONFIG%\r\n`).join('')+'cycles max\r\nCONFIG -get "cpu cycles"\r\nECHO.\r\nECHO CHANGED_CYCLES=%CONFIG%\r\n';
 await register(page,tail);await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('q');
 for(const [i,v]of ['true','true','true','auto','auto','12000','false','default','22050'].entries())await expect(page.locator('#logs')).toContainText(`PROP${i}=${v}`);
 await expect(page.locator('#logs')).toContainText('CHANGED_CYCLES=max');
 const r=await report(page);expect(r.engine.runtimeErrors.events).toEqual([]);await writeFile(info.outputPath('defaults.json'),JSON.stringify(r,null,2));await page.locator('#stop').click();
});

test('public mode-3 VGA sentinel writes read FFFF without executing game code',async({page},info)=>{
 page.on('dialog',d=>void d.accept());
 await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':apertureProbe()}))}));
 await page.goto(app);await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();
 await expect(page.locator('#logs')).toContainText('PUBLIC_TEXT_VGA_SENTINELS_READ_FFFF');await expect(page.locator('#logs')).not.toContainText('PUBLIC_TEXT_VGA_OTHER_MAPPING');
 const r=await report(page);expect(r.engine.runtimeErrors.events).toEqual([]);await writeFile(info.outputPath('aperture.json'),JSON.stringify(r,null,2));await page.locator('#stop').click();
});
