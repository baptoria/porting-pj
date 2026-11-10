import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
async function ready(page:Page,deny=true){
 await page.addInitScript(({deny})=>{
  if(deny)Object.defineProperty(HTMLElement.prototype,'requestFullscreen',{value:()=>Promise.reject(Error('denied-test'))});
  if(deny)Object.defineProperty(screen.orientation,'lock',{value:()=>Promise.reject(Error('denied-test'))});
  localStorage.setItem('ed4-controls',JSON.stringify({size:'100',confirm:'340',cancel:'341',menu:'32',volume:'80'}));
  const Native=Worker;(window as any).keys=[];
  window.Worker=class extends Native{postMessage(message:any,options?:any){if(message?.name==='wc-add-key')(window as any).keys.push(message.props);super.postMessage(message,options);}};
 },{deny});
 await page.goto('/porting-pj/ed4/');page.on('dialog',d=>void d.accept());
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');
 await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-7');await page.locator('#boot-start').click();
 await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await expect(page.locator('#play-area')).toHaveClass(/immersive/);
}
const held=(page:Page)=>page.evaluate(()=>{const s=new Set<number>();for(const e of (window as any).keys)e.pressed?s.add(e.key):s.delete(e.key);return [...s].sort();});
async function menu(page:Page){if(!(await page.locator('#player-menu').getAttribute('aria-expanded')==='true'))await page.locator('#player-menu').click();}
test('real multi-touch: single direction, Enter/ESC holds, drag changes and cancellation',async({page,context},info)=>{
 await ready(page);await expect(page.locator('#direction-pad .up')).toHaveCSS('opacity','0.35');const joy=(await page.locator('#direction-pad .up').boundingBox())!,enter=(await page.locator('#confirm-key').boundingBox())!,esc=(await page.locator('#cancel-key').boundingBox())!;
 const cdp=await context.newCDPSession(page),p={x:joy.x+joy.width*.5,y:joy.y+joy.height*.5,id:1},q={x:enter.x+enter.width/2,y:enter.y+enter.height/2,id:2},r={x:esc.x+esc.width/2,y:esc.y+esc.height/2,id:3};
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await expect.poll(()=>held(page)).toEqual([265]);await expect(page.locator('#direction-pad .up')).toHaveCSS('opacity','0.65');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p,q]});await expect.poll(()=>held(page)).toEqual([257,265]);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p,q,r]});await expect.poll(()=>held(page)).toEqual([256,257,265]);
 await page.waitForTimeout(250);expect(await held(page)).toEqual([256,257,265]);
 const left=(await page.locator('#direction-pad .left').boundingBox())!;p.x=left.x+left.width/2;p.y=left.y+left.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p,q,r]});await expect.poll(()=>held(page)).toEqual([256,257,263]);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[p]});await expect.poll(()=>held(page)).toEqual([256,257]);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect.poll(()=>held(page)).toEqual([]);
 await expect(page.locator('#direction-pad .up')).not.toHaveClass(/pressed/);
 // All four keys, empty center release, and a second direction finger cannot
 // turn the virtual pad into a diagonal or leave ownership stuck.
 for(const [selector,code]of [['.up',265],['.left',263],['.right',262],['.down',264]] as const){
  const button=page.locator('#direction-pad '+selector),b=(await button.boundingBox())!;
  await button.dispatchEvent('pointerdown',{pointerId:10,clientX:b.x+b.width/2,clientY:b.y+b.height/2});await expect.poll(()=>held(page)).toEqual([code]);
  const other=page.locator('#direction-pad .right'),o=(await other.boundingBox())!;await other.dispatchEvent('pointerdown',{pointerId:11,clientX:o.x+o.width/2,clientY:o.y+o.height/2});await expect.poll(()=>held(page)).toEqual([code]);await other.dispatchEvent('pointerup',{pointerId:11});
  const pad=(await page.locator('#direction-pad').boundingBox())!;await page.locator('#direction-pad').dispatchEvent('pointermove',{pointerId:10,clientX:pad.x+pad.width/2,clientY:pad.y+pad.height/2});await expect.poll(()=>held(page)).toEqual([]);await button.dispatchEvent('pointercancel',{pointerId:10});
 }
 await page.screenshot({path:info.outputPath('landscape.png')});
 await menu(page);await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
});
test('rotation, blur, menu and visibility clear keys; safe fit/fill and isolated UI preferences',async({page},info)=>{
 await ready(page);const initial=await page.locator('#canvas').evaluate((e:HTMLCanvasElement)=>[e.width,e.height]);
 const legacy=await page.evaluate(()=>localStorage.getItem('ed4-controls'));
 const before=await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const stores:any={};for(const n of Array.from(db.objectStoreNames))stores[n]=await new Promise(r=>{const q=db.transaction(n).objectStore(n).getAll();q.onsuccess=()=>r(q.result);});db.close();return JSON.stringify(stores);
 });
 for(const event of ['blur','orientationchange','visibilitychange','ed4-release-input']){
  await page.locator('#canvas').focus();await page.keyboard.down('ArrowUp');await expect.poll(()=>held(page)).toEqual([265]);await page.evaluate(e=>(e==='visibilitychange'?document:window).dispatchEvent(new Event(e)),event);await expect.poll(()=>held(page)).toEqual([]);await page.keyboard.up('ArrowUp');
 }
 await page.locator('#canvas').focus();await page.keyboard.down('ArrowLeft');await page.setViewportSize({width:390,height:844});await expect.poll(()=>held(page)).toEqual([]);await page.keyboard.up('ArrowLeft');await expect(page.locator('#rotate-notice')).toBeVisible();
 await menu(page);await page.locator('#play-ui-open').click();await page.locator('#play-fit').selectOption('fill');await page.locator('#ui-joystickSize').fill('240');await page.locator('#ui-buttonSize').fill('120');await page.locator('#ui-swap').check();await page.locator('#ui-opacity').fill('45');
 await page.locator('#play-ui-close').click();await page.locator('#player-menu').click();
 for(const id of ['#direction-pad','#confirm-key','#cancel-key']){const r=(await page.locator(id).boundingBox())!;expect(r.x).toBeGreaterThanOrEqual(8);expect(r.y).toBeGreaterThanOrEqual(8);expect(r.x+r.width).toBeLessThanOrEqual(382.1);expect(r.y+r.height).toBeLessThanOrEqual(836.1);}
 expect(await page.locator('#canvas').evaluate((e:HTMLCanvasElement)=>[e.width,e.height])).toEqual(initial);await expect(page.locator('#canvas')).toHaveCSS('object-fit','fill');
 await expect(page.locator('#speed-toggle')).toBeDisabled();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','false');
 expect(await page.locator('#touch-controls button:visible').allTextContents()).toEqual(['↑','←','→','↓','ESCEsc','EnterEnter']);
 await menu(page);const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const data=JSON.parse(await readFile((await(await pending).path())!,'utf8'));expect(data.engine.audioOutput.adapter).toBe('mono-v1');expect(data.playUi.speed.rate).toBe(1);expect(data.playUi.speed.supported).toBe(false);await writeFile(info.outputPath('diagnostics.json'),JSON.stringify(data,null,2));
 await page.locator('#stop').click();
 const after=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const stores:any={};for(const n of Array.from(db.objectStoreNames))stores[n]=await new Promise(r=>{const q=db.transaction(n).objectStore(n).getAll();q.onsuccess=()=>r(q.result);});db.close();return JSON.stringify(stores);});expect(after).toBe(before);expect(await page.evaluate(()=>localStorage.getItem('ed4-controls'))).toBe(legacy);
 await page.reload();await page.locator('#launcher-controls').click();await expect(page.locator('#ui-opacity')).toHaveValue('45');await expect(page.locator('#play-fit')).toHaveValue('fill');await page.locator('#play-ui-reset').click();await expect(page.locator('#ui-opacity')).toHaveValue('35');await expect(page.locator('#play-fit')).toHaveValue('contain');
});

test('native fullscreen entry and exit keep the live DOS session',async({page},info)=>{
 await ready(page,false);await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('play-area');
 await page.screenshot({path:info.outputPath('native-fullscreen.png')});
 await menu(page);await page.locator('#immersive-close').click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement===null)).toBe(true);await expect(page.locator('#play-area')).not.toHaveClass(/immersive/);
 await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');await page.locator('#stop').click();
});
