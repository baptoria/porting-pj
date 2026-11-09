import {test,expect,Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const app='/porting-pj/ed4/';
const build=JSON.parse(await readFile('src/build-info.json','utf8'));
async function version(page:Page){await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#launcher-version').evaluate(e=>(e as HTMLDetailsElement).open=true);}
async function sentinel(page:Page,write=false){return page.evaluate(async(write)=>{
 if(write){localStorage.setItem('ed4-ui-sentinel','keep');await caches.open('other-app-keep');}
 const root=await navigator.storage.getDirectory();const handle=await root.getFileHandle('keep.txt',{create:write});if(write){const w=await handle.createWritable();await w.write('raw-keep');await w.close();}
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('update-sentinel',1);r.onupgradeneeded=()=>r.result.createObjectStore('s');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 if(write)await new Promise<void>((resolve,reject)=>{const t=db.transaction('s','readwrite');t.objectStore('s').put('save-keep','slot');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});
 const save=await new Promise(resolve=>{const r=db.transaction('s').objectStore('s').get('slot');r.onsuccess=()=>resolve(r.result);});db.close();
 return {save,raw:await(await handle.getFile()).text(),ui:localStorage.getItem('ed4-ui-sentinel'),otherCache:(await caches.keys()).includes('other-app-keep')};
 },write);}
test('old verified shell waits during game, applies only by user, preserves storage, then works offline',async({page,request,context})=>{
 await request.post('/__release?id=a');await page.goto(app);page.on('dialog',d=>void d.accept());await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.reload();await version(page);await expect(page.locator('#launcher-build')).toContainText(build.id+'-prior');
 const before=await sentinel(page,true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#music-files').setInputFiles({name:'ED4-01.RAW',mimeType:'application/octet-stream',buffer:Buffer.from('RAWTEST1abcd')});await expect(page.locator('#music-track option')).toHaveCount(1);await page.locator('#music-link').click();await expect(page.locator('#status')).toContainText('연결했습니다');await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 await request.post('/__release?id=b');await page.locator('#update-check').click();await expect(page.locator('#update-status')).toContainText('검증된 새 실행기',{timeout:30000});await expect(page.locator('#update-apply')).toBeDisabled();await expect(page.locator('#run-state')).toHaveText('실행 중');await expect(page.locator('#launcher-build')).toContainText(build.id+'-prior');
 await page.locator('#canvas').focus();await page.keyboard.press('ArrowUp');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await page.locator('#stop').click();await expect(page.locator('#update-apply')).toBeEnabled();
 const other=await context.newPage();await other.goto(app);await page.locator('#update-apply').click();await expect(page.locator('#update-status')).toContainText('다른 실행기 창');await other.close();
 await page.locator('#update-apply').click();await expect(page.locator('#launcher-build')).not.toContainText(build.id+'-prior');await expect(page.locator('#launcher-build')).toContainText(build.id);expect(await sentinel(page)).toEqual(before);
 await version(page);await page.locator('#boot-open').click();await expect(page.locator('#boot-engine option[value="phase9-8d"]')).toHaveCount(1);await page.locator('#boot-close').click();
 await context.setOffline(true);await page.reload();await expect(page.locator('#launcher-build')).toContainText('서비스 워커: '+build.id);await expect(page.locator('#profile-title')).toHaveText('공개 DOS 테스트');await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');await page.locator('#stop').click();
});
test('partial WASM deployment cannot activate; prior shell and storage survive',async({page,request})=>{
 await request.post('/__release?id=a');await page.goto(app);await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.reload();await version(page);const before=await sentinel(page,true);
 await request.post('/__release?id=broken');await page.locator('#update-check').click();await expect(page.locator('#update-status')).toContainText('검증 실패',{timeout:30000});await expect(page.locator('#update-apply')).toBeDisabled();expect(await sentinel(page)).toEqual(before);
 await page.reload();await expect(page.locator('#launcher-build')).toContainText(build.id+'-prior');
 await request.post('/__release?id=b');await version(page);await page.locator('#update-check').click();await expect(page.locator('#update-apply')).toBeEnabled({timeout:30000});
});
test('mismatched SW digest refuses update without touching the active release',async({page,request})=>{
 await request.post('/__release?id=a');await page.goto(app);await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.reload();await version(page);await request.post('/__release?id=bad-sw');await page.locator('#update-check').click();await expect(page.locator('#update-status')).toContainText('해시 불일치');await expect(page.locator('#update-apply')).toBeDisabled();
});
test('legacy cache-first shell with 9-7 menu upgrades through new update page, without data clearing',async({page,request})=>{
 await request.post('/__release?id=legacy');await page.goto(app);await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));await page.reload();await expect(page.locator('#boot-engine')).toHaveText('phase9-7');const before=await sentinel(page,true);
 await request.post('/__release?id=b');await page.reload();await expect(page.locator('#boot-engine')).toHaveText('phase9-7');
 await page.goto(app+'update.html');await expect(page.locator('#update-apply')).toBeEnabled({timeout:30000});await page.locator('#update-apply').click();await expect(page.locator('#simple-import')).toBeVisible();await version(page);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#boot-open').click();await expect(page.locator('#boot-engine option[value="phase9-8d"]')).toHaveCount(1);expect(await sentinel(page)).toEqual(before);
});
