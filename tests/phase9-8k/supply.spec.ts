import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {fixture,full,tone} from './fixture';
import {trace,diagnostic,stop} from '../phase9-8i/helpers';
for(const id of ['phase9-8i','phase9-8k'])for(const cycles of ['12000','16000','24000','max']){
 test(`${id} ${cycles} 31s supply comparison`,async({page},info)=>{
  await fixture(page,cycles);await trace(page,id);await full(page);await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(1000);const before=await diagnostic(page);await page.locator('#run-performance').click();await page.locator('#player-menu').click();
  const start=performance.now();let n=0;while(performance.now()-start<31000)await tone(page,++n);
  const after=await diagnostic(page),s=after.engine.integratedSpeed;
  if(!s.fault){await page.locator('#player-menu').click();await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');}
  await page.waitForTimeout(3000);const restored=await diagnostic(page);await stop(page);
  await writeFile(info.outputPath('supply.json'),JSON.stringify({id,cycles,seconds:(performance.now()-start)/1000,before:before.engine,after:after.engine,restored:restored.engine},null,2));
  expect(after.engine.runtimeErrors.events).toEqual([]);expect(s.audio.droppedFrames).toBe(0);expect(s.audio.overflows).toBe(0);
  if(id==='phase9-8k'){
   expect(s.fault).toBeNull();expect(s.rate).toBe(2);if(cycles==='max')expect(s.control.last.cycles).toBeGreaterThan(1000);expect(s.audio.underflowFrames).toBe(0);
   expect(after.engine.performanceWindow.guestTicksPerWallSecond).toBeGreaterThan(1900);
   expect(after.engine.audioSupply.rateWindows.windows.some((r:any)=>r.rate===2&&r.pcmFramesPerSecond>42000)).toBe(true);
   expect(restored.engine.integratedSpeed.rate).toBe(1);
  }
 });
}
test.describe('mobile K',()=>{
 test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
 test('K mobile 120s, renderer CPU throttling, repeated rates and held direction',async({page,context},info)=>{
 await page.setViewportSize({width:844,height:390});const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await fixture(page,'16000');await trace(page,'phase9-8k');await full(page);
 const stages=[];let n=0;
 for(const [rate,ms]of [[1,5000],[2,120000],[1,5000],[2,5000],[1,5000]]){
  const d=await diagnostic(page);await page.locator('#player-menu').click();if(d.engine.integratedSpeed.rate!==rate)await page.locator('#speed-toggle').click();
  await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(rate===2));
  const start=performance.now();await page.keyboard.down('ArrowRight');
  while(performance.now()-start<ms)await tone(page,++n);
  await page.keyboard.up('ArrowRight');stages.push((await diagnostic(page)).engine);
 }
 await writeFile(info.outputPath('long.json'),JSON.stringify({throttle:'CDP renderer 4x; Worker CPU slowdown not assumed',stages},null,2));await stop(page);
 for(const s of stages){expect(s.integratedSpeed.fault).toBeNull();expect(s.runtimeErrors.events).toEqual([]);expect(s.integratedSpeed.audio.underflowFrames).toBe(0);expect(s.integratedSpeed.audio.droppedFrames).toBe(0);}
 expect(stages[1].audioSupply.rateWindows.totals['2'].ms).toBeGreaterThan(119000);
});

});
