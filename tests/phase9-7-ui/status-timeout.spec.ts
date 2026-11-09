import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('unresponsive read-only status query exports unknown, never a fresh zero',async({page})=>{
 await page.addInitScript(()=>{
  const Native=Worker;
  window.Worker=class extends Native{
   postMessage(message:any,options?:any){if(message?.name==='ed4-audio-status')return;super.postMessage(message,options);}
  };
 });
 await page.goto('/porting-pj/ed4/');page.on('dialog',d=>void d.accept());
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();
 await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');
 await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-7');await page.locator('#boot-start').click();
 await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();
 const data=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
 expect(data.engine.musicObservation).toEqual({source:'query-timeout-not-current',capturedAtMs:null});
 expect(data.engine.runtimeErrors.events).toEqual([]);
 await page.keyboard.press('ArrowUp');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');
 await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
});
