import {test,expect,Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strToU8,unzipSync} from 'fflate';
import {folderFixture} from '../folder-fixture';
import {menu,stop} from '../phase9-8i/helpers';
async function state(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>(resolve=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>resolve(q.result);});const result:any={};
 for(const n of ['profiles','archives','saves','recovery'])result[n]=await new Promise(resolve=>{const q=db.transaction(n).objectStore(n).getAll();q.onsuccess=()=>resolve(q.result);});db.close();
 return JSON.parse(JSON.stringify(result,(_,v)=>v instanceof Uint8Array?Array.from(v):v));
});}
async function select(page:Page,id:string){await page.locator('#game-settings').click();await page.locator('#play-engine').selectOption(id);await page.locator('[data-close=settings-dialog]').click();}
async function setup(page:Page){
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('ED4TEST.COM\r\n'),'ED4-01.RAW':strToU8('RAWTEST1\0\0\0\0')},'ordinary-k'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await select(page,'phase9-8k');
}
async function run(page:Page){await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.locator('#fullscreen').click();}
async function key(page:Page,k:string,log:string){await page.locator('#canvas').focus();await page.keyboard.press(k);await expect(page.locator('#logs')).toContainText(log);}
test('ordinary K saves at 2x, native ACK switches, deletions, backup restore and 9-7 interchange offline',async({page,context})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.acks=[];const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(e.data?.name==='ed4-speed-response')w.acks.push(e.data.props);});}};
 });
 await setup(page);const original=await state(page);await run(page);await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');
 for(const rate of [2,1,2]){await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(rate===2));await expect(page.locator('#speed-toggle')).toBeEnabled();}
 const acks=await page.evaluate(()=>(window as any).acks);for(const rate of [1,2])expect(acks.some((x:any)=>x.ok&&x.engine==='phase9-8k'&&x.rate===rate)).toBe(true);
 await key(page,'m','RAW READ AND SEEK OK');await key(page,'s','SAVE WRITTEN');await stop(page);
 let saved=await state(page);expect(saved.saves[0].files['TEST.SAV']).toBeTruthy();expect(saved.archives).toEqual(original.archives);expect(saved.profiles).toEqual(original.profiles);
 await page.locator('#launcher-advanced').click();const download=page.waitForEvent('download');await page.locator('#backup').click();const zip=await readFile((await(await download).path())!);
 const files=unzipSync(zip);expect(files['FILES/TEST.SAV']).toBeTruthy();expect(Object.keys(files).some(p=>/\.(RAW|COM)$/.test(p))).toBe(false);
 await context.setOffline(true);await page.reload();await expect(page.locator('#play-engine')).toHaveValue('phase9-8k');await run(page);
 await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');await key(page,'l','ED4_SAVE_OK');await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await key(page,'d','SAVE DELETED');await stop(page);
 saved=await state(page);expect(saved.saves[0].tombstones).toContain('TEST.SAV');await run(page);await key(page,'l','NO SAVE');await stop(page);
 await page.locator('#launcher-advanced').click();await page.locator('#restore-file').setInputFiles({name:'backup.zip',mimeType:'application/zip',buffer:zip});await expect(page.locator('#status')).toContainText('백업을 복원');
 expect((await state(page)).recovery.some((p:any)=>p.kind==='before-restore')).toBe(true);
 await select(page,'phase9-7');await run(page);await expect(page.locator('#speed-toggle')).toBeVisible();await expect(page.locator('#speed-toggle')).toBeDisabled();await key(page,'l','ED4_SAVE_OK');await stop(page);
 await select(page,'phase9-8k');await run(page);await key(page,'l','ED4_SAVE_OK');await stop(page);expect((await state(page)).archives).toEqual(original.archives);
 const baseSave=(await state(page)).saves[0];
 await page.locator('#choose-profile').click();await page.locator('#mode-manage').click();await page.locator('#mode-patch').click();
 await page.locator('#simple-folder').setInputFiles(await folderFixture({'MOD.DAT':strToU8('user patch')},'patch'));
 // This patch adds a new path, so registration needs no conflict confirmation.
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await run(page);await key(page,'l','NO SAVE');await key(page,'s','SAVE WRITTEN');await stop(page);
 const modes=await state(page);expect(modes.profiles).toHaveLength(2);expect(modes.saves.find((s:any)=>s.profileId===baseSave.profileId)).toEqual(baseSave);
});

test('ordinary K periodic checkpoint persists while 2x stays active in a landscape viewport',async({page},info)=>{
 await page.setViewportSize({width:844,height:390});
 await page.addInitScript(()=>{const w=window as any;w.acks=[];const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(e.data?.name==='ed4-speed-response')w.acks.push({...e.data.props,at:performance.now()});});}};});
 await setup(page);await run(page);await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await key(page,'s','SAVE WRITTEN');
 await expect.poll(async()=>!!(await state(page)).saves[0]?.files['TEST.SAV'],{timeout:35000,intervals:[1000]}).toBe(true);
 await expect(page.locator('#run-state')).toHaveText('실행 중');await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#speed-toggle')).toBeEnabled();
 const rate=await page.evaluate(()=>{const rows=(window as any).acks.filter((x:any)=>x.ok&&x.rate===2),a=rows[0],b=rows.at(-1);return {seconds:(b.at-a.at)/1000,ticksPerSecond:(b.guestTicks-a.guestTicks)/(b.at-a.at)*1000};});
 expect(rate.seconds).toBeGreaterThan(20);expect(rate.ticksPerSecond).toBeGreaterThan(1800);expect(rate.ticksPerSecond).toBeLessThan(2200);
 await page.screenshot({path:'artifacts/phase9-8o-followup/ordinary-k-2x.png'});await (await import('node:fs/promises')).writeFile(info.outputPath('checkpoint-speed.json'),JSON.stringify(rate,null,2));
 await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');await stop(page);
});
test('missing native snapshot list refuses save and keeps K running; retry commits exact data',async({page})=>{
 await page.addInitScript(()=>{const w=window as any;const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(w.dropManifest&&e.data?.name==='ws-persist')delete e.data.props.ed4Snapshot;});}};});
 await setup(page);await run(page);await key(page,'s','SAVE WRITTEN');await stop(page);const before=await state(page);
 await run(page);await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await key(page,'d','SAVE DELETED');
 await page.evaluate(()=>(window as any).dropManifest=true);await menu(page);await page.locator('#stop').click();await expect(page.locator('#status')).toContainText('파일 목록');await expect(page.locator('#run-state')).toHaveText('실행 중');
 const failed=await state(page);expect(failed.saves).toEqual(before.saves);expect(failed.recovery).toEqual(before.recovery);
 await page.evaluate(()=>(window as any).dropManifest=false);await stop(page);expect((await state(page)).saves[0].tombstones).toContain('TEST.SAV');
});
