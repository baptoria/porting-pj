import {test,expect,type Page} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {folderFixture} from '../folder-fixture';
import {testProgram} from '../../scripts/test-program.mjs';
import {writeIsoFixture,rawTone} from '../../scripts/iso-fixture.mjs';
import {stop} from '../phase9-8i/helpers';
const bytes=(s:string)=>new TextEncoder().encode(s);
async function setup(page:Page){
 page.on('dialog',d=>void d.accept());
 await page.addInitScript(()=>{const w=window as any,Native=Worker;w.releaseTrace={acks:[],frames:0,audio:null,music:null,workerErrors:[]};window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{const r=w.releaseTrace;if(e.data?.name==='ed4-speed-response'&&r.acks.length<500)r.acks.push(e.data.props);if(e.data?.props?.ed4Snapshot?.music)r.music=e.data.props.ed4Snapshot.music;if(e.data?.name==='ws-update-lines')r.frames++;if(e.data?.name==='ed4-supply-stats'){const p=e.data.props;r.audio={frames:p.frames,packets:p.packets,sourceRate:p.sourceRate,signal:p.signal};}});this.addEventListener('error',e=>w.releaseTrace.workerErrors.push(e.message));}};});
 await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
}
async function profiles(page:Page){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const result=await new Promise<any[]>(r=>{const q=db.transaction('profiles').objectStore('profiles').getAll();q.onsuccess=()=>r(q.result);});db.close();return result;});}
test('public errors offer a minimal receipt while developer diagnostics remain blocked',async({page})=>{
 await setup(page);await expect(page.locator('#public-error-report')).toBeHidden();
 await page.locator('#export-diagnostics').evaluate((e:HTMLButtonElement)=>e.click());
 await expect(page.locator('#status')).toContainText('개발 빌드');await expect(page.locator('#public-error-report')).toBeVisible();
 const pending=page.waitForEvent('download');await page.locator('#public-error-report').click();const receipt=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
 expect(receipt.format).toBe('ed4-public-error');expect(receipt.buildId).toContain('9-8r-public');
 expect(Object.keys(receipt).sort()).toEqual(['at','buildId','category','format','note','stage','version']);
 expect(await profiles(page)).toEqual([]);await expect(page.locator('#boot-dialog')).toBeHidden();
});
async function folder(config:boolean){
 const ret=new Uint8Array([0xb8,0,0x4c,0xcd,0x21]),files:any={'ED4/GAME.BAT':bytes('@ECHO OFF\r\nLOGO.EXE\r\nSOUNDRV.COM\r\nDRIVER.EXE ED4.EXE\r\nSOUNDRV.COM/U\r\n@ECHO ON'),'ED4/LOGO.EXE':ret,'ED4/ED4.EXE':ret,'ED4/SOUNDRV.COM':ret,'ED4/LOADER.COM':Buffer.from((await readFile('tests/fixtures/phase9-8q-cd-probe.b64','utf8')).trim(),'base64'),'ED4/DRIVER.EXE':testProgram(['D:\\ED4\\EFFECT\\ED4-01.RAW'],false)};
 if(config){files['DosBox/autoexec.conf']=bytes('[NEW]\nCD ED4\nLOADER.COM\nGAME.BAT');files['DosBox/Settings.conf']=bytes('CD=1');}
 const root=await folderFixture(files,'release-dooky');await mkdir(join(root,'DosBox/CD'),{recursive:true});await writeIsoFixture(join(root,'DosBox/CD/ED4.iso'),{'ED4/EFFECT/ED4-01.RAW':rawTone()});return root;
}
for(const config of [true,false])test(`public automatic package config=${config}, ordinary speed and offline save`,async({page,context},info)=>{
 await setup(page);await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folder(config));await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 const p=(await profiles(page))[0];expect(p.settings.prelude).toBe('mount d . -t cdrom\nLOADER.COM');expect(p.music.prefix).toBe('ED4');expect(p.launch.presetId).toBe('ed4-dooky-directory-cd-experimental-v1');
 expect(await page.evaluate(()=>localStorage.getItem('ed4-dooky-registration-v1'))).toBeNull();
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await expect(page.locator('#logs')).toContainText('Q_CD_READONLY_OK');
 await expect(page.locator('#play-area')).not.toHaveClass(/immersive/);await expect(page.locator('#speed-toggle')).toBeVisible();await expect(page.locator('#speed-toggle')).toBeEnabled();
 for(const rate of [2,1]){await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(rate===2));await expect(page.locator('#speed-toggle')).toBeEnabled();}
 await page.screenshot({path:info.outputPath('normal-speed.png')});
 await page.locator('#canvas').focus();await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAW READ AND SEEK OK');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');
 await page.locator('#fullscreen').click();await expect(page.locator('#speed-toggle')).toBeVisible();await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');
 await stop(page);await context.setOffline(true);await page.reload();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');await page.locator('#canvas').focus();await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);
 await expect(page.locator('#run-diagnostics')).toBeHidden();await expect(page.locator('#boot-dialog')).toBeHidden();
});
for(const viewport of [{width:832,height:384},{width:844,height:390}])test(`touch speed and rotation ${viewport.width}`,async({browser},info)=>{
 const ctx=await browser.newContext({viewport,hasTouch:true,isMobile:true}),page=await ctx.newPage();await setup(page);
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({'GAME.BAT':bytes('TEST.COM\r\n'),'TEST.COM':testProgram([],false)},'generic'));await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 await expect(page.locator('#canvas')).toHaveCSS('object-fit','contain');await expect(page.locator('#speed-toggle')).toBeVisible();const rect=(await page.locator('#speed-toggle').boundingBox())!;expect(rect.width).toBeGreaterThanOrEqual(44);expect(rect.height).toBeGreaterThanOrEqual(44);expect(rect.x+rect.width).toBeLessThanOrEqual(viewport.width);
 await page.locator('#speed-toggle').tap();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await page.locator('#speed-toggle').tap();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');
 for(const selector of ['#direction-pad .up','#direction-pad .right','#confirm-key','#cancel-key']){await expect(page.locator(selector)).toBeVisible();await page.locator(selector).tap();}
 await page.screenshot({path:info.outputPath('touch-speed.png')});await page.setViewportSize({width:viewport.height,height:viewport.width});await expect(page.locator('#direction-pad .pressed')).toHaveCount(0);await page.setViewportSize(viewport);await stop(page);await ctx.close();
});
for(const omitConfig of [false,true])test(`actual public original, configs omitted=${omitConfig}`,async({page,context},info)=>{
 test.skip(!process.env.ED4_Q_LOCAL_FOLDER);await setup(page);
 if(omitConfig)await page.locator('#simple-folder').evaluate(input=>input.addEventListener('change',()=>{const i=input as HTMLInputElement,d=new DataTransfer();for(const f of Array.from(i.files??[]))if(!/\/DosBox\/(autoexec|Settings)\.conf$/i.test(f.webkitRelativePath))d.items.add(f);i.files=d.files;},{capture:true}));
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(process.env.ED4_Q_LOCAL_FOLDER!);await expect(page.locator('#simple-import-dialog')).not.toBeVisible({timeout:120000});const p=(await profiles(page))[0];expect(p.launch.presetId).toBe('ed4-dooky-directory-cd-experimental-v1');expect(p.music.prefix).toBe('ED4');
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('Now Loading...',{timeout:30000});await page.waitForTimeout(8000);await page.locator('#canvas').screenshot({path:info.outputPath('menu.png')});
 await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(1500);await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');
 if(omitConfig){await page.locator('#canvas').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await page.waitForTimeout(10000);await page.locator('#canvas').screenshot({path:info.outputPath('new-game.png')});for(let i=0;i<15;i++){await page.keyboard.press('Enter');await page.waitForTimeout(300);}await page.waitForTimeout(4000);await page.locator('#canvas').screenshot({path:info.outputPath('progress-observation.png')});}
 await stop(page);const trace=await page.evaluate(()=>(window as any).releaseTrace);expect(trace.acks.some((a:any)=>a.ok&&a.rate===2)).toBe(true);expect(trace.music.reads).toBeGreaterThan(0);expect(trace.audio.frames).toBeGreaterThan(0);expect(trace.workerErrors).toEqual([]);await writeFile(info.outputPath('runtime-metadata.json'),JSON.stringify(trace,null,2));
 await context.setOffline(true);await page.reload();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('Now Loading...',{timeout:30000});await page.waitForTimeout(4000);await page.locator('#canvas').screenshot({path:info.outputPath('offline.png')});await stop(page);
});
