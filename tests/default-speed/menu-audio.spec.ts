import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {strToU8,unzipSync} from 'fflate';
import {folderFixture} from '../folder-fixture';
import {menu,stop} from '../phase9-8i/helpers';
test('developer two-point menu/LOAD export uses real K events and keeps game input alive',async({page})=>{
 await page.setViewportSize({width:844,height:390});page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 const probe=Buffer.from((await readFile('tests/fixtures/phase9-8d-probe.b64','utf8')).trim(),'base64');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('PROBE.COM\r\nED4TEST.COM\r\n'),'PROBE.COM':probe,'ED4-01.RAW':new TextEncoder().encode('RAWTEST1abcd'),'TEST.EFC':new TextEncoder().encode('EFCTEST1efgh')},'menu-metadata'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await expect(page.locator('#play-engine')).toHaveValue('phase9-8k');await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('BGM_PROBE_OK');await page.locator('#fullscreen').click();
 await menu(page);await page.locator('#scene-panel').evaluate(e=>(e as HTMLDetailsElement).open=true);
 await page.locator('#menu-audio-before').click();await expect(page.locator('#scene-status')).toContainText('1개 장면');
 await page.locator('#menu-audio-after').click();await expect(page.locator('#scene-status')).toContainText('2개 장면');await page.screenshot({path:'artifacts/default-speed/menu-comparison.png',fullPage:true});
 for(let n=0;n<2;n++){
  const wait=page.waitForEvent('download');await page.locator('#scene-download').click();const json=JSON.parse(await readFile((await(await wait).path())!,'utf8'));
  expect(json.menuAudio.status).toBe('two-observations');expect(json.menuAudio.menu.actualEngine).toBe('phase9-8k');expect(json.menuAudio.load.freshness).toBe('live-worker-query');expect(json.snapshots).toHaveLength(2);expect(json.snapshots[0].metadata.bgmCommands.int69Calls).toBeGreaterThan(0);expect(json.snapshots[0].metadata.bgmCommands.rawReads).toBeGreaterThan(0);expect(json.menuAudio.delta.int69).toBeGreaterThanOrEqual(0);expect(json.menuAudio.menu.slotState).toBe('unobserved');expect(json.menuAudio.load.audibleBgm).toBe('requires-user-observation');expect(new Set(json.snapshots.map((s:any)=>s.sessionId)).size).toBe(1);
 }
 await page.locator('#scene-panel').evaluate(e=>(e as HTMLDetailsElement).open=false);await page.locator('#player-menu').click();await page.locator('#canvas').focus();await page.keyboard.press('q');await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('ArrowUp');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');await stop(page);
});
