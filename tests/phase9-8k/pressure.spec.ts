import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {fixture,full,tone} from './fixture';
import {trace,diagnostic,stop} from '../phase9-8i/helpers';
// Public fixture only: external Worker scheduler contention, not game code.
test('K measured Worker 8ms/50ms contention during 2x public audio',async({page,browser},info)=>{
 await fixture(page,'16000');await trace(page,'phase9-8k');await full(page);
 const cdp=await browser.newBrowserCDPSession();const {targetInfos}=await cdp.send('Target.getTargets');
 const target=targetInfos.find(t=>t.type==='worker'&&t.url.includes('dos-worker-phase9-8k-'));expect(target).toBeTruthy();
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target!.targetId,flatten:false});
 let seq=0;
 async function evaluate(expression:string){const id=++seq;return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker probe response timeout')),5000);const handler=(e:any)=>{if(e.sessionId!==sessionId)return;const p=JSON.parse(e.message);if(p.id!==id)return;clearTimeout(timer);cdp.off('Target.receivedMessageFromTarget',handler);if(p.error||p.result.exceptionDetails)reject(Error(JSON.stringify(p)));else resolve(p.result.result.value);};cdp.on('Target.receivedMessageFromTarget',handler);cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}})}).catch(reject);});}
 await evaluate('globalThis.kPublicLoad={count:0,ms:0};globalThis.kPublicTimer=setInterval(()=>{const s=performance.now();while(performance.now()-s<8){};kPublicLoad.count++;kPublicLoad.ms+=performance.now()-s;},50);true');
 await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');
 const before=await diagnostic(page);await page.locator('#run-performance').click();await page.locator('#player-menu').click();let n=0;const start=performance.now();while(performance.now()-start<31000)await tone(page,++n);
 const load=await evaluate('clearInterval(kPublicTimer);kPublicLoad');const after=await diagnostic(page);
 await cdp.send('Target.detachFromTarget',{sessionId});await cdp.detach();await stop(page);
 await writeFile(info.outputPath('worker-load.json'),JSON.stringify({load,before:before.engine,after:after.engine},null,2));
 expect(load.count).toBeGreaterThan(500);expect(load.ms).toBeGreaterThan(4000);expect(after.engine.integratedSpeed.fault).toBeNull();expect(after.engine.integratedSpeed.rate).toBe(2);expect(after.engine.integratedSpeed.audio.underflowFrames).toBe(0);expect(after.engine.performanceWindow.guestTicksPerWallSecond).toBeGreaterThan(1900);
});
test('K max boot, temporary 16000 at 2x, then measured max-policy 1x recovery',async({page},info)=>{
 await fixture(page,'max');await trace(page,'phase9-8k',16000);await full(page);await page.waitForTimeout(2000);
 const stages=[];let n=0;
 for(const rate of [2,1]){
  await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(rate===2));
  const start=performance.now();while(performance.now()-start<31000)await tone(page,++n);
  stages.push((await diagnostic(page)).engine);await page.locator('#player-menu').click();
 }
 await writeFile(info.outputPath('policy-return.json'),JSON.stringify({stages},null,2));await stop(page);
 expect(stages[0].audioSupply.rateWindows.windows.some((w:any)=>w.rate===2&&w.workerIntervalMaxMs>0)).toBe(true);
 expect(stages[0].integratedSpeed.control.last.cycles).toBe(16000);expect(stages[0].integratedSpeed.control.last.cyclesAuto).toBe(0);expect(stages[1].integratedSpeed.control.last.cyclesAuto).toBe(1);
 for(const s of stages){expect(s.integratedSpeed.fault).toBeNull();expect(s.integratedSpeed.audio.underflowFrames).toBe(0);expect(s.runtimeErrors.events).toEqual([]);}
});
