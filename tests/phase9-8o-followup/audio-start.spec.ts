import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync,strToU8} from 'fflate';
import {folderFixture} from '../folder-fixture';
test('guest cannot consume an initial cue before delayed AudioContext resume; rejection preserves registration',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.audioGate={runs:0,ready:0,reject:false};
  const resume=AudioContext.prototype.resume;
  AudioContext.prototype.resume=function(){const ctx=this;
   return new Promise<void>((resolve,reject)=>{w.releaseAudio=async()=>{
    if(w.audioGate.reject){reject(new DOMException('synthetic autoplay refusal','NotAllowedError'));return;}
    await resume.call(ctx);w.audioGate.ready=performance.now();resolve();
   };});
  };
  const Native=Worker;window.Worker=class extends Native{postMessage(m:any,t?:any){if(m?.name==='wc-run'){w.audioGate.runs++;w.audioGate.runAt=performance.now();}super.postMessage(m,t);}};
 });
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');
 await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('ED4TEST.COM\r\n')},'audio-gate'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#game-settings').click();await page.locator('#play-engine').selectOption('phase9-7');await page.locator('[data-close=settings-dialog]').click();
 await page.locator('#play').click();await expect.poll(()=>page.evaluate(()=>typeof(window as any).releaseAudio)).toBe('function');
 await page.waitForTimeout(1800);expect(await page.evaluate(()=>(window as any).audioGate.runs)).toBe(0);
 await page.evaluate(()=>(window as any).releaseAudio());await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 const timing=await page.evaluate(()=>(window as any).audioGate);expect(timing.runAt).toBeGreaterThanOrEqual(timing.ready);
 await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 await page.evaluate(()=>{(window as any).audioGate.reject=true;});await page.locator('#play').click();await page.evaluate(()=>(window as any).releaseAudio());
 await expect(page.locator('#status')).toContainText('오디오');await expect(page.locator('#run-state')).toHaveText('시작 실패');
 expect(await page.evaluate(()=>(window as any).audioGate.runs)).toBe(1);await expect(page.locator('#play')).toBeEnabled();
});
