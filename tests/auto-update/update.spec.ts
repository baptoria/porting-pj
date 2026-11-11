import {test,expect,Page,APIRequestContext} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {folderFixture} from '../folder-fixture';
import {testProgram} from '../../scripts/test-program.mjs';
import {rawTone} from '../../scripts/iso-fixture.mjs';
import {tempSaveProgram} from '../../scripts/temp-save-program.mjs';
import {menu,stop} from '../phase9-8i/helpers';
const base='/porting-pj/ed4/',current=JSON.parse(await readFile('docs/ed4/build-manifest.json','utf8')).build.id;
const devCurrent=JSON.parse(await readFile('docs/ed4-dev/build-manifest.json','utf8')).build.id;
async function release(r:APIRequestContext,version:string,fault='',app='ed4'){await r.post(`/__release?app=${app}&version=${version}&fault=${fault}`);}
async function wake(p:Page){await p.evaluate(()=>window.dispatchEvent(new Event('online')));}
async function loaded(p:Page,id:string){await expect.poll(()=>p.locator('#launcher-build').textContent(),{timeout:60000}).toMatch(new RegExp('현재 코드: '+id+'\\n'));await expect(p.locator('#offline')).toHaveText('오프라인 준비 완료');}
async function setup(p:Page,r:APIRequestContext){
 await release(r,'previous');p.on('dialog',d=>void d.accept());
 await p.addInitScript(()=>{sessionStorage.setItem('hf2-navs',String(Number(sessionStorage.getItem('hf2-navs')??0)+1));});
 await p.goto(base);await loaded(p,current+'-prior');
}
async function register(p:Page){await p.locator('#simple-import').click();await p.locator('#simple-folder').setInputFiles(await folderFixture({'GAME.BAT':new TextEncoder().encode('TEST.COM\r\n'),'TEST.COM':testProgram(['EFFECT\\A.RAW'],false),'EFFECT/A.RAW':rawTone()},'hf2-game'));await expect(p.locator('#simple-import-dialog')).not.toBeVisible();}
async function state(p:Page){return p.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((r,j)=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});const out:any={};for(const name of ['archives','profiles','saves','recovery'])out[name]=await new Promise(r=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>r(q.result);});db.close();
 out.raw={};async function walk(d:any,path:string){for await(const [n,h]of d.entries())if(h.kind==='directory')await walk(h,path+'/'+n);else out.raw[path+'/'+n]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await h.getFile()).arrayBuffer())));}await walk(await navigator.storage.getDirectory(),'');out.preferences=localStorage.getItem('ed4-controls-v1');return JSON.parse(JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v));
});}
async function run(p:Page){await p.locator('#play').click();await expect(p.locator('#logs')).toContainText('ED4 TEST READY');}
async function key(p:Page,k:string,text:string){await p.locator('#canvas').focus();await p.keyboard.press(k);await expect(p.locator('#logs')).toContainText(text);}
async function pending(p:Page){await expect.poll(()=>p.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting),{timeout:60000}).toBe(true);}
test.beforeEach(async({request})=>{await release(request,'current');await release(request,'current','','ed4-dev');});
test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus)console.log('UPDATE STATE',await page.evaluate(async()=>({build:document.querySelector('#launcher-build')?.textContent,status:document.querySelector('#update-status')?.textContent,session:{...sessionStorage},workers:(await navigator.serviceWorker.getRegistrations()).map(r=>({scope:r.scope,active:r.active?.state,waiting:r.waiting?.state,installing:r.installing?.state}))})).catch(String));});

test('no update buttons: cached old frontend auto verifies and reloads exactly once, preserves data',async({page,request},info)=>{
 await setup(page,request);await register(page);await run(page);await key(page,'s','SAVE WRITTEN');await stop(page);
 await page.evaluate(async()=>{localStorage.setItem('ed4-controls-v1','preserve-control');await caches.open('unrelated-cache-keep');});const before=await state(page);
 await release(request,'current');await wake(page);await page.waitForTimeout(4000);console.log('WORKERS',await page.evaluate(async()=>{const r=(await navigator.serviceWorker.getRegistration())!;async function info(w:ServiceWorker|null){if(!w)return null;const c=new MessageChannel();w.postMessage({type:'ED4_VERSION'},[c.port2]);return await new Promise(res=>c.port1.onmessage=e=>res(e.data));}return {a:await info(r.active),w:await info(r.waiting),status:document.querySelector('#update-status')?.textContent};}));await loaded(page,current);await expect(page.locator('#update-status')).toHaveText('업데이트 완료');
 expect(await state(page)).toEqual(before);await page.waitForTimeout(2200);expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('2');
 expect(await page.evaluate(()=>caches.keys())).toContain('unrelated-cache-keep');
 const versions=await page.evaluate(async()=>{const c=new MessageChannel(),result=new Promise(r=>c.port1.onmessage=e=>r(e.data));navigator.serviceWorker.controller!.postMessage({type:'ED4_VERSION'},[c.port2]);return result;});expect((versions as any).build.id).toBe(current);
 await writeFile(info.outputPath('idle-update.json'),JSON.stringify({frontend:current,versions,dataPreserved:true,navigations:2},null,2));
});

test('landscape game stays alive; save failure defers; successful save and complete stop auto apply',async({page,request,context},info)=>{
 await page.setViewportSize({width:844,height:390});await setup(page,request);await register(page);const before=await state(page);await run(page);await key(page,'s','SAVE WRITTEN');
 await release(request,'current');await wake(page);await pending(page);await expect(page.locator('#run-state')).toHaveText('실행 중');expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('1');
 await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed','true');await key(page,'ArrowUp','KEY RECEIVED');await page.screenshot({path:info.outputPath('running-update.png')});
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;(window as any).restorePut=()=>IDBObjectStore.prototype.put=original;IDBObjectStore.prototype.put=function(v:any,...rest:any[]){if(this.name==='saves')throw new DOMException('HF2 quota test','QuotaExceededError');return original.call(this,v,...rest);};});
 await menu(page);await page.locator('#stop').click();await expect(page.locator('#status')).toContainText('게임을 종료하지 않았습니다');await expect(page.locator('#run-state')).toHaveText('실행 중');await page.waitForTimeout(1500);expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('1');
 await page.evaluate(()=>(window as any).restorePut());await page.locator('#stop').click();await loaded(page,current);const after=await state(page);expect(after.archives).toEqual(before.archives);expect(after.raw).toEqual(before.raw);expect(after.saves[0].files['TEST.SAV']).toBeTruthy();
 await context.setOffline(true);await page.reload();await loaded(page,current);await run(page);await key(page,'l','ED4_SAVE_OK');await key(page,'m','RAW READ AND SEEK OK');await stop(page);
});

test('open import dialog defers; closing the idle dialog applies without a button',async({page,request})=>{
 await setup(page,request);await page.locator('#simple-import').click();await release(request,'current');await wake(page);await pending(page);await page.waitForTimeout(1500);expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('1');await expect(page.locator('#simple-import-dialog')).toBeVisible();await page.locator('#simple-cancel').click();await loaded(page,current);
});

test('activation lock rejects a new registration and stale apply ACK cannot reload',async({page,request})=>{
 await page.addInitScript(()=>navigator.serviceWorker.addEventListener('message',e=>{if((window as any).holdLock&&e.data.type==='ED4_UPDATE_LOCK'){e.stopImmediatePropagation();(window as any).heldLock=e;}}));
 await setup(page,request);
 await page.evaluate(()=>{const original=ServiceWorker.prototype.postMessage;(window as any).restorePost=()=>ServiceWorker.prototype.postMessage=original;ServiceWorker.prototype.postMessage=function(data:any,transfer?:any){if(data.type==='ED4_APPLY'){transfer[0].postMessage({accepted:true,id:data.id,requestId:'old-ack'});return;}return original.call(this,data,transfer);};});
 await release(request,'current');await wake(page);await pending(page);await expect(page.locator('#update-status')).toContainText('응답 불일치',{timeout:10000});expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('1');
 await page.evaluate(()=>{(window as any).restorePost();(window as any).holdLock=true;});
 await expect.poll(()=>page.evaluate(()=>!!(window as any).heldLock),{timeout:22000}).toBe(true);
 await page.locator('#simple-import').click();await expect(page.locator('#simple-import-dialog')).toBeHidden();await expect(page.locator('#status')).toContainText('업데이트 적용 중');
 await page.evaluate(()=>{const e=(window as any).heldLock;e.ports[0].postMessage({idle:true,requestId:e.data.requestId});});await loaded(page,current);
});

test('multiple tabs hold waiting worker and retry after other tab closes without closing a running guest',async({page,request,context})=>{
 await setup(page,request);await register(page);await run(page);const other=await context.newPage();await other.goto(base);await loaded(other,current+'-prior');
 await release(request,'current');await wake(other);await pending(other);await expect(other.locator('#update-status')).toContainText('보류',{timeout:10000});await expect(page.locator('#run-state')).toHaveText('실행 중');await key(page,'ArrowRight','KEY RECEIVED');await other.close();
 await page.evaluate(()=>new MutationObserver(()=>{if(document.querySelector('#run-state')?.textContent==='종료됨')sessionStorage.setItem('hf2-exit-complete','yes');}).observe(document.querySelector('#run-state')!,{childList:true}));
 await menu(page);await page.locator('#stop').click();await loaded(page,current);expect(await page.evaluate(()=>sessionStorage.getItem('hf2-exit-complete'))).toBe('yes');
});

for(const fault of ['asset','sw'])test(`mixed deployment ${fault} cannot replace current cache; online retry works`,async({page,request})=>{
 await setup(page,request);await register(page);const before=await state(page);const cachesBefore=await page.evaluate(()=>caches.keys());await release(request,'current',fault);await wake(page);await expect(page.locator('#update-status')).toContainText(fault==='sw'?'해시 불일치':'검증 실패',{timeout:60000});
 expect(await state(page)).toEqual(before);await expect.poll(()=>page.evaluate(()=>caches.keys())).toEqual(cachesBefore);expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('1');await run(page);await key(page,'ArrowUp','KEY RECEIVED');await stop(page);
 await release(request,'current');await wake(page);await loaded(page,current);expect((await state(page)).archives).toEqual(before.archives);
});

test('network interrupted mid asset download keeps old offline shell and retries on online',async({page,request,context})=>{
 await setup(page,request);await register(page);const before=await state(page);await release(request,'current','hold');await wake(page);await expect.poll(async()=> (await(await request.get('/__stats')).json()).ed4.held,{timeout:60000}).toBeGreaterThan(0);
 await context.setOffline(true);await release(request,'current','asset');await page.waitForTimeout(1500);await page.reload();await loaded(page,current+'-prior');expect(await state(page)).toEqual(before);await run(page);await key(page,'ArrowLeft','KEY RECEIVED');await stop(page);
 await release(request,'current');await context.setOffline(false);await wake(page);await loaded(page,current);
});

test('HF1 byte-exact first transition remains manual once; new code verifies exact frontend',async({page,request})=>{
 await release(request,'legacy');page.on('dialog',d=>void d.accept());await page.goto(base);await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await register(page);const before=await state(page);
 await release(request,'current');await page.locator('#launcher-advanced').click();await page.locator('#launcher-version').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#update-check').click();await expect(page.locator('#update-apply')).toBeEnabled({timeout:60000});await page.locator('#update-apply').click();await loaded(page,current);expect(await state(page)).toEqual(before);
});

test('public update leaves running developer engine/data/cache alone',async({page,context,request})=>{
 await setup(page,request);const dev=await context.newPage();await dev.goto('/porting-pj/ed4-dev/');await loaded(dev,devCurrent);await register(dev);await run(dev);const cacheBefore=await dev.evaluate(async()=>(await caches.keys()).filter(k=>k.includes('ed4-dev')));
 await release(request,'current');await wake(page);await loaded(page,current);await expect(dev.locator('#run-state')).toHaveText('실행 중');await key(dev,'ArrowUp','KEY RECEIVED');expect(await dev.evaluate(async()=>(await caches.keys()).filter(k=>k.includes('ed4-dev')))).toEqual(cacheBefore);await stop(dev);await dev.close();
});

test('stale expected frontend marker prevents reload loops and manual recovery remains available',async({page,request})=>{
 await setup(page,request);await page.evaluate(()=>sessionStorage.setItem('ed4-expected-build','different-build-marker'));await page.reload();await loaded(page,current+'-prior');await release(request,'current');await wake(page);await pending(page);await page.waitForTimeout(1500);await expect(page.locator('#update-status')).toContainText('자동 전환 확인');expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('2');
 await page.locator('#launcher-advanced').click();await page.locator('#launcher-version').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#update-apply').click();await loaded(page,current);
});

test('cancelled consumed-save exit keeps running and pending update; later confirmed exit applies',async({page,request})=>{
 await setup(page,request);const text=(s:string)=>new TextEncoder().encode(s);
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({'GAME.BAT':text('TEMP.COM\r\n'),'TEMP.COM':tempSaveProgram(),'SAVE/ED4_S99_.DAT':text('TEMP_A'),'SAVE/ED4_98.CFG':text('original')},'temporary-save'));
 await expect(page.locator('#simple-import-dialog')).toBeHidden();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('J TEMP READY');await key(page,'c','TEMP_A CONSUMED');await release(request,'current');await wake(page);await pending(page);
 await menu(page);await page.locator('#stop').click();await expect(page.locator('#temp-exit-dialog')).toBeVisible();await page.locator('#temp-exit-return').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await page.waitForTimeout(1500);expect(await page.evaluate(()=>sessionStorage.getItem('hf2-navs'))).toBe('1');
 await page.locator('#stop').click();await page.locator('#temp-exit-confirm').click();await loaded(page,current);const s=await state(page);expect(s.saves[0].tombstones).toContain('SAVE/ED4_S99_.DAT');expect(s.recovery.length).toBeGreaterThan(0);
});

test('focus/visibility bursts do not repeat network checks',async({page,request})=>{
 await setup(page,request);const before=(await(await request.get('/__stats')).json()).ed4.hits['build-manifest.json'];
 await page.evaluate(()=>{for(let i=0;i<30;i++){window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));}});await page.waitForTimeout(2000);
 expect((await(await request.get('/__stats')).json()).ed4.hits['build-manifest.json']).toBe(before);
});
