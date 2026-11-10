import {folderFixture} from '../folder-fixture';
import {test,expect,Page} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {unzipSync,strToU8} from 'fflate';
import {menu,stop} from '../phase9-8i/helpers';
import {tempSaveProgram} from '../../scripts/temp-save-program.mjs';
import {resolve,dirname} from 'node:path';
const root='artifacts/phase9-8m-folder';
async function boot(page:Page){page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/?developer=true');await expect(page.locator('body')).toHaveAttribute('data-build-audience','public');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');}
async function files(){return {...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('ED4TEST.COM\r\n'),'_ED4-09.RAW':new Uint8Array(128),'MOD.DAT':strToU8('USER MOD')};}
async function upload(page:Page,data:Record<string,Uint8Array>,name='public.zip'){
 await page.locator('#simple-folder').setInputFiles(await folderFixture(data,name));
}
async function register(page:Page){await page.locator('#simple-import').click();await upload(page,await files());await expect(page.locator('#simple-import-dialog')).not.toBeVisible();}
async function catalog(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const out:any={};
 for(const name of ['profiles','saves','archives','recovery'])out[name]=await new Promise(r=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>r(q.result);});db.close();
 return JSON.parse(JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v));
});}
async function run(page:Page){await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');}
async function normal97(page:Page){await page.locator('#game-settings').click();await page.locator('#play-engine').selectOption('phase9-7');await page.locator('[data-close=settings-dialog]').click();}

test('whole folder registration and ordinary recovery preview remain available in public build',async({page})=>{
 await boot(page);const folder=resolve(root,'fixture-folder');
 const input={'GAME.BAT':strToU8('TEMP.COM\r\n'),'TEMP.COM':tempSaveProgram(),'SAVE/ED4_98.CFG':strToU8('original config'),'_ED4-09.RAW':new Uint8Array(128)};
 for(const [name,data] of Object.entries(input)){await mkdir(dirname(resolve(folder,name)),{recursive:true});await writeFile(resolve(folder,name),data);}
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(folder);await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await normal97(page);
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('J TEMP READY');await page.locator('#canvas').focus();await page.keyboard.press('a');await expect(page.locator('#logs')).toContainText('TEMP A CREATED');await stop(page);
 const prior=await catalog(page);expect(prior.recovery).toHaveLength(1);
 await page.locator('#launcher-advanced').click();await page.locator('#recovery-open').click();await page.locator('#recovery-preview').click();await expect(page.locator('#logs')).toContainText('J TEMP READY');
 await page.locator('#canvas').focus();await page.keyboard.press('c');await expect(page.locator('#logs')).toContainText('TEMP_A CONSUMED');await stop(page);
 const after=await catalog(page);expect(after.saves).toEqual(prior.saves);expect(after.recovery).toEqual(prior.recovery);expect(after.archives).toEqual(prior.archives);
});

test('public registration, modes, isolated saves, backup, RAW and offline reconnect',async({page,context})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);await register(page);await normal97(page);
 const base=(await catalog(page)).profiles[0];expect(base.kind).toBe('vanilla');expect(base.music).toBeTruthy();
 await run(page);await page.locator('#canvas').focus();await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await stop(page);
 await page.locator('#launcher-advanced').click();const pending=page.waitForEvent('download');await page.locator('#backup').click();const backup=unzipSync(await readFile((await(await pending).path())!));expect(backup['FILES/TEST.SAV']).toBeTruthy();expect(Object.keys(backup).some(p=>p.endsWith('.RAW'))).toBe(false);
 if(!await page.locator('#mode-manage').isVisible())await page.locator('#choose-profile').click();await page.locator('#mode-manage').click();await page.locator('#mode-patch').click();await upload(page,{'MOD.DAT':strToU8('PATCH')},'patch.zip');await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('GAME.BAT');await page.locator('#simple-conflicts').check();await page.locator('#simple-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 const patch=(await catalog(page)).profiles.find((p:any)=>p.kind==='patch');expect(patch.baseId).toBe(base.baseId);expect(patch.music.packId).toBe(base.music.packId);
 await run(page);await page.locator('#canvas').focus();await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('NO SAVE');await stop(page);
 if(!await page.locator('#mode-manage').isVisible())await page.locator('#choose-profile').click();await page.locator('#mode-manage').click();await page.locator('#mode-standalone').click();await upload(page,await files(),'standalone.zip');await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 const prior=await catalog(page);expect(prior.profiles).toHaveLength(3);expect(prior.saves.find((s:any)=>s.profileId===base.id).files['TEST.SAV']).toBeTruthy();
 await page.reload();await expect(page.locator('body')).toHaveAttribute('data-build-audience','public');expect(await catalog(page)).toEqual(prior);await expect(page.locator('#play-engine')).toHaveValue('phase9-7');
 await context.setOffline(true);await page.reload();await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await run(page);await stop(page);expect(errors).toEqual([]);
});

test('public handlers reject diagnostics even after DOM tampering; ordinary settings retain CPU',async({page})=>{
 await boot(page);await register(page);const before=await catalog(page);let downloads=0,workers=0;page.on('download',()=>downloads++);page.on('worker',()=>workers++);
 for(const id of ['boot-open','boot-start','inspect-profile','export-diagnostics','run-diagnostics','run-performance','demo','raw-preview','raw-stop','speed-toggle']){
  await page.locator('#'+id).evaluate((e:HTMLButtonElement)=>{e.disabled=false;e.hidden=false;e.click();});await expect(page.locator('#status')).toContainText('개발 빌드');
 }
 await page.locator('#import-diagnostics').evaluate((e:HTMLButtonElement)=>e.click());await expect(page.locator('#simple-progress-text')).toContainText('개발 빌드');
 expect(downloads).toBe(0);expect(workers).toBe(0);expect(await page.locator('#scene-capture').count()).toBe(0);await expect(page.locator('#boot-dialog')).not.toBeVisible();expect(await catalog(page)).toEqual(before);
 await page.locator('#game-settings').click();await page.locator('#cycles').evaluate((e:HTMLInputElement)=>e.value='99000');await page.locator('#prelude').evaluate((e:HTMLInputElement)=>e.value='cycles max');await page.locator('#settings-form').evaluate((e:HTMLFormElement)=>e.requestSubmit());await expect(page.locator('#settings-dialog')).not.toBeVisible();expect((await catalog(page)).profiles[0].settings).toEqual(before.profiles[0].settings);
 await run(page);await stop(page);
});

test('folder-only registration gives extraction instructions and no diagnostic download',async({page})=>{
 await boot(page);await page.locator('#simple-import').click();await expect(page.locator('#simple-heading')).toHaveText('원본 게임 등록');expect(await page.locator('select#simple-kind').count()).toBe(0);await expect(page.locator('#import-diagnostics')).not.toBeVisible();
 expect(await page.locator('#simple-zip').count()).toBe(0);await expect(page.locator('#simple-import-dialog')).toContainText('압축파일을 먼저 해제한 뒤');await upload(page,{'game.zip':strToU8('compressed placeholder')});await expect(page.locator('#simple-progress-text')).toContainText('압축파일');expect((await catalog(page)).profiles).toHaveLength(0);await expect(page.locator('#simple-progress-text')).not.toContainText('Error');
});

test('nested distribution folder confirmation, ISO deferral, RAW and actual DOS execution',async({page})=>{
 await boot(page);await page.locator('#simple-import').click();
 const data=await files(),nested:Record<string,Uint8Array>={'DOSBOX/LAUNCH.EXE':strToU8('not a DOS game'),'ED4/ED4.iso':strToU8('not mounted')};
 for(const [path,bytes] of Object.entries(data))nested['ED4/'+path]=bytes;
 await upload(page,nested,'doogi');await expect(page.locator('#simple-folder-choice')).toBeVisible();await expect(page.locator('#simple-folder-root')).toHaveValue('ED4');
 await expect(page.locator('#simple-folder-summary')).toContainText('ISO 음악은 중복 저장하지');await expect(page.locator('#simple-folder-summary')).toContainText('중복 저장하지');expect((await catalog(page)).profiles).toHaveLength(0);
 await page.screenshot({path:root+'/after/nested-folder.png'});await page.locator('#simple-folder-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 const stored=await catalog(page);expect(stored.profiles[0].music).toBeTruthy();expect(stored.profiles[0].executable).toBe('GAME.BAT');expect(Object.keys(stored.archives[0].files)).not.toContain('ED4.ISO');expect(Object.keys(stored.archives[0].files).some(p=>p.includes('LAUNCH'))).toBe(false);
 await normal97(page);await run(page);await stop(page);const beforeReload=await catalog(page);await page.reload();expect(await catalog(page)).toEqual(beforeReload);await run(page);await stop(page);
});

test('multiple nested games require explicit selection; cancel preserves registered profiles',async({page})=>{
 await boot(page);await register(page);const before=await catalog(page);await page.locator('#simple-import').click();
 const nested:Record<string,Uint8Array>={};for(const dir of ['A','B'])for(const [path,data]of Object.entries(await files()))nested[dir+'/'+path]=data;
 await upload(page,nested,'collection');await expect(page.locator('#simple-folder-choice')).toBeVisible();await page.locator('#simple-folder-root').selectOption('B');await expect(page.locator('#simple-folder-summary')).toContainText('포함하지 않습니다');await page.locator('#simple-cancel').click();expect(await catalog(page)).toEqual(before);
 await page.locator('#simple-import').click();await upload(page,nested,'collection');await page.locator('#simple-folder-root').selectOption('B');await page.locator('#simple-folder-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();const after=await catalog(page);expect(after.profiles).toHaveLength(2);expect(after.profiles.find((p:any)=>p.id===before.profiles[0].id)).toEqual(before.profiles[0]);expect(after.profiles.some((p:any)=>p.name==='B')).toBe(true);
});

test('unsupported folder capability and old Android Chrome show explicit guidance',async({browser})=>{
 for(const unsupported of ['capability','old-android']){
  const context=await browser.newContext(unsupported==='old-android'?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'}:{});const page=await context.newPage();
  if(unsupported==='capability')await page.addInitScript(()=>{delete (HTMLInputElement.prototype as any).webkitdirectory;});
  await boot(page);await page.locator('#simple-import').click();await expect(page.locator('#simple-folder')).toBeDisabled();await expect(page.locator('#simple-progress-text')).toContainText('최신 Chrome');expect(await page.locator('#simple-zip').count()).toBe(0);expect((await catalog(page)).profiles).toHaveLength(0);await context.close();
 }
});

test('flat file result is rejected without damaging an existing registration',async({page})=>{
 await boot(page);await register(page);const before=await catalog(page);await page.locator('#simple-import').click();
 await page.locator('#simple-folder').evaluate((input:HTMLInputElement)=>{const transfer=new DataTransfer();transfer.items.add(new File(['no directory metadata'],'GAME.BAT'));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});
 await expect(page.locator('#simple-progress-text')).toContainText('이 환경에서는 게임 폴더를 선택할 수 없습니다');expect(await catalog(page)).toEqual(before);await page.locator('#simple-cancel').click();await run(page);await stop(page);
});

for(const [w,h] of [[832,384],[844,390],[1280,720],[1440,1000],[390,844]])test(`public screens ${w}x${h}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<900,isMobile:w<900});const page=await context.newPage();const dir=root+'/after';await mkdir(dir,{recursive:true});await boot(page);
 await page.screenshot({path:`${dir}/${w}-empty.png`,fullPage:true});await page.locator('#simple-import').click();await page.screenshot({path:`${dir}/${w}-import.png`});await expect(page.locator('#simple-heading')).toHaveText('원본 게임 등록');
 for(const selector of ['#simple-cancel','.file-drop']){for(const el of await page.locator('#simple-import-dialog '+selector).all()){const b=(await el.boundingBox())!;expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);}}
 const nested:Record<string,Uint8Array>={'ED4.iso':strToU8('deferred disc')};for(const [path,data]of Object.entries(await files()))nested['ED4/'+path]=data;
 await upload(page,nested,'distribution');await expect(page.locator('#simple-folder-root')).toHaveValue('ED4');await expect(page.locator('#simple-folder-summary')).toContainText('중복 저장하지');
 await page.locator('#simple-folder-confirm').scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/${w}-folder-choice.png`});const bounds=(await page.locator('#simple-folder-confirm').boundingBox())!;expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(h);await page.locator('#simple-folder-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await page.screenshot({path:`${dir}/${w}-ready.png`,fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('#trial-k')).not.toBeVisible();
 if(!await page.locator('#mode-manage').isVisible())await page.locator('#choose-profile').click();await page.locator('#mode-manage').click();await page.screenshot({path:`${dir}/${w}-modes.png`});await page.locator('#mode-close').click();await page.locator('#game-settings').click();await page.screenshot({path:`${dir}/${w}-settings.png`});await page.locator('[data-close=settings-dialog]').click();await normal97(page);await run(page);
 if(!((await page.locator('#play-area').getAttribute('class'))??'').includes('immersive'))await page.locator('#fullscreen').click();await page.screenshot({path:`${dir}/${w}-play.png`});await expect(page.locator('#canvas')).toHaveCSS('object-fit','contain');await expect(page.locator('#speed-toggle')).not.toBeVisible();
 await menu(page);await page.screenshot({path:`${dir}/${w}-menu.png`});await page.locator('#play-ui-open').click();await page.screenshot({path:`${dir}/${w}-controls.png`});await page.locator('#play-ui-close').click();await stop(page);await context.close();
});
