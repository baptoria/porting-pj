import {test,expect,Page} from '@playwright/test';
import {strToU8 as b,zipSync,unzipSync} from 'fflate';
import {readFile} from 'node:fs/promises';
import {folderFixture} from '../folder-fixture';
import {tempSaveProgram} from '../../scripts/temp-save-program.mjs';
import {rawTone} from '../../scripts/iso-fixture.mjs';
import {menu} from '../phase9-8i/helpers';
async function snapshot(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const result:any={};
 for(const name of ['archives','profiles','saves','recovery'])result[name]=await new Promise(r=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>r(q.result);});db.close();
 result.opfs={};async function walk(d:any,path:string){for await(const[n,h]of d.entries())if(h.kind==='directory')await walk(h,path+'/'+n);else result.opfs[path+'/'+n]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await h.getFile()).arrayBuffer())));}await walk(await navigator.storage.getDirectory(),'');
 return JSON.parse(JSON.stringify(result,(_,v)=>v instanceof Uint8Array?Array.from(v):v));
});}
async function setup(page:Page){
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({'GAME.BAT':b('TEMP.COM\r\n'),'TEMP.COM':tempSaveProgram(),'SAVE/ED4_98.CFG':b('original config'),'SAVE/OLD.DAT':b('old'),'USERMOD.DAT':b('keep mod'),'EFFECT/A.RAW':rawTone()},'pc-save-game'));await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#launcher-advanced').click();await page.locator('#pc-save-import').click();
}
async function backup(page:Page){if(!await page.locator('#pc-save-advanced').evaluate(e=>(e as HTMLDetailsElement).open))await page.locator('#pc-save-advanced summary').click();const event=page.waitForEvent('download');await page.locator('#pc-save-backup').click();const bytes=await readFile((await(await event).path())!);return unzipSync(bytes);}
async function apply(page:Page){await page.locator('#pc-save-apply').click();await expect(page.locator('#pc-save-dialog')).not.toBeVisible();await expect(page.locator('#status')).toContainText('PC 세이브를 가져왔습니다');}
test('loose PC saves need no backup download; exact data persists and public DOS loads/consumes imported file',async({page,context},info)=>{
 await page.setViewportSize({width:832,height:384});await setup(page);const before=await snapshot(page);
 await page.locator('#pc-save-files').setInputFiles([{name:'ED4_S99_.DAT',mimeType:'application/octet-stream',buffer:Buffer.from('TEMP_A')},{name:'ED4_98.CFG',mimeType:'application/octet-stream',buffer:Buffer.from('PC config')}]);
 await expect(page.locator('#pc-save-status')).toContainText('2개 파일 확인');await expect(page.locator('#pc-save-apply')).toBeEnabled();let downloads=0;page.on('download',()=>downloads++);await expect(page.locator('#pc-save-backup-confirm')).toHaveCount(0);await expect(page.locator('#pc-save-confirm')).toContainText('기존 파일 1개를 새 파일로 바꿉니다.');
 await page.screenshot({path:info.outputPath('preview-landscape.png')});await apply(page);
 expect(downloads).toBe(0);const imported=await snapshot(page);expect(imported.saves[0].files['SAVE/ED4_S99_.DAT']).toEqual(Array.from(b('TEMP_A')));expect(imported.archives).toEqual(before.archives);expect(imported.profiles).toEqual(before.profiles);expect(imported.opfs).toEqual(before.opfs);expect(imported.recovery).toHaveLength(1);
 await context.setOffline(true);await page.reload();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('J TEMP READY');await expect(page.locator('#pc-save-import')).toBeDisabled();
 await page.locator('#canvas').focus();await page.keyboard.press('c');await expect(page.locator('#logs')).toContainText('LOADED TEMP_A CONSUMED');
 await menu(page);await page.locator('#stop').click();await page.locator('#temp-exit-confirm').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 expect((await snapshot(page)).saves[0].tombstones).toContain('SAVE/ED4_S99_.DAT');
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('J TEMP READY');await page.locator('#canvas').focus();await page.keyboard.press('c');await expect(page.locator('#logs')).toContainText('NO TEMP FILE');
});
test('SAVE folder and ZIP replace preview preserve unchecked file, clear selected tombstone only, recovery remains available',async({page})=>{
 await setup(page);await page.locator('#pc-save-folder').setInputFiles(await folderFixture({'ED4_S99_.DAT':b('TEMP_B'),'ED4_98.CFG':b('from folder'),'archive.zip':b('ignored')},'SAVE'));
 await expect(page.locator('#pc-save-status')).toContainText('1개 파일은 제외');const files=await backup(page);expect(files['FILES/SAVE/ED4_98.CFG']).toEqual(b('original config'));expect(files['FILES/GAME.BAT']).toBeUndefined();await apply(page);
 await page.locator('#pc-save-import').click();await page.locator('#pc-save-zip').setInputFiles({name:'pc.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'backup/SAVE/NEW.DAT':b('new')}))});await page.locator('#pc-save-advanced summary').click();await page.locator('#pc-save-mode').selectOption('replace');await expect(page.locator('#pc-save-confirm')).toContainText('기존 저장 파일 3개를 삭제합니다.');await page.locator('#pc-save-details summary').click();
 await expect(page.locator('#pc-save-rows')).toContainText('기존 저장 파일 삭제');await page.locator('[data-pc-path="SAVE/ED4_98.CFG"]').uncheck();await backup(page);await apply(page);
 const state=await snapshot(page),save=state.saves[0];expect(save.files['SAVE/ED4_98.CFG']).toEqual(Array.from(b('from folder')));expect(save.tombstones).toContain('SAVE/ED4_S99_.DAT');expect(save.tombstones).toContain('SAVE/OLD.DAT');expect(state.recovery).toHaveLength(2);
 await page.locator('#recovery-open').click();await expect(page.locator('#recovery-point option')).toHaveCount(2);
});
test('unsafe ZIP and cancelled preview do not alter data',async({page})=>{
 await setup(page);const before=await snapshot(page);
 await page.locator('#pc-save-zip').setInputFiles({name:'unsafe.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'../SAVE/A.DAT':b('x')}))});await expect(page.locator('#pc-save-status')).toContainText('안전하지');await expect(page.locator('#pc-save-apply')).toBeDisabled();
 await page.locator('#pc-save-files').setInputFiles({name:'A.DAT',mimeType:'application/octet-stream',buffer:Buffer.from('preview only')});await expect(page.locator('#pc-save-backup')).toBeEnabled();await page.locator('#pc-save-close').click();expect(await snapshot(page)).toEqual(before);
});
test('IDB write failure keeps exact prior save and recovery; retry succeeds with original preview',async({page})=>{
 await setup(page);await page.locator('#pc-save-files').setInputFiles({name:'A.DAT',mimeType:'application/octet-stream',buffer:Buffer.from('PC')});const before=await snapshot(page);
 await page.evaluate(()=>{const old=IDBObjectStore.prototype.put;(window as any).restorePcPut=()=>{IDBObjectStore.prototype.put=old;};IDBObjectStore.prototype.put=function(...args:any[]){if(this.name==='saves')throw new DOMException('quota','QuotaExceededError');return old.apply(this,args as any);};});
 await page.locator('#pc-save-apply').click();await expect(page.locator('#pc-save-status')).toContainText('저장 공간이 부족');expect(await snapshot(page)).toEqual(before);
 await page.evaluate(()=>(window as any).restorePcPut());await apply(page);expect((await snapshot(page)).saves[0].files['SAVE/A.DAT']).toEqual(Array.from(b('PC')));
});
for(const viewport of [{width:832,height:384},{width:1440,height:1000}])test(`readable import steps, details, reselect and cancel ${viewport.width}`,async({page},info)=>{
 await page.setViewportSize(viewport);await setup(page);const before=await snapshot(page);
 await expect(page.locator('.save-steps [aria-current]')).toHaveText('1. 파일 선택');await expect(page.locator('#pc-save-select')).toBeVisible();
 await page.screenshot({path:info.outputPath('import-select.png')});
 for(const kind of ['files','folder','zip']){await page.locator('#pc-save-kind').selectOption(kind);const chooser=page.waitForEvent('filechooser');await page.locator('#pc-save-pick').click();expect((await chooser).element()).toBeTruthy();}
 const long='long-original-archive-folder-'.repeat(5)+'/SAVE/ED4_S001.DAT';
 await page.locator('#pc-save-zip').setInputFiles({name:'pc.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({[long]:b('slot'),['long-original-archive-folder-'.repeat(5)+'/SAVE/ED4_98.CFG']:b('newconfig')}))});
 await expect(page.locator('.save-steps [aria-current]')).toHaveText('2. 내용 확인');await expect(page.locator('#pc-save-summary')).toContainText('새로 추가할 저장 파일: 1개');await expect(page.locator('#pc-save-summary')).toContainText('바뀌는 기존 저장 파일: 1개');
 await expect(page.locator('#pc-save-details')).not.toHaveAttribute('open');await expect(page.locator('#pc-save-mode')).toHaveValue('merge');await expect(page.locator('#pc-save-dialog table')).toHaveCount(0);
 const assertLayout=async()=>{const box=await page.locator('#pc-save-apply').boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);expect(await page.locator('.save-transfer-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);};
 await assertLayout();await page.screenshot({path:info.outputPath('import-review.png')});await page.locator('#pc-save-details summary').click();await expect(page.locator('#pc-save-rows')).toContainText(long);await page.locator('[data-pc-path]').first().scrollIntoViewIfNeeded();await assertLayout();await page.screenshot({path:info.outputPath('import-details.png')});
 await page.locator('[data-pc-path="SAVE/ED4_98.CFG"]').uncheck();await expect(page.locator('#pc-save-summary')).toContainText('바뀌는 기존 저장 파일: 0개');await expect(page.locator('#pc-save-count')).toContainText('1개 파일 선택');
 await page.locator('#pc-save-back').click();await expect(page.locator('#pc-save-apply')).toBeDisabled();await page.locator('#pc-save-review').click();await expect(page.locator('[data-pc-path="SAVE/ED4_98.CFG"]')).not.toBeChecked();
 await page.locator('#pc-save-advanced summary').click();await page.locator('#pc-save-mode').selectOption('replace');await expect(page.locator('#pc-save-confirm')).toContainText('삭제합니다');await page.screenshot({path:info.outputPath('import-replace.png')});
 await page.locator('#pc-save-back').click();await page.locator('#pc-save-files').setInputFiles({name:'NEW.SAV',mimeType:'application/octet-stream',buffer:Buffer.from('new')});await expect(page.locator('#pc-save-mode')).toHaveValue('merge');await expect(page.locator('#pc-save-confirm')).toBeHidden();
 await page.locator('#pc-save-close').click();expect(await snapshot(page)).toEqual(before);
});

test('failed automatic recovery checkpoint prevents apply without an external backup and permits retry',async({page})=>{
 await setup(page);await page.locator('#pc-save-files').setInputFiles({name:'A.DAT',mimeType:'application/octet-stream',buffer:Buffer.from('PC')});await expect(page.locator('#pc-save-apply')).toBeEnabled();const before=await snapshot(page);
 await page.evaluate(()=>{const old=IDBObjectStore.prototype.add;(window as any).restorePcAdd=()=>{IDBObjectStore.prototype.add=old;};IDBObjectStore.prototype.add=function(...args:any[]){if(this.name==='recovery')throw new DOMException('quota','QuotaExceededError');return old.apply(this,args as any);};});
 await page.locator('#pc-save-apply').click();await expect(page.locator('#pc-save-status')).toContainText('저장 공간이 부족');expect(await snapshot(page)).toEqual(before);
 await page.evaluate(()=>(window as any).restorePcAdd());await apply(page);expect((await snapshot(page)).recovery).toHaveLength(1);
});
