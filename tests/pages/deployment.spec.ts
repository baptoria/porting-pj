import {test,expect} from '@playwright/test';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function files(dir:string):Promise<string[]>{return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
test('strict subpath: every asset, MIME, manifest, cache isolation and DOS offline persistence',async({page,context,request},info)=>{
 const results:{path:string;status:number;contentType:string}[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
 for(const path of ['/vendor/wdosbox.wasm','/assets/missing.js','/sw.js','/manifest.webmanifest','/','/ed4-mobile/','/porting-pj/vendor/wdosbox.wasm','/porting-pj/manifest.webmanifest'])expect((await request.get(path)).status()).toBe(404);
 expect((await request.get('/porting-pj/ed4/missing.wasm')).status()).toBe(404);
 for(const file of await files('docs')){
  const path='/porting-pj/'+file.slice(5),response=await request.get(path),body=await response.body();
  expect(response.status(),path).toBe(200);
  expect(createHash('sha256').update(body).digest('hex')).toBe(createHash('sha256').update(await readFile(file)).digest('hex'));
  const type=response.headers()['content-type'];
  if(file.endsWith('.wasm')){expect(type).toBe('application/wasm');expect([...body.subarray(0,4)]).toEqual([0,97,115,109]);}
  if(file.endsWith('.js'))expect(type).toContain('javascript');
  results.push({path,status:response.status(),contentType:type});
 }
 const manifest=await (await request.get('/porting-pj/ed4/manifest.webmanifest')).json(),manifestURL='http://localhost:4173/porting-pj/ed4/manifest.webmanifest';
 for(const key of ['id','start_url','scope'])expect(new URL(manifest[key],manifestURL).pathname).toBe('/porting-pj/ed4/');
 expect(manifest.orientation).toBe('landscape');
 for(const icon of manifest.icons)expect((await request.get(new URL(icon.src,manifestURL).href)).status()).toBe(200);
 await page.goto('/porting-pj/ed4/licenses/NOTICE.html');
 await page.evaluate(async()=>{await caches.open('ed4-shell-other-project-preserve');await caches.open('ed4-shell-%2Fporting-pj%2Fed4%2F-old-test-version');});
 await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await expect(page.locator('a[href="./synthetic-raw.zip"]')).toHaveCount(0);
 const cache=await page.evaluate(async()=>{
  const r=await navigator.serviceWorker.ready;const keys=await caches.keys();
  const name=keys.find(k=>k.startsWith('ed4-shell-%2Fporting-pj%2Fed4%2F-'))!;
  return {scope:r.scope,script:r.active?.scriptURL,keys,urls:(await (await caches.open(name)).keys()).map(q=>q.url)};
 });
 expect(cache.scope).toBe('http://localhost:4173/porting-pj/ed4/');expect(cache.script?.endsWith('/porting-pj/ed4/sw.js')).toBe(true);
 expect(cache.keys).toContain('ed4-shell-other-project-preserve');expect(cache.keys).not.toContain('ed4-shell-%2Fporting-pj%2Fed4%2F-old-test-version');
 expect(cache.urls.every(u=>new URL(u).pathname.startsWith('/porting-pj/ed4/'))).toBe(true);
 expect(cache.urls.some(u=>u.includes('/sources/'))).toBe(false);
 expect(cache.urls.some(u=>u.endsWith('/dos-worker.js'))).toBe(true);
 for(const worker of ['zip-worker-','runtime-worker-','source-worker-'])expect(cache.urls.some(u=>u.includes(worker))).toBe(true);
 await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');
 // Exercise OPFS/ZIP import Worker under the prefix using test-only PCM bytes.
 const raw=Buffer.alloc(12);raw.write('RAWTEST1');await page.locator('#music-files').setInputFiles({name:'ED4-01.RAW',mimeType:'application/octet-stream',buffer:raw});await expect(page.locator('#music-track option')).toHaveCount(1);
 await page.locator('#music-link').click();await expect(page.locator('#status')).toContainText('연결했습니다');
 await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('실행 중');
 await page.keyboard.press('ArrowUp');await expect(page.locator('#logs')).toContainText('KEY RECEIVED');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');
 await expect(page.locator('#canvas')).toHaveAttribute('data-audio-state','running');await page.screenshot({path:info.outputPath('pages-dos.png')});
 await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 await context.setOffline(true);await page.reload();await expect(page.locator('#profile-title')).toHaveText('공개 DOS 테스트');await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('실행 중');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK!');await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 expect(errors).toEqual([]);await writeFile(info.outputPath('pages-check.json'),JSON.stringify({scope:'Local strict subpath, NOT a live GitHub deployment or Galaxy test',results,manifest,cache,errors,dos:true,opfs:true,audio:true,offlineSaveRestore:true},null,2));
});

test('Pages landing, redirects and retired root worker preserve child cache and browser data',async({page,context,request})=>{
 for(const path of ['/porting-pj','/porting-pj/ed4']){
  const response=await request.get(path,{maxRedirects:0});
  expect(response.status()).toBe(301);expect(response.headers().location).toBe(path+'/');
 }
 await page.goto('/porting-pj/');
 await expect(page.getByRole('heading',{name:'Porting PJ'})).toBeVisible();
 expect(await page.evaluate(()=>navigator.serviceWorker.controller)).toBeNull();
 await page.getByRole('link',{name:'영웅전설4 실행기 열기'}).click();
 await expect(page).toHaveURL('http://localhost:4173/porting-pj/ed4/');
 await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.evaluate(async()=>{
  await caches.open('ed4-shell-%2Fporting-pj%2F-old-root');
  await caches.open('unrelated-project-cache');
  await new Promise<void>((resolve,reject)=>{
   const open=indexedDB.open('path-migration-preserve',1);
   open.onupgradeneeded=()=>open.result.createObjectStore('save');
   open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{const db=open.result,tx=db.transaction('save','readwrite');tx.objectStore('save').put('saved-content','slot');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  });
  const handle=await (await navigator.storage.getDirectory()).getFileHandle('migration-sentinel.txt',{create:true});
  const stream=await handle.createWritable();await stream.write('opfs-content');await stream.close();
 });
 await page.goto('/porting-pj/');
 await page.evaluate(()=>navigator.serviceWorker.register('./sw.js'));
 await expect.poll(()=>page.evaluate(async()=>(await caches.keys()).includes('ed4-shell-%2Fporting-pj%2F-old-root'))).toBe(false);
 await expect.poll(()=>page.evaluate(async()=>(await navigator.serviceWorker.getRegistrations()).map(r=>new URL(r.scope).pathname))).toEqual(['/porting-pj/ed4/']);
 const preserved=await page.evaluate(async()=>({
  caches:await caches.keys(),
  opfs:await (await (await (await navigator.storage.getDirectory()).getFileHandle('migration-sentinel.txt')).getFile()).text(),
  save:await new Promise((resolve,reject)=>{const open=indexedDB.open('path-migration-preserve');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,read=db.transaction('save').objectStore('save').get('slot');read.onsuccess=()=>{resolve(read.result);db.close();};read.onerror=()=>reject(read.error);};})
 }));
 expect(preserved.caches).toContain('unrelated-project-cache');
 expect(preserved.caches.some(k=>k.startsWith('ed4-shell-%2Fporting-pj%2Fed4%2F-'))).toBe(true);
 expect(preserved.save).toBe('saved-content');expect(preserved.opfs).toBe('opfs-content');
 await context.setOffline(true);await page.goto('/porting-pj/ed4/');
 await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
});
