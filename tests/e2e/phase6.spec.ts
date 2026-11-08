import {test,expect,type Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
import {createHash} from 'node:crypto';
const app='/porting-pj/ed4/';
const text=(s:string)=>new TextEncoder().encode(s);
async function ready(page:Page){page.on('dialog',d=>void d.accept());await page.goto(app);await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');}
async function fixture():Promise<Record<string,Uint8Array>>{return {...unzipSync(new Uint8Array(await readFile('public/test-program.zip'))),
 'GAME.BAT':text('@echo off\r\nCALL SOUND.BAT\r\nED4TEST.COM'),
 'SOUND.BAT':text('SET BLASTER=A220 I7 D1\r\nSOUNDRV.COM'),
 'SOUNDRV.COM':new Uint8Array([0xb8,0,0x4c,0xcd,0x21]), // Authored DOS terminate stub, not a game driver.
 'NOSOUND.BAT':text('@echo off\r\nED4TEST.COM')};}
async function upload(page:Page,files:Record<string,Uint8Array>,name='trace.zip'){
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name,mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('GAME.BAT');await page.locator('#simple-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
}
async function db(page:Page){return page.evaluate(()=>new Promise<any>((resolve,reject)=>{
 const r=indexedDB.open('ed4-mobile-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const d=r.result,tx=d.transaction(['archives','profiles','saves']),out:any={};
 for(const s of ['archives','profiles','saves']){const q=tx.objectStore(s).getAll();q.onsuccess=()=>out[s]=q.result;}
 tx.oncomplete=()=>{d.close();resolve(JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v));};};
}));}
async function json(page:Page,selector='#run-diagnostics'){
 const pending=page.waitForEvent('download');await page.locator(selector).click();return JSON.parse(await readFile((await(await pending).path())!,'utf8'));
}
async function advanced(page:Page){await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);}

test('temporary nested BAT trace identifies entered public program, captures screen and never changes original/save/profile',async({page},info)=>{
 await ready(page);await upload(page,await fixture());await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('실행 중');
 await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');await expect(page.locator('body')).not.toHaveClass(/busy/);const before=await db(page);
 await advanced(page);await page.locator('#boot-open').click();await expect(page.locator('#boot-analysis')).toContainText('SOUNDRV.COM');await expect(page.locator('#boot-start')).toBeEnabled();
 await page.locator('#boot-start').click();await expect(page.locator('#trace-status')).toContainText('ED4TEST.COM');
 const report=await json(page);expect(report.bootTrace.lastEntered.program).toBe('ED4TEST.COM');expect(report.bootTrace.returned).toBe(false);
 expect(report.bootTrace.events.some((e:any)=>e.phase==='AFTER')).toBe(true);expect(report.bootSettings.original).toEqual(report.bootSettings.comparison);
 const shot=page.waitForEvent('download');await page.locator('#screen-export').click();const png=await readFile((await(await shot).path())!);expect([...png.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);expect(png.length).toBeGreaterThan(1000);
 await writeFile(info.outputPath('trace-screen.png'),png);await writeFile(info.outputPath('boot-trace.json'),JSON.stringify(report.bootTrace,null,2));
 await page.locator('#canvas').focus();await page.keyboard.press('d');await expect(page.locator('#logs')).toContainText('SAVE DELETED');
 await page.locator('#stop').click();expect(await db(page)).toBe(before);
 // Compare only the NOSOUND BAT that actually exists, with an explicit ephemeral card setting.
 await page.setViewportSize({width:844,height:390});
 await page.locator('#boot-open').click();await page.locator('#boot-entry').selectOption('NOSOUND.BAT');await expect(page.locator('#boot-analysis')).not.toContainText('SOUNDRV.COM');
 await page.locator('#boot-sound').selectOption('none');await page.locator('#boot-start').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await expect(page.locator('#trace-status')).toContainText('ED4TEST.COM');
 await page.locator('#keyboard-toggle').click();await expect(page.locator('#virtual-keyboard')).toBeVisible();await page.locator('#keyboard-toggle').click();await expect(page.locator('#virtual-keyboard')).not.toBeVisible();
 await page.locator('#canvas').focus();await page.keyboard.press('q');await expect(page.locator('#trace-status')).toContainText('반환 확인');
 const second=await json(page);expect(second.bootSettings.comparison.sound).toBe('none');expect(second.bootSettings.original.sound).toBe('sb16');await page.locator('#stop').click();expect(await db(page)).toBe(before);
 await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.locator('#stop').click();
});

test('high expansion ZIP reports all measured phases, correct hash and persists diagnostics on reload',async({page},info)=>{
 test.setTimeout(120000);await ready(page);
 const f=await fixture();f['ED4-01.RAW']=new Uint8Array(32*1024*1024);f['ED4-01.RAW'].set(text('RAWTEST1'));
 const zip=Buffer.from(zipSync(f,{level:6}));await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'compressed.zip',mimeType:'application/zip',buffer:zip});
 await expect(page.locator('#simple-choice')).toBeVisible({timeout:60000});await page.locator('#simple-executable').selectOption('GAME.BAT');await page.locator('#simple-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await advanced(page);const report=await json(page,'#export-diagnostics'),trace=report.importTrace;
 expect(trace.status).toBe('committed');for(const stage of ['index','read','inflate','crc','fileSha','zipSha','opfs','musicDb','profileDb'])expect(trace.stages[stage]?.calls,stage).toBeGreaterThan(0);
 expect(trace.stages.zipSha.bytes).toBe(zip.length);expect(report.archives[0].identity.sha256).toBe(createHash('sha256').update(zip).digest('hex'));
 expect(trace.maxResponseGapMs).toBeLessThan(60000);expect(trace.stages.opfs.bytes).toBe(f['ED4-01.RAW'].length);
 expect(JSON.stringify(trace)).not.toMatch(/RAWTEST1|GAME\.BAT|C:\\/);await writeFile(info.outputPath('import-trace.json'),JSON.stringify(trace,null,2));
 await page.reload();await advanced(page);expect((await json(page,'#export-diagnostics')).importTrace.status).toBe('committed');
});

test('silenced Worker times out with exact pending phase and preserves registered data',async({page})=>{
 await ready(page);await upload(page,await fixture());const before=await db(page);
 // Fault injection only: do not wait 60 real seconds or alter production timeout.
 await page.clock.install();
 await page.evaluate(()=>{
  const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker {
   constructor(url:string|URL,options?:WorkerOptions){
    super(url,options);
    if(String(url).includes('source-worker')){
     this.terminate();
     this.postMessage=()=>{setTimeout(()=>this.onmessage?.call(this,new MessageEvent('message',{data:{operation:'zipSha'}})),10);};
    }
   }
  } as typeof Worker;
 });
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'stalled.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(await fixture()))});
 await page.clock.runFor(61000);
 await expect(page.locator('#simple-progress-text')).toContainText('응답 시간 초과');await expect(page.locator('#simple-progress-text')).toContainText('ZIP SHA-256');
 const report=await json(page,'#import-diagnostics');expect(report.trace.stage).toBe('zipSha');expect(report.trace.status).toBe('failed');expect(report.trace.maxResponseGapMs).toBeGreaterThanOrEqual(60000);
 await page.locator('#simple-cancel').click();expect(await db(page)).toBe(before);
});

test('RAW CRC failure reports CRC instead of cleanup and leaves existing registration intact',async({page})=>{
 await ready(page);await upload(page,await fixture());await expect(page.locator('body')).not.toHaveClass(/busy/);const before=await db(page);
 const f=await fixture();f['ED4-01.RAW']=new Uint8Array(1024);const bytes=Buffer.from(zipSync(f));
 for(let p=0;p<bytes.length-46;p++){
  if(bytes.readUInt32LE(p)!==0x02014b50)continue;
  const name=bytes.subarray(p+46,p+46+bytes.readUInt16LE(p+28)).toString();
  if(name==='ED4-01.RAW'){bytes.writeUInt32LE((bytes.readUInt32LE(p+16)^1)>>>0,p+16);break;}
 }
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'crc.zip',mimeType:'application/zip',buffer:bytes});
 await expect(page.locator('#simple-progress-text')).toContainText('CRC 불일치');await expect(page.locator('body')).not.toHaveClass(/busy/);
 const report=await json(page,'#import-diagnostics');expect(report.trace.stage).toBe('crc');expect(report.trace.failure).toBe('crc');expect(report.trace.pending).toBe(true);
 await page.locator('#simple-cancel').click();expect(await db(page)).toBe(before);
});
