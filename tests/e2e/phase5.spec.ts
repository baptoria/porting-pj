import {test,expect,chromium,type Page} from '@playwright/test';
import {mkdir,writeFile,readFile,open} from 'node:fs/promises';
import {openSync,writeSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {zipSync,unzipSync,strFromU8,Zip,ZipPassThrough} from 'fflate';
const app='/porting-pj/ed4/';
const raw=()=>{const b=Buffer.alloc(12);b.write('RAWTEST1');return b;};
async function fixture(music=true,bat='@echo off\r\nED4TEST.COM\r\n'){
 const f=unzipSync(new Uint8Array(await readFile('public/test-program.zip')));
 f['Game.bat']=new TextEncoder().encode(bat);
 if(music){f['ed4-01.Raw']=raw();f['Effect/Fx.Raw']=new Uint8Array([1,2,3]);}
 return f;
}
async function ready(page:Page){page.on('dialog',d=>void d.accept());await page.goto(app);await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');}
async function start(page:Page){await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('실행 중',{timeout:30000});}
async function stop(page:Page){await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');}
async function save(page:Page){await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await stop(page);}
async function advanced(page:Page){if(await page.locator('#advanced-settings').getAttribute('open')===null)await page.locator('#settings-toggle').click();}
async function upload(page:Page,name:string,data:Record<string,Uint8Array>,kind='vanilla'){
 await page.locator('#simple-import').click();await page.locator('#simple-kind').selectOption(kind);
 await page.locator('#simple-zip').setInputFiles({name,mimeType:'application/zip',buffer:Buffer.from(zipSync(data,{mtime:new Date("2020-01-01T00:00:00Z")}))});
}
async function registered(page:Page,name:string){await expect(page.locator('#simple-import-dialog')).not.toBeVisible({timeout:60000});await expect(page.locator('#profile-title')).toHaveText(name);}
async function snapshot(page:Page){return page.evaluate(async()=>{
 const read=async(name:string,stores:string[])=>new Promise<any>((resolve,reject)=>{
  const request=indexedDB.open(name);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
   const db=request.result;if(!stores.every(s=>db.objectStoreNames.contains(s))){db.close();resolve({});return;}
   const tx=db.transaction(stores);const result:any={};for(const s of stores){const r=tx.objectStore(s).getAll();r.onsuccess=()=>result[s]=r.result;}
   tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>reject(tx.error);
  };
 });
 const data=await read('ed4-mobile-v1',['profiles','archives','saves']);const music=await read('ed4-music-v1',['packs']);
 return {profiles:data.profiles??[],archives:(data.archives??[]).map((a:any)=>({...a,files:Object.keys(a.files)})),saves:(data.saves??[]).map((s:any)=>({profileId:s.profileId,files:Object.fromEntries(Object.entries(s.files).map(([p,b])=>[p,Array.from(b as Uint8Array)]))})),packs:music.packs??[]};
});}
async function musicDirectories(page:Page){return page.evaluate(async()=>{
 try{const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('ed4-music');const names:string[]=[];for await(const name of (dir as any).keys())names.push(name);return names.sort();}catch{return [];}
});}
async function folder(path:string,data:Record<string,Uint8Array>){
 await mkdir(path,{recursive:true});for(const [name,b]of Object.entries(data)){const full=join(path,name);await mkdir(join(full,'..'),{recursive:true});await writeFile(full,b);}
}

test('one folder registration automatically stores body, EFFECT RAW and launch choice; offline one-click save restore',async({page,context},info)=>{
 await ready(page);await expect(page.locator('#advanced-settings')).not.toHaveAttribute('open');
 const dir=info.outputPath('folder-game');await folder(dir,await fixture());
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(dir);await registered(page,'folder-game');await page.screenshot({path:info.outputPath('simple-ready.png')});
 await expect(page.locator('#exe-label')).toHaveText('GAME.BAT');
 const data=await snapshot(page);expect(data.profiles).toHaveLength(1);expect(data.packs).toHaveLength(1);
 expect(data.archives[0].files.some((p:string)=>p.endsWith('.RAW'))).toBe(false);
 expect(data.archives[0].originalPaths['GAME.BAT']).toBe('Game.bat');
 expect(data.packs[0].tracks.map((t:any)=>t.originalPath).sort()).toEqual(['Effect/Fx.Raw','ed4-01.Raw']);
 expect(data.packs[0].tracks.find((t:any)=>t.path==='EFFECT/FX.RAW').size).toBe(3);expect(data.packs[0].tracks.find((t:any)=>t.path==='EFFECT/FX.RAW').previewCompatible).toBe(false);expect(data.profiles[0].music.packId).toBe(data.packs[0].id);expect(data.profiles[0].launch.source).toBe('analyzed-batch');
 await start(page);await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');await save(page);
 await expect(page.locator('#recent-save')).toContainText('저장');
 await context.setOffline(true);await page.reload();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);
 await advanced(page);const pending=page.waitForEvent('download');await page.locator('#backup').click();
 const backup=unzipSync(new Uint8Array(await readFile((await(await pending).path())!)));
 expect(Object.keys(backup).filter(p=>/RAW|EXE|COM/.test(p))).toEqual([]);expect(backup['FILES/TEST.SAV']).toBeDefined();
 await page.screenshot({path:info.outputPath('simple-folder.png')});
});

test('combined ZIP, patch folder and standalone switch with shared base/music and isolated saves',async({page},info)=>{
 await ready(page);await upload(page,'vanilla.zip',await fixture());await registered(page,'vanilla');await start(page);await save(page);
 const vanilla=(await snapshot(page)).profiles[0];
 const patch=info.outputPath('patch-a');await folder(patch,{'RESOURCE.DAT':new TextEncoder().encode('PATCH_RESOURCE')});
 await page.locator('#simple-import').click();await page.locator('#simple-kind').selectOption('patch');await page.locator('#simple-folder').setInputFiles(patch);
 await expect(page.locator('#simple-issues')).toContainText('RESOURCE.DAT');await expect(page.locator('#simple-confirm')).toBeDisabled();
 await page.locator('#simple-conflicts').check();await page.locator('#simple-confirm').click();await registered(page,'patch-a');
 await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('NO SAVE FILE');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1');await save(page);
 await upload(page,'standalone.zip',await fixture(false),'standalone');await registered(page,'standalone');await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('NO SAVE FILE');await save(page);
 const data=await snapshot(page);expect(data.profiles).toHaveLength(3);expect(data.saves).toHaveLength(3);
 const mod=data.profiles.find((p:any)=>p.kind==='patch');expect(mod.baseId).toBe(vanilla.baseId);expect(mod.music).toEqual(vanilla.music);expect(data.packs).toHaveLength(1);
 for(const p of data.profiles){await page.locator(`[data-profile="${p.id}"]`).click();await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);}
 await page.locator(`[data-profile="${mod.id}"]`).click();await advanced(page);await page.locator('#edit-profile').click();await page.locator('#remove-profile').click();
 const after=await snapshot(page);expect(after.profiles).toHaveLength(2);expect(after.saves).toHaveLength(3);expect(after.packs).toHaveLength(1);expect(after.archives.some((a:any)=>a.id===vanilla.baseId)).toBe(true);
});

test('ambiguous initialization is selected once and persists across a real browser process restart',async({},info)=>{
 const userData=info.outputPath('browser-data');let context=await chromium.launchPersistentContext(userData,{channel:'chrome',headless:true});
 try{
  let page=context.pages()[0];await ready(page);
  await upload(page,'once.zip',await fixture(true,'@echo off\r\nSET BLASTER=A220 I7 D1\r\nED4TEST.COM'));
  await expect(page.locator('#simple-analysis')).toContainText('처음 한 번');await page.locator('#simple-executable').selectOption('GAME.BAT');await page.locator('#simple-confirm').click();await registered(page,'once');
  await start(page);await save(page);const before=await snapshot(page);expect(before.profiles[0].launch.source).toBe('user-choice');
  await context.close();context=await chromium.launchPersistentContext(userData,{channel:'chrome',headless:true});page=context.pages()[0];await ready(page);
  await expect(page.locator('#profile-title')).toHaveText('once');await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
  await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1');await stop(page);
  expect((await snapshot(page)).profiles[0].launch).toEqual(before.profiles[0].launch);
 }finally{await context.close();}
});

test('missing driver and invalid ZIP give actions, and cancelling a pending choice removes only staged music',async({page})=>{
 await ready(page);await upload(page,'keep.zip',await fixture());await registered(page,'keep');await start(page);await save(page);
 const before=await snapshot(page),dirs=await musicDirectories(page);
 await upload(page,'missing.zip',await fixture(true,'SOUNDRV.COM\r\nED4TEST.COM'));
 await expect(page.locator('#simple-issues')).toContainText('누락: SOUNDRV.COM');await expect(page.locator('#simple-executable option[value="GAME.BAT"]')).toHaveJSProperty('disabled',true);
 await page.locator('#simple-cancel').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 expect(await musicDirectories(page)).toEqual(dirs);expect(await snapshot(page)).toEqual(before);
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'bad.zip',mimeType:'application/zip',buffer:Buffer.from('not a ZIP')});
 await expect(page.locator('#simple-progress-text')).toContainText('폴더');await expect(page.locator('#simple-progress-text')).toContainText('ZIP');
 await page.locator('#simple-cancel').click();expect(await snapshot(page)).toEqual(before);
});

test('commit quota failure and cancellation during RAW streaming preserve existing games and saves',async({page},info)=>{
 test.setTimeout(120000);await ready(page);await upload(page,'keep.zip',await fixture());await registered(page,'keep');await start(page);await save(page);
 const before=await snapshot(page),dirs=await musicDirectories(page);
 await page.evaluate(()=>{const original=navigator.storage.estimate.bind(navigator.storage);let calls=0;(window as any).restoreEstimate=()=>navigator.storage.estimate=original;navigator.storage.estimate=async()=>++calls>=2?{usage:0,quota:1}:original();});
 await upload(page,'quota.zip',await fixture());await expect(page.locator('#simple-progress-text')).toContainText('저장 공간이 부족');
 await page.locator('#simple-cancel').click();await page.evaluate(()=>(window as any).restoreEstimate());
 expect(await snapshot(page)).toEqual(before);expect(await musicDirectories(page)).toEqual(dirs);
 const dir=info.outputPath('cancel-folder');await folder(dir,await fixture(false));const handle=await open(join(dir,'ed4-01.Raw'),'w');
 try{const chunk=Buffer.alloc(1024*1024);chunk.write('RAWTEST1');for(let i=0;i<64;i++)await handle.write(chunk);}finally{await handle.close();}
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(dir);
 await expect(page.locator('#simple-progress-text')).toContainText('ed4-01.Raw');await page.locator('#simple-cancel').click();
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await expect(page.locator('body')).not.toHaveClass(/busy/);
 expect(await snapshot(page)).toEqual(before);expect(await musicDirectories(page)).toEqual(dirs);
 await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);
});

test('body deletion retains save and reconnect/backup recovery keeps one-click launch available',async({page},info)=>{
 await ready(page);const f=await fixture(true);const path=info.outputPath('body.zip');await writeFile(path,zipSync(f,{mtime:new Date("2020-01-01T00:00:00Z")}));
 await upload(page,'body.zip',f);await registered(page,'body');await start(page);await save(page);const before=await snapshot(page);await advanced(page);
 const download=page.waitForEvent('download');await page.locator('#backup').click();const backupPath=(await(await download).path())!;const backup=unzipSync(new Uint8Array(await readFile(backupPath)));
 expect(JSON.parse(strFromU8(backup['ED4-BACKUP.JSON'])).profile.launch.source).toBe('analyzed-batch');
 await page.locator('#storage-open').click();await page.locator('[data-delete-archive]').click();
 expect((await snapshot(page)).saves).toEqual(before.saves);await page.locator('[data-close="storage-dialog"]').click();await expect(page.locator('#recent-save')).toContainText('다시 연결');
 await page.locator('#play').click();await expect(page.locator('#status')).toContainText('다시 연결');
 await page.locator('#storage-open').click();const chooser=page.waitForEvent('filechooser');await page.locator('[data-relink]').click();await(await chooser).setFiles(path);
 await expect(page.locator('[data-delete-archive]')).toHaveCount(1);await page.locator('[data-close="storage-dialog"]').click();
 await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);
 const restoreChooser=page.waitForEvent('filechooser');await page.locator('#restore').click();await(await restoreChooser).setFiles(backupPath);await expect(page.locator('#status')).toContainText('백업을 복원');
 expect((await snapshot(page)).profiles[0].launch).toEqual(before.profiles[0].launch);
});

test('simple launch at mobile landscape keeps multitouch and settings out of the initial view',async({page},info)=>{
 await page.setViewportSize({width:844,height:390});await ready(page);await expect(page.locator('#advanced-settings')).not.toHaveAttribute('open');
 await upload(page,'mobile.zip',await fixture(false));await registered(page,'mobile');await start(page);
 await page.locator('.up').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true});await page.locator('#confirm-key').dispatchEvent('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:false});
 await page.locator('.up').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});await page.locator('#confirm-key').dispatchEvent('pointerup',{pointerId:2,pointerType:'touch'});
 await expect(page.locator('#logs')).toContainText('KEY RECEIVED');await page.screenshot({path:info.outputPath('simple-landscape.png')});await save(page);
 await advanced(page);await page.locator('#control-opacity').fill('65');await page.locator('#control-opacity').dispatchEvent('input');await page.reload();await expect(page.locator('#control-opacity')).toHaveValue('65');
 await start(page);await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await stop(page);
});

test('500 MiB synthetic combined ZIP streams RAW and retains bounded core without whole-ZIP buffer',async({page},info)=>{
 test.setTimeout(240000);await ready(page);
 const path=info.outputPath('synthetic-500m.zip'),fd=openSync(path,'w');let finished=false;
 try{
  const zip=new Zip((error,data,final)=>{if(error)throw error;writeSync(fd,data);finished ||= final;});
  for(const [name,data]of Object.entries(await fixture(false))){const file=new ZipPassThrough(name);zip.add(file);file.push(data,true);}
  const chunk=new Uint8Array(1024*1024);
  for(let n=0;n<4;n++){const file=new ZipPassThrough(`BODY${n}.DAT`);zip.add(file);for(let i=0;i<17;i++)file.push(chunk,i===16);}
  const musicChunk=chunk.slice();musicChunk.set(new TextEncoder().encode('RAWTEST1'));
  for(let n=1;n<=54;n++){const file=new ZipPassThrough(`ED4-${String(n).padStart(2,'0')}.RAW`);zip.add(file);for(let i=0;i<8;i++)file.push(i===0?musicChunk:chunk,i===7);}
  zip.end();expect(finished).toBe(true);
 }finally{closeSync(fd);}
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles(path);await registered(page,'synthetic-500m');
 const data=await snapshot(page);expect(data.packs[0].tracks).toHaveLength(54);expect(data.archives[0].size).toBeLessThan(69*1024*1024);
 await start(page);await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');await save(page);
 await advanced(page);const download=page.waitForEvent('download');await page.locator('#export-diagnostics').click();
 const diagnostic=JSON.parse((await readFile((await(await download).path())!)).toString());
 expect(diagnostic.appVersion).toBe('0.5.0');
 expect(diagnostic.music.every((p:any)=>p.tracks.every((t:any)=>!('header' in t)))).toBe(true);
 const metric=diagnostic.measurements.find((m:any)=>m.stage==='stream import');expect(metric.logicalBytes).toBeLessThan(70*1024*1024);
 expect(diagnostic.importTrace.status).toBe('committed');
 expect(diagnostic.importTrace.stages.zipSha.bytes).toBeGreaterThan(500*1024*1024);
 await writeFile(info.outputPath('large-zip-measurement.json'),JSON.stringify({scope:'Synthetic ZIP on PC Chrome; not actual ED4/Galaxy or process peak memory',metric,music:diagnostic.engine.music,importTrace:diagnostic.importTrace},null,2));
});

test('patch RAW overlays only matching paths, keeps shared music and protects packs used by another profile',async({page})=>{
 await ready(page);await upload(page,'music-base.zip',await fixture());await registered(page,'music-base');
 const base=(await snapshot(page)).profiles[0],changed=raw();changed.write('RAWTEST2');
 await upload(page,'music-patch.zip',{'ed4-01.Raw':changed},'patch');
 await expect(page.locator('#simple-issues')).toContainText('ED4-01.RAW');await page.locator('#simple-conflicts').check();await page.locator('#simple-confirm').click();await registered(page,'music-patch');
 const data=await snapshot(page),mod=data.profiles.find((p:any)=>p.kind==='patch');
 expect(mod.music.packId).toBe(base.music.packId);expect(mod.music.overlays).toHaveLength(1);expect(data.packs).toHaveLength(2);
 await start(page);await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST2 RAW READ AND SEEK OK');await save(page);
 await advanced(page);const download=page.waitForEvent('download');await page.locator('#backup').click();
 const backup=unzipSync(new Uint8Array(await readFile((await(await download).path())!)));
 expect(JSON.parse(strFromU8(backup['ED4-BACKUP.JSON'])).profile.music.overlays).toEqual(mod.music.overlays);
 expect(Object.keys(backup).some(p=>p.endsWith('.RAW'))).toBe(false);
 await page.locator('#music-pack').selectOption(mod.music.overlays[0].packId);await page.locator('#music-delete').click();await expect(page.locator('#status')).toContainText('연결을 먼저 해제');
 await page.locator(`[data-profile="${base.id}"]`).click();await start(page);await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');await stop(page);
 expect((await snapshot(page)).packs).toEqual(data.packs);
});
