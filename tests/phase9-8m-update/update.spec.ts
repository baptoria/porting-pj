import {folderFixture} from '../folder-fixture';
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strToU8} from 'fflate';
const build=JSON.parse(await readFile('src/build-info.json','utf8'));
test('public update waits for ordinary play, preserves game/RAW/save/preferences and works offline',async({page,context,request})=>{
 page.on('dialog',d=>void d.accept());await request.post('/__release?id=a');await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.reload();
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('ED4TEST.COM\r\n'),'_ED4-09.RAW':new Uint8Array(128)},'user-mod'));await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#game-settings').click();await page.locator('#play-engine').selectOption('phase9-7');await page.locator('[data-close=settings-dialog]').click();
 const state=()=>page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const out:any={};for(const n of ['archives','profiles','saves','recovery'])out[n]=await new Promise(r=>{const q=db.transaction(n).objectStore(n).getAll();q.onsuccess=()=>r(q.result);});db.close();
  out.raw={};async function walk(dir:any,path:string){for await(const [n,e]of dir.entries()){if(e.kind==='directory')await walk(e,path+'/'+n);else out.raw[path+'/'+n]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await e.getFile()).arrayBuffer())));}}await walk(await navigator.storage.getDirectory(),'');out.engine=localStorage.getItem('ed4-play-engine-v1');return JSON.parse(JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v));
 });
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#launcher-version').evaluate(e=>(e as HTMLDetailsElement).open=true);await request.post('/__release?id=b');await page.locator('#update-check').click();await expect(page.locator('#update-status')).toContainText('검증된 새 실행기',{timeout:30000});await expect(page.locator('#update-apply')).toBeDisabled();await expect(page.locator('#run-state')).toHaveText('실행 중');
 await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');const before=await state();await page.locator('#update-apply').click();await expect(page.locator('#launcher-build')).not.toContainText(build.id+'-prior');await expect(page.locator('body')).toHaveAttribute('data-build-audience','public');expect(await state()).toEqual(before);
 await context.setOffline(true);await page.reload();await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.locator('#stop').click();
});
