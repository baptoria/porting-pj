import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {memoryProbe} from '../../scripts/phase9-5b-probe.mjs';
const app='/porting-pj/ed4/';
for(const variant of ['phase9-4','phase9-5b'])for(const mode of [3,7,19])test(`${variant} public 468-byte copy RETF mode ${mode}`,async({page},info)=>{
 const dir=`artifacts/${variant}/engines/instrumented`,wasm=await readFile(`${dir}/wdosbox.wasm`),js=await readFile(`${dir}/wdosbox.js`);
 await page.route('**/vendor/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:wasm}));
 await page.route('**/vendor/wdosbox.js',r=>r.fulfill({contentType:'text/javascript',body:js}));
 await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':memoryProbe(mode)}))}));
 page.on('dialog',d=>void d.accept());await page.goto(app);await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();
 const succeeds=mode===19||(mode===3&&variant==='phase9-5b');
 await expect(page.locator('#logs')).toContainText(succeeds?'PUBLIC_468_COPY_AND_RETF_OK':'PUBLIC_APERTURE_READBACK_MISMATCH');
 const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const report=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
 expect(report.engine.runtimeErrors.events).toEqual([]);expect(report.engine.frames).toBeGreaterThan(0);
 await writeFile(info.outputPath('result.json'),JSON.stringify({variant,mode,wasmSha256:createHash('sha256').update(wasm).digest('hex'),succeeds,report},null,2));await page.locator('#stop').click();
});
