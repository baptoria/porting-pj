import {test,expect} from '@playwright/test';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function files(dir:string):Promise<string[]>{return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(`${dir}/${e.name}`):`${dir}/${e.name}`))).flat();}
test('strict subpath: every asset, MIME, manifest, cache isolation and DOS offline persistence',async({page,context,request},info)=>{
 const results:{path:string;status:number;contentType:string}[]=[],errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
 for(const path of ['/vendor/wdosbox.wasm','/assets/missing.js','/sw.js','/manifest.webmanifest','/'])expect((await request.get(path)).status()).toBe(404);
 expect((await request.get('/ed4-mobile/missing.wasm')).status()).toBe(404);
 for(const file of await files('docs')){
  const path='/ed4-mobile/'+file.slice(5),response=await request.get(path),body=await response.body();
  expect(response.status(),path).toBe(200);
  expect(createHash('sha256').update(body).digest('hex')).toBe(createHash('sha256').update(await readFile(file)).digest('hex'));
  const type=response.headers()['content-type'];
  if(file.endsWith('.wasm')){expect(type).toBe('application/wasm');expect([...body.subarray(0,4)]).toEqual([0,97,115,109]);}
  if(file.endsWith('.js'))expect(type).toContain('javascript');
  results.push({path,status:response.status(),contentType:type});
 }
 const manifest=await (await request.get('/ed4-mobile/manifest.webmanifest')).json(),manifestURL='http://localhost:4173/ed4-mobile/manifest.webmanifest';
 for(const key of ['id','start_url','scope'])expect(new URL(manifest[key],manifestURL).pathname).toBe('/ed4-mobile/');
 expect(manifest.orientation).toBe('landscape');
 for(const icon of manifest.icons)expect((await request.get(new URL(icon.src,manifestURL).href)).status()).toBe(200);
 await page.goto('/ed4-mobile/licenses/NOTICE.html');
 await page.evaluate(async()=>{await caches.open('ed4-shell-other-project-preserve');await caches.open('ed4-shell-%2Fed4-mobile%2F-old-test-version');});
 await page.goto('/ed4-mobile/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await expect(page.locator('a[href="./synthetic-raw.zip"]')).toHaveCount(0);
 const cache=await page.evaluate(async()=>{
  const r=await navigator.serviceWorker.ready;const keys=await caches.keys();
  const name=keys.find(k=>k.startsWith('ed4-shell-%2Fed4-mobile%2F-'))!;
  return {scope:r.scope,script:r.active?.scriptURL,keys,urls:(await (await caches.open(name)).keys()).map(q=>q.url)};
 });
 expect(cache.scope).toBe('http://localhost:4173/ed4-mobile/');expect(cache.script?.endsWith('/ed4-mobile/sw.js')).toBe(true);
 expect(cache.keys).toContain('ed4-shell-other-project-preserve');expect(cache.keys).not.toContain('ed4-shell-%2Fed4-mobile%2F-old-test-version');
 expect(cache.urls.every(u=>new URL(u).pathname.startsWith('/ed4-mobile/'))).toBe(true);
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
