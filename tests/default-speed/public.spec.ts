import {test,expect,Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strToU8,unzipSync} from 'fflate';
import {folderFixture} from '../folder-fixture';
import {stop} from '../phase9-8i/helpers';
async function data(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const out:any={};
 for(const key of ['profiles','archives','saves'])out[key]=await new Promise(r=>{const q=db.transaction(key).objectStore(key).getAll();q.onsuccess=()=>r(q.result);});db.close();return out;
});}
test('new and returning users get ordinary speed, save restart, explicit compatible mode and safe startup fallback',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 await page.addInitScript(()=>{const w=window as any,Native=Worker;w.used=[];window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){if(w.failK&&String(u).includes('dos-worker-phase9-8k'))throw Error('synthetic K startup failure');super(u,o);if(String(u).includes('dos-worker-phase'))w.used.push(String(u));}};});
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await expect(page.locator('#play-engine')).toHaveValue('phase9-8k');await expect(page.locator('#menu-audio-before')).toHaveCount(0);
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('ED4TEST.COM\r\n')},'default-speed'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 const run=async()=>{await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.locator('#fullscreen').click();};
 await run();await expect(page.locator('#speed-toggle')).toBeEnabled();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');
 for(const value of ['true','false','true']){await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',value);await expect(page.locator('#speed-toggle')).toBeEnabled();}
 const rect=(await page.locator('#speed-toggle').boundingBox())!;expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(844);expect(rect.y+rect.height).toBeLessThanOrEqual(390);
 await page.screenshot({path:'artifacts/default-speed/default-2x.png'});await page.locator('#canvas').focus();await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await stop(page);
 const before=await data(page);
 // Simulate a returning registered v1 user; never modify their catalog or saves.
 await page.evaluate(()=>{localStorage.removeItem('ed4-play-engine-v2');localStorage.setItem('ed4-play-engine-v1','phase9-7');localStorage.setItem('keep-control-test','retained');});await page.reload();
 await expect(page.locator('#play-engine')).toHaveValue('phase9-8k');expect(await data(page)).toEqual(before);
 expect(await page.evaluate(()=>localStorage.getItem('ed4-play-engine-v1'))).toBe('phase9-7');
 await run();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');await page.locator('#canvas').focus();await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);
 const saved=await data(page);await page.evaluate(()=>(window as any).failK=true);await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('시작 실패');await expect(page.locator('#play-fallback')).toBeVisible();
 expect(await data(page)).toEqual(saved);await page.screenshot({path:'artifacts/default-speed/startup-fallback.png',fullPage:true});await page.locator('#play-fallback').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await expect(page.locator('#status')).toContainText('호환 실행');await expect(page.locator('#speed-toggle')).toBeHidden();
 await page.locator('#canvas').focus();await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);
 await page.locator('#game-settings').click();expect(await page.locator('#play-engine').innerText()).not.toMatch(/Phase|phase|K 엔진/);await page.locator('#play-engine').selectOption('phase9-7');await page.locator('[data-close=settings-dialog]').click();await page.reload();
 await expect(page.locator('#play-engine')).toHaveValue('phase9-7');expect(await page.evaluate(()=>localStorage.getItem('keep-control-test'))).toBe('retained');
 await run();await expect(page.locator('#speed-toggle')).toBeHidden();await stop(page);
});
test('failed native speed confirmation offers explicit 1x fallback without saving a failed session',async({page})=>{
 await page.addInitScript(()=>{const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(e.data?.name==='ed4-speed-response'&&e.data.props?.engine==='phase9-8k'){e.data.props.ok=false;e.data.props.error='synthetic ACK refusal';}});}};});
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('ED4TEST.COM\r\n')},'ack-failure'));await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 const before=await data(page);await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('시작 실패');await expect(page.locator('#status')).toContainText('속도 확인 실패');await expect(page.locator('#play-fallback')).toBeVisible();expect(await data(page)).toEqual(before);
 await page.locator('#play-fallback').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await expect(page.locator('#speed-toggle')).toBeHidden();await stop(page);
});
