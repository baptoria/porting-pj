import {test,expect,Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {strToU8 as b,unzipSync} from 'fflate';
import {folderFixture} from '../folder-fixture';
import {rawTone} from '../../scripts/iso-fixture.mjs';
import {tempSaveProgram} from '../../scripts/temp-save-program.mjs';
async function state(p:Page){return p.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const out:any={};for(const n of ['profiles','archives','saves','recovery'])out[n]=await new Promise(r=>{const q=db.transaction(n).objectStore(n).getAll();q.onsuccess=()=>r(q.result);});db.close();
 out.raw={};async function walk(d:any,path:string){for await(const[n,h]of d.entries())if(h.kind==='directory')await walk(h,path+'/'+n);else out.raw[path+'/'+n]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await h.getFile()).arrayBuffer())));}await walk(await navigator.storage.getDirectory(),'');return JSON.parse(JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v));
});}
async function setup(p:Page){p.on('dialog',d=>void d.accept());await p.goto('/porting-pj/ed4/');await expect(p.locator('#offline')).toHaveText('오프라인 준비 완료');await p.locator('#simple-import').click();await p.locator('#simple-folder').setInputFiles(await folderFixture({'GAME.BAT':b('TEMP.COM\r\n'),'TEMP.COM':tempSaveProgram(),'SAVE/Ed4_s000.dat':b('slot zero'),'SAVE/ED4_S001.DAT':b('slot one'),'SAVE/ED4_98.CFG':b('config'),'SAVE/DATA_B.DAT':b('unknown'),'SAVE/TOOL.COM':b('not exported'),'EFFECT/A.RAW':rawTone()},'export-game'));await p.getByRole('button',{name:'이 폴더로 파일 검사'}).click();await expect(p.locator('#simple-import-dialog')).not.toBeVisible();await p.locator('#launcher-advanced').click();await p.locator('#pc-save-export').click();}
async function getZip(p:Page){const event=p.waitForEvent('download');await p.locator('#pc-export-download').click();const dl=await event;expect(dl.suggestedFilename()).toBe('ED4_PC_SAVE.zip');await expect(p.locator('#pc-export-status')).toContainText('다운로드를 요청');return readFile((await dl.path())!);}
test('plain PC ZIP default slots/CFG, hashes and state preserved; round-trip through existing import',async({page},info)=>{
 await page.setViewportSize({width:832,height:384});await setup(page);const before=await state(page);
 await expect(page.locator('[data-export-path="SAVE/DATA_B.DAT"]')).not.toBeChecked();await expect(page.locator('[data-export-path="SAVE/TOOL.COM"]')).toBeDisabled();
 const zip=await getZip(page),files=unzipSync(zip);expect(Object.keys(files).sort()).toEqual(['SAVE/ED4_98.CFG','SAVE/ED4_S001.DAT','SAVE/Ed4_s000.dat'].sort());
 for(const [path,data]of Object.entries(files)){const original=Uint8Array.from(before.archives[0].files[path.toUpperCase()]);expect(data).toEqual(original);expect(createHash('sha256').update(data).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));}
 expect(await state(page)).toEqual(before);await page.screenshot({path:info.outputPath('export-landscape.png')});await page.locator('#pc-export-close').click();await page.locator('#pc-save-import').click();
 await page.locator('#pc-save-zip').setInputFiles({name:'ED4_PC_SAVE.zip',mimeType:'application/zip',buffer:zip});await expect(page.locator('#pc-save-status')).toContainText('3개 파일 확인');await page.locator('#pc-save-apply').click();await expect(page.locator('#pc-save-dialog')).not.toBeVisible();
 const after=await state(page);for(const [path,data]of Object.entries(files))expect(after.saves[0].files[path.toUpperCase()]).toEqual(Array.from(data));expect(after.archives).toEqual(before.archives);expect(after.profiles).toEqual(before.profiles);expect(after.raw).toEqual(before.raw);
});
test('individual optional save selection, empty selection, cancelled dialog and launcher backup naming',async({page})=>{
 await setup(page);const before=await state(page);await page.locator('#pc-export-details summary').click();await page.locator('#pc-export-none').click();await expect(page.locator('#pc-export-download')).toBeDisabled();
 await page.locator('[data-export-path="SAVE/DATA_B.DAT"]').check();expect(Object.keys(unzipSync(await getZip(page)))).toEqual(['SAVE/DATA_B.DAT']);
 await page.locator('#pc-export-slots').click();await expect(page.locator('[data-export-path="SAVE/DATA_B.DAT"]')).not.toBeChecked();await page.locator('#pc-export-close').click();expect(await state(page)).toEqual(before);await expect(page.locator('#backup')).toHaveText('실행기 저장 백업');
});
test('stale snapshot refuses export and active public DOS session cannot open export',async({page})=>{
 await setup(page);await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const profiles:any[]=await new Promise(r=>{const q=db.transaction('profiles').objectStore('profiles').getAll();q.onsuccess=()=>r(q.result);});const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put({profileId:profiles[0].id,files:{'SAVE/ED4_S002.DAT':new Uint8Array([1,2,3])},updatedAt:Date.now()});await new Promise(r=>tx.oncomplete=r);db.close();});
 const before=await state(page);let downloads=0;page.on('download',()=>downloads++);await page.locator('#pc-export-download').click();await expect(page.locator('#pc-export-status')).toContainText('저장 상태가 바뀌었습니다');expect(downloads).toBe(0);expect(await state(page)).toEqual(before);
 await page.locator('#pc-export-close').click();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('J TEMP READY');await expect(page.locator('#pc-save-export')).toBeDisabled();
});
for(const viewport of [{width:832,height:384},{width:1440,height:1000}])test(`export summary and optional details layout ${viewport.width}`,async({page},info)=>{
 await page.setViewportSize(viewport);await setup(page);await expect(page.locator('#pc-export-title')).toHaveText('저장 파일 내보내기');await expect(page.locator('#pc-export-count')).toContainText('3개 파일 선택');await expect(page.locator('#pc-export-details')).not.toHaveAttribute('open');
 const button=await page.locator('#pc-export-download').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);expect(button!.y+button!.height).toBeLessThanOrEqual(viewport.height);await page.screenshot({path:info.outputPath('export-summary.png')});
 await page.locator('#pc-export-details summary').click();await expect(page.locator('#pc-save-export-dialog table')).toHaveCount(0);expect(await page.locator('.save-transfer-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('export-details.png')});
});
