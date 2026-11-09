import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
test('modified registered COM DAT EFC and resized RAW run despite old identity and preserve saves',async({page})=>{
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');
 const files={...unzipSync(new Uint8Array(await readFile('public/test-program.zip'))),'ED4-01.RAW':new TextEncoder().encode('RAWTEST1abcd')};
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'user-mod.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('ED4TEST.COM');await page.locator('#simple-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 const before=await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const request=<T>(q:IDBRequest<T>)=>new Promise<T>(r=>q.onsuccess=()=>r(q.result));
  const saves=await request(db.transaction('saves').objectStore('saves').getAll());const tx=db.transaction('archives','readwrite'),store=tx.objectStore('archives');const a=(await request(store.getAll()))[0];
  a.files['ED4TEST.COM']=new Uint8Array([...a.files['ED4TEST.COM'],1,2,3]);a.files['RESOURCE.DAT']=new TextEncoder().encode('MODIFIED LONG RESOURCE');a.files['TEST.EFC']=new Uint8Array(77);a.sha256='b'.repeat(64);store.put(a);await new Promise(r=>tx.oncomplete=r);db.close();
  let changed=0;async function walk(dir:FileSystemDirectoryHandle){for await(const [,e]of (dir as any).entries())if(e.kind==='directory')await walk(e);else{const f=await e.getFile();if(f.size===12){const writer=await e.createWritable();await writer.write(new Blob([await f.arrayBuffer(),new Uint8Array([4,5,6,7])]));await writer.close();changed++;}}}await walk(await navigator.storage.getDirectory());
  return {changed,saves:JSON.stringify(saves,(_,v)=>v instanceof Uint8Array?Array.from(v):v),com:Array.from(a.files['ED4TEST.COM'])};
 });expect(before.changed).toBe(1);
 await page.reload();await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-8d');await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('실행을 허용');await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 await page.keyboard.press('m');await expect(page.locator('#logs')).toContainText('RAWTEST1 RAW READ AND SEEK OK');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('ED4_SAVE_OK');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
 const after=await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(r=>{const q=indexedDB.open('ed4-mobile-v1');q.onsuccess=()=>r(q.result);});const req=<T>(q:IDBRequest<T>)=>new Promise<T>(r=>q.onsuccess=()=>r(q.result));const saves=await req(db.transaction('saves').objectStore('saves').getAll()),a=(await req(db.transaction('archives').objectStore('archives').getAll()))[0];db.close();return {saves:JSON.stringify(saves,(_,v)=>v instanceof Uint8Array?Array.from(v):v),com:Array.from(a.files['ED4TEST.COM'])};});
 expect(after.saves).toBe(before.saves);expect(after.com).toEqual(before.com);
});
