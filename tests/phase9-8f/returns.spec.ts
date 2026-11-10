import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
test('matches post-IRET registers while excluding nested unrelated IRET',async({page},info)=>{
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8f-return-probe.b64','utf8')).trim(),'base64');
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-returns.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'ED4TEST.COM':program}))});await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-8f');await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('RETURN_PROBE_OK');
 const download=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const d=JSON.parse(await readFile((await(await download).path())!,'utf8'));
 expect(d.engine.bgmCommands.int69Returns).toEqual({matched:2,overflow:0,pending:0});
 const events=d.engine.bgmCommands.events.filter((e:any)=>e.kind===5);
 expect(events.map((e:any)=>[e.requestAx,e.requestBx,e.command])).toEqual([[10,9,0x1234],[9,10,0x1234]]);
 expect(d.engine.runtimeErrors.events).toEqual([]);await writeFile(info.outputPath('post-iret.json'),JSON.stringify(d,null,2));await page.locator('#stop').click();
});
