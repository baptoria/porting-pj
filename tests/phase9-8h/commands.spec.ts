import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
test('real new WASM matches INT69 IRET and keeps 9-8D commands, offline, mono, and no CPU history',async({page,context},info)=>{
 const app='/porting-pj/ed4/';page.on('dialog',d=>void d.accept());await page.goto(app);await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8d-probe.b64','utf8')).trim(),'base64');
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-iret.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'ED4TEST.COM':program,'ED4-01.RAW':new TextEncoder().encode('RAWTEST1abcd'),'TEST.EFC':new TextEncoder().encode('EFCTEST1abcd')}))});await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.reload();await context.setOffline(true);await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-8h');await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('BGM_PROBE_OK');
 const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const d=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
 expect(d.engine.artifact.id).toBe('phase9-8h');expect(d.engine.artifact.verification).toBe('sha256-of-compiled-module');expect(d.engine.artifact.worker.bootstrap).toBe('ready');expect(d.engine.audioOutput.adapter).toBe('mono-v1');expect(d.engine.cpuHistory.enabled).toBe(false);expect(d.engine.runtimeErrors.events).toEqual([]);
 const b=d.engine.bgmCommands;expect(b.int69Returns).toEqual({matched:3,overflow:0,pending:0});expect(b.int69Calls).toBe(3);expect(b.int66Calls).toBe(707);
 const returns=b.events.filter((e:any)=>e.kind===5);expect(returns.map((e:any)=>[e.requestAx,e.requestBx])).toEqual([[9,7],[9,8],[10,8]]);for(const e of returns)expect(e.sequence).toBeGreaterThan(e.requestSequence);
 await page.locator('#scene-panel').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#scene-name').selectOption('필드');await page.locator('#scene-capture').click();await expect(page.locator('#scene-status')).toContainText('실제 phase9-8h');await expect(page.locator('#speed-toggle')).toBeEnabled();
 const scenesDownload=page.waitForEvent('download');await page.locator('#scene-download').click();const scenes=JSON.parse(await readFile((await(await scenesDownload).path())!,'utf8'));
 expect(scenes.requestedEngine).toBe('phase9-8h');expect(scenes.bgmLink.links[0]).toMatchObject({selection:7,returned:true,ownershipConfirmed:false});expect(scenes.bgmLink.mapping[0]).toMatchObject({selection:7,paths:['ED4-01.RAW'],permissionToPlay:false});expect(scenes.snapshots[0].scene).toBe('필드');await expect(page.locator('#run-state')).toHaveText('실행 중');await writeFile(info.outputPath('scenes.json'),JSON.stringify(scenes,null,2));
 await writeFile(info.outputPath('returns.json'),JSON.stringify(d,null,2));await page.locator('#canvas').focus();await page.keyboard.press('q');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
});
