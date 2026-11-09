import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test.use({serviceWorkers:'block'});
test('launcher WASM hash mismatch still rejects only the experiment, leaving normal engine available',async({page})=>{
 const bytes=Buffer.from(await readFile('public/vendor/experimental/phase9-8d/wdosbox.wasm'));bytes[bytes.length-1]^=1;
 await page.route('**/vendor/experimental/phase9-8d/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:bytes}));
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');
 await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-8d');await page.locator('#boot-start').click();await expect(page.locator('#run-state')).toHaveText('시작 실패');await expect(page.locator('#status')).toContainText('SHA-256 불일치');
 await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-7');await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.locator('#stop').click();
});
