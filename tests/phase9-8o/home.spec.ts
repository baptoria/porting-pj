import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {unzipSync,strToU8} from 'fflate';
import {folderFixture} from '../folder-fixture';

for(const [width,height] of [[832,384],[844,390],[1280,720],[1440,1000],[390,844]])test(`compact public home ${width}x${height}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height},isMobile:width<900,hasTouch:width<900});
 // Legacy v1 engine choice remains stored; default ordinary speed is now available.
 await context.addInitScript(()=>localStorage.setItem('ed4-play-engine-v1','phase9-7'));
 const page=await context.newPage();page.on('dialog',d=>void d.accept());
 await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await mkdir('artifacts/phase9-8o/after',{recursive:true});
 await expect(page.locator('#choose-profile')).toBeDisabled();await expect(page.locator('#game-settings')).toBeDisabled();
 await expect(page.locator('#play')).toBeHidden();await expect(page.locator('#simple-import')).toHaveText('게임 등록');
 await page.screenshot({path:`artifacts/phase9-8o/after/${width}-empty.png`,fullPage:true});
 await page.locator('#simple-import').click();await expect(page.locator('#simple-heading')).toHaveText('원본 게임 등록');
 expect(await page.locator('#simple-zip').count()).toBe(0);
 await page.locator('#simple-folder').setInputFiles(await folderFixture({...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':strToU8('ED4TEST.COM\r\n')},'my-game'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await expect(page.locator('#play')).toBeEnabled();await expect(page.locator('#play-engine')).toHaveValue('phase9-8k');
 await expect(page.locator('#play-engine')).not.toBeVisible();await expect(page.locator('#trial-k')).not.toBeVisible();
 await expect(page.locator('#public-games')).not.toBeVisible();await expect(page.locator('#advanced-settings')).not.toBeVisible();
 for(const id of ['play','simple-import','choose-profile','game-settings','launcher-controls','launcher-advanced']){
  const bounds=(await page.locator('#'+id).boundingBox())!;expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(height);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`artifacts/phase9-8o/after/${width}-ready.png`,fullPage:true});
 await page.locator('#choose-profile').click();await expect(page.locator('#choose-profile')).toHaveAttribute('aria-expanded','true');
 await expect(page.locator('#mode-manage')).toBeEnabled();await page.locator('#mode-manage').click();await expect(page.locator('#mode-manager')).toBeVisible();await page.locator('#mode-close').click();
 await page.locator('#profiles button').first().click();await expect(page.locator('#public-games')).not.toBeVisible();
 await page.locator('#game-settings').click();await expect(page.locator('#play-engine')).toBeVisible();await expect(page.locator('#play-engine')).toHaveValue('phase9-8k');
 await page.locator('[data-close=settings-dialog]').click();
 await page.locator('#launcher-controls').click();await expect(page.locator('#play-ui-close')).toBeVisible();await page.locator('#play-ui-close').click();
 await page.locator('#launcher-advanced').click();for(const id of ['backup','restore','recovery-open','storage-open','music-folder'])await expect(page.locator('#'+id)).toBeAttached();
 await expect(page.locator('#backup')).toBeVisible();await expect(page.locator('#boot-open')).not.toBeVisible();
 await page.reload();await expect(page.locator('#play-engine')).toHaveValue('phase9-8k');await expect(page.locator('#play')).toBeEnabled();
 await context.close();
});
