// Opt-in local original, isolated browser only. Screenshots stay in ignored artifacts.
import {test,expect} from '@playwright/test';
import {stop} from '../phase9-8i/helpers';
test('local public original load and field observation',async({page},info)=>{
 test.skip(!process.env.ED4_Q_LOCAL_FOLDER);page.on('dialog',d=>void d.accept());
 await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(process.env.ED4_Q_LOCAL_FOLDER!);await expect(page.locator('#simple-import-dialog')).not.toBeVisible({timeout:120000});
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('Now Loading...',{timeout:30000});await page.waitForTimeout(8000);
 const key=async(k:string)=>{await page.locator('#canvas').focus();await page.keyboard.press(k,{delay:150});};
 await key('Enter');await page.waitForTimeout(2500);await page.locator('#canvas').screenshot({path:info.outputPath('load-selection.png')});
 await key('Enter');await page.waitForTimeout(8000);await page.locator('#canvas').screenshot({path:info.outputPath('after-load.png')});
 await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');
 for(const k of ['ArrowRight','ArrowUp','Enter']){await key(k);await page.waitForTimeout(500);}
 await page.locator('#canvas').screenshot({path:info.outputPath('field-interaction.png')});
 await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#run-state')).toHaveText('실행 중');await stop(page);
});
