import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const stage=process.env.ED4_VISUAL_STAGE??'after';
for(const [w,h]of [[832,384],[844,390],[1280,720],[1440,1000],[390,844]])test(`launcher and play ${w}x${h}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:w<900,isMobile:w<900});
 const page=await context.newPage();page.on('dialog',d=>void d.accept());
 const dir=`artifacts/phase9-8l/${stage}`;await mkdir(dir,{recursive:true});
 await page.goto('http://localhost:4173/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 if(stage==='after'){
  await expect(page.locator('#simple-import')).toBeVisible();await expect(page.locator('#play')).toBeDisabled();
  await page.locator('#launcher-controls').click();await expect(page.locator('#play-ui-dialog')).toBeVisible();await page.locator('#play-ui-close').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:`${dir}/${w}-empty.png`,fullPage:true});
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);
 await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=false);
 await page.screenshot({path:`${dir}/${w}-ready.png`,fullPage:true});
 if(stage==='after'){
  await page.locator('#choose-profile').click();await expect(page.locator('#profiles button').first()).toBeVisible();
  await page.locator('#game-settings').click();await expect(page.locator('#settings-dialog')).toBeVisible();await page.locator('[data-close=settings-dialog]').click();
  await page.locator('#launcher-advanced').click();await expect(page.locator('#boot-open')).toBeVisible();await expect(page.locator('#launcher-update')).toBeVisible();await expect(page.locator('#music-link')).toBeVisible();
  await page.screenshot({path:`${dir}/${w}-advanced.png`,fullPage:true});await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=false);
 }
 await page.locator('#play-engine').selectOption('phase9-7');await page.locator('#play').click();
 await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 if(!((await page.locator('#play-area').getAttribute('class'))??'').includes('immersive'))await page.locator('#fullscreen').click();
 await page.screenshot({path:`${dir}/${w}-play.png`});
 if(stage==='after'){
  await expect(page.locator('#canvas')).toHaveCSS('object-fit','contain');
  for(const selector of ['#direction-pad .up','#direction-pad .left','#direction-pad .right','#direction-pad .down','#confirm-key','#cancel-key','#player-menu','#speed-toggle']){
   const b=(await page.locator(selector).boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(w+1);expect(b.y+b.height).toBeLessThanOrEqual(h+1);
  }
  const left=(await page.locator('#direction-pad').boundingBox())!,right=(await page.locator('.action-pad').boundingBox())!;
  expect(left.x+left.width).toBeLessThanOrEqual(right.x);
 }
 await page.locator('#player-menu').click();await page.screenshot({path:`${dir}/${w}-menu.png`});
 await page.locator('#play-ui-open').click();await page.screenshot({path:`${dir}/${w}-controls.png`});
 await page.locator('#play-ui-close').click();await page.locator('#stop').click();
 await expect(page.locator('#run-state')).toHaveText('종료됨');await context.close();
});
