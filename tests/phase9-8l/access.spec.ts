import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {unzipSync} from 'fflate';
import {register,stop,text} from '../phase9-8i/helpers';
test('scene records and diagnostics remain accessible after stop through advanced tools',async({page})=>{
 await register(page,{...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':text('ED4TEST.COM\r\n')});
 await page.locator('#choose-profile').click();await expect(page.locator('#profiles button').first()).toBeFocused();
 await page.locator('#trial-k').click();await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 await page.locator('#scene-panel').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#scene-capture').click();await expect(page.locator('#scene-status')).toContainText('1개 장면');
 await stop(page);await expect(page.locator('#run-diagnostics')).toBeVisible();await page.locator('#launcher-advanced').click();await expect(page.locator('#scene-panel')).toBeVisible();
 const pending=page.waitForEvent('download');await page.locator('#scene-download').click();const data=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
 expect(data.snapshots).toHaveLength(1);await expect(page.locator('#run-state')).toHaveText('종료됨');await expect(page.locator('#scene-status')).toContainText('수집 기록은 유지');
});
