import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
import {memoryProbe} from '../../scripts/phase9-5b-probe.mjs';
import {BGM_BOUNDARY_ENGINE} from '../../src/generated/phase9-8d-engine';
for(const mode of [3,7,19])test(`event observer preserves VGA aperture and RETF mode ${mode}`,async({page})=>{
 await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':memoryProbe(mode)}))}));
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');
 await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-8d');await page.locator('#boot-start').click();
 await expect(page.locator('#logs')).toContainText(mode===7?'PUBLIC_APERTURE_READBACK_MISMATCH':'PUBLIC_468_COPY_AND_RETF_OK');
 const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const report=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
 expect(report.engine.artifact.wasmSha256).toBe(BGM_BOUNDARY_ENGINE.wasmSha256);expect(report.engine.runtimeErrors.events).toEqual([]);expect(report.engine.cpuHistory.enabled).toBe(false);await page.locator('#stop').click();
});
