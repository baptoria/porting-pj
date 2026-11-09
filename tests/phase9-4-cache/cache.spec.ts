import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
import {probes,loader} from '../../scripts/phase9-4-probes.mjs';
import {createHash} from 'node:crypto';
const app='/porting-pj/ed4/',hash='13d96ce65d9370acf4a2c3f99a7723872ef6dae193ca4ffdd4944e526a7d3738';
const text=(s:string)=>new TextEncoder().encode(s);
async function register(page:Page,probe?:number[]){
 page.on('dialog',d=>void d.accept());await page.goto(app);
 const files:Record<string,Uint8Array>={...unzipSync(new Uint8Array(await readFile('public/test-program.zip'))),'ED4-01.RAW':text('RAWTEST1\0\0\0\0')};
 if(probe){files['ED4TEST.COM']=new Uint8Array(loader());files['ED4.EXE']=new Uint8Array(probe);}
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-engine-test.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('ED4TEST.COM');await page.locator('#simple-confirm').click();
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
}
async function open(page:Page){await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await expect(page.locator('#boot-engine')).toHaveValue('stable');}
async function choose(page:Page){await open(page);await page.locator('#boot-engine').selectOption('phase9-4');await page.locator('#boot-start').click();}
async function report(page:Page){const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();return JSON.parse(await readFile((await(await pending).path())!,'utf8'));}
async function snapshot(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('ed4-mobile-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const out:any={db:{},opfs:{}};
 for(const name of Array.from(db.objectStoreNames))out.db[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});db.close();
 async function walk(dir:FileSystemDirectoryHandle,path:string){for await(const [name,entry] of (dir as any).entries()){if(entry.kind==='directory')await walk(entry,path+'/'+name);else{const bytes=await(await entry.getFile()).arrayBuffer();out.opfs[path+'/'+name]=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}}}
 await walk(await navigator.storage.getDirectory(),'');
 return JSON.stringify(out,(_,v)=>v instanceof Uint8Array?Array.from(v):v);
});}

const bundle=JSON.parse(await readFile('public/phase9-4-worker.json','utf8'));
async function mixed(page:Page,mode:'network'|'warm'){
 await page.addInitScript(({mode})=>{
  const register=navigator.serviceWorker.register.bind(navigator.serviceWorker);
  navigator.serviceWorker.register=(_script,options)=>register('/porting-pj/ed4/test-sw-'+mode+'.js',{...options,scope:'/porting-pj/ed4/'});
  const Native=Worker;(window as any).__workerUrls=[];
  window.Worker=class extends Native{constructor(url:string|URL,options?:WorkerOptions){
   (window as any).__workerUrls.push(String(url));super(url,options);
  }};
 },{mode});
}
async function cached(page:Page,file:string){return page.evaluate(async file=>{
 const keys=(await caches.keys()).filter(k=>k.startsWith('ed4-hotfix-fixture-'));if(keys.length!==1)throw Error('Unexpected cache inventory');
 const c=await caches.open(keys[0]),r=await c.match(new URL(file,location.href));return r?await r.text():null;
 },file);}
async function settle(page:Page){await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.reload();await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toContain('test-sw-');}
async function offlineFixture(page:Page,context:any){
 await page.evaluate(()=>new Promise<void>(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>resolve();navigator.serviceWorker.controller!.postMessage('fixture-offline',[channel.port2]);}));
 await context.setOffline(true);
}
async function trace(page:Page,info:any){
 await expect(page.locator('#logs')).toContainText('Aborted',{timeout:20000});const data=await report(page);
 expect(data.engine.artifact).toMatchObject({id:'phase9-4',wasmSha256:hash,worker:{entry:bundle.entry,common:bundle.common,expectedSha256:bundle.sha256,bootstrap:'ready'}});
 expect(data.engine.cpuHistory.history.records.at(-1)).toMatchObject({kind:'far-call',after:{cs:65535,ip:0}});
 expect(data.engine.cpuHistory.history.first.anchors.some((a:any)=>a.type==='first-real-eip-wide')).toBe(true);
 expect(data.engine.execution.requests.some((r:any)=>r.program.toUpperCase().includes('ED4TEST.COM'))).toBe(true);
 expect(data.engine.runtimeErrors.events.some((e:any)=>/Unknown diagnostic engine|null function/.test(e.message))).toBe(false);
 await writeFile(info.outputPath('diagnostics.json'),JSON.stringify(data,null,2));return data;
}

for(const offline of [false,true])test(`mixed cache uses pinned Worker and actual CPU history ${offline?'offline':'online cache miss'}`,async({page,context},info)=>{
 await mixed(page,offline?'warm':'network');await register(page,probes.find(p=>p.name==='ffff-corridor')!.code);await settle(page);const before=await snapshot(page);
 expect(await cached(page,'dos-worker.js')).toContain("selectedEngine!=='phase9-2'");expect(await cached(page,'dos-worker-phase9-3.js')).toContain("importScripts('./dos-worker.js')");
 if(offline){expect(await cached(page,bundle.common)).toContain('phase9-4-common-1');await offlineFixture(page,context);await page.reload();}
 else {expect(await cached(page,bundle.common)).toBeNull();expect(await cached(page,bundle.entry)).toBeNull();}
 await choose(page);await trace(page,info);
 expect(await page.evaluate(entry=>(window as any).__workerUrls.some((s:string)=>s.endsWith('/'+entry)),bundle.entry)).toBe(true);
 await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');expect(await snapshot(page)).toBe(before);
 expect(await cached(page,'dos-worker.js')).toContain("selectedEngine!=='phase9-2'");
});
for(const fault of ['missing','old-common','bad-marker'] as const)test(`pinned Worker ${fault} fails explicitly without fallback or data loss`,async({page,context},info)=>{
 await mixed(page,'warm');await register(page);await settle(page);const before=await snapshot(page);
 await page.evaluate(async({file,fault})=>{const c=await caches.open('ed4-hotfix-fixture-warm'),url=new URL(file,location.href);
  if(fault==='missing')await c.delete(url);
  else {const body=fault==='old-common'?await(await c.match(new URL('dos-worker.js',location.href)))!.text():"self.ed4CommonWorkerRevision='incompatible';";await c.put(url,new Response(body,{headers:{'Content-Type':'text/javascript'}}));}
 },{file:bundle.common,fault});
 await offlineFixture(page,context);await choose(page);
 await expect(page.locator('#run-state')).toHaveText('시작 실패');await expect(page.locator('#status')).toContainText('Phase 9-4 Worker 로딩/호환성 오류');
 const data=await report(page);expect(data.engine.artifact.id).toBe('phase9-4');expect(data.engine.artifact.worker.bootstrap).toBe('failed');expect(data.engine.frames).toBe(0);expect(data.engine.execution.requests).toEqual([]);expect(data.engine.cpuHistory.history).toBeUndefined();
 expect(data.engine.runtimeErrors.events.some((e:any)=>e.source==='worker-bootstrap'&&e.stage===(fault==='bad-marker'?'check-common-worker':'import-common-worker'))).toBe(true);
 if(fault==='old-common')expect(data.engine.runtimeErrors.events.some((e:any)=>e.message.includes('Unknown diagnostic engine'))).toBe(true);
 expect(await snapshot(page)).toBe(before);expect(await page.evaluate(()=>(window as any).__workerUrls.some((s:string)=>s.endsWith('/dos-worker.js')))).toBe(false);
 await writeFile(info.outputPath('failure.json'),JSON.stringify(data,null,2));
});
test('HTTP deployment copies and bootstrap hashes match build manifest',async({request})=>{
 for(const [file,sha]of [[bundle.entry,bundle.entrySha256],[bundle.common,bundle.sha256]]){
  const r=await request.get(app+file);expect(r.ok()).toBe(true);expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(sha);
 }
 const sw=await(await request.get(app+'sw.js')).text();expect(sw).toContain(bundle.entry);expect(sw).toContain(bundle.common);
});
