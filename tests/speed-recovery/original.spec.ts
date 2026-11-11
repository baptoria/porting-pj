// Opt-in read-only local original. Control steps and screenshots remain in ignored artifacts.
import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {menu,stop} from '../phase9-8i/helpers';
test('original internal exit save and restart observation',async({page},info)=>{
 test.skip(!process.env.ED4_Q_LOCAL_FOLDER);test.setTimeout(240000);page.on('dialog',d=>void d.accept());
 await page.goto('/porting-pj/'+(process.env.ED4_TEST_PUBLIC?'ed4':'ed4-dev')+'/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(process.env.ED4_Q_LOCAL_FOLDER!);await expect(page.locator('#simple-import-dialog')).not.toBeVisible({timeout:120000});await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('Now Loading...',{timeout:30000});await page.waitForTimeout(8000);
 const key=async(k:string)=>{await page.locator('#canvas').focus();await page.keyboard.press(k,{delay:150});await page.waitForTimeout(350);};
 await key('Enter');await page.waitForTimeout(3000);
 for(const rate of [2,1]){await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(rate===2));await expect(page.locator('#speed-toggle')).toBeEnabled();await page.waitForTimeout(1000);}
 await key('Escape');await page.waitForTimeout(1500);await page.locator('#canvas').screenshot({path:info.outputPath('menu.png')});
 // Visually verified for this opt-in installation: Other -> Suspend -> preserve data: Yes.
 for(let i=0;i<5;i++)await key('ArrowDown');await key('Enter');
 for(let i=0;i<3;i++)await key('ArrowDown');await key('Enter');
 await page.locator('#canvas').screenshot({path:info.outputPath('preserve-confirm.png')});await key('Enter');await page.waitForTimeout(1500);await stop(page);
 const stored=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open(document.body.dataset.buildAudience==='developer'?'ed4-mobile-dev-v1':'ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const saves=await new Promise<any[]>(r=>{const q=db.transaction('saves').objectStore('saves').getAll();q.onsuccess=()=>r(q.result);});db.close();return saves.map(s=>({files:Object.entries(s.files).map(([p,b])=>({path:p,bytes:(b as Uint8Array).length})),tombstones:s.tombstones}));});
 await writeFile(info.outputPath('saved-file-metadata.json'),JSON.stringify(stored,null,2));expect(stored[0].files.some((f:any)=>f.path==='SAVE/ED4_S99_.DAT'&&f.bytes>0)).toBe(true);
 await page.reload();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('Now Loading...',{timeout:30000});await page.waitForTimeout(8000);await key('Enter');await page.waitForTimeout(4000);await page.locator('#canvas').screenshot({path:info.outputPath('resumed.png')});
 await menu(page);await page.locator('#stop').click();await expect(page.locator('#temp-exit-confirm')).toBeVisible();await page.locator('#temp-exit-confirm').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
});
