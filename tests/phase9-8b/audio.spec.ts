import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
// Observe coupling; this is NOT a BGM-safe speed implementation.
for(const rate of [1,2])for(const device of ['opl','pcm'])test(`local guest ${rate}x public ${device} coupling`,async({page})=>{
 const dir='artifacts/phase9-8b/engine',manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));
 for(const file of ['wdosbox.js','wdosbox.wasm'])await page.route('**/vendor/'+file,async r=>r.fulfill({contentType:file.endsWith('.wasm')?'application/wasm':'text/javascript',body:await readFile(dir+'/'+file)}));
 await page.route('**/dos-worker.js',async r=>r.fulfill({contentType:'text/javascript',body:`self.addEventListener('message',e=>{if(e.data?.name==='local-speed'){e.stopImmediatePropagation();self.postMessage({name:'speed-ack',rate:runtime._ed4_test_set_speed(e.data.rate)});}});\n`+await readFile('public/dos-worker.js','utf8')}));
 await page.addInitScript(()=>{const w=window as any;w.coupling={chunks:[],rate:0,markers:[],errors:[]};const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);w.testWorker=this;this.addEventListener('message',e=>{const d=e.data;if(d?.name==='speed-ack')w.coupling.ack=d.rate;if(d?.name==='ws-sound-init')w.coupling.rate=d.props.freq;if(d?.name==='ws-sound-push'&&w.coupling.chunks.length<500)w.coupling.chunks.push(Array.from(d.props.samples));if(d?.name==='ws-stdout'&&/AUDIO_(OPL|PCM|DONE)/.test(d.props.message))w.coupling.markers.push({message:d.props.message,at:performance.now()});if(d?.name==='ed4-runtime-error')w.coupling.errors.push(d.props);});}};});
 await page.route('**/test-program.zip',async r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':new Uint8Array(Buffer.from((await readFile('tests/fixtures/phase9-7-audio.b64','utf8')).trim(),'base64'))}))}));
 await page.goto('/porting-pj/ed4/');page.on('dialog',d=>void d.accept());await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('AUDIO_READY');
 await page.evaluate(rate=>{const w=window as any;w.testWorker.postMessage({name:'local-speed',rate});w.coupling.chunks=[];},rate);await expect.poll(()=>page.evaluate(()=>(window as any).coupling.ack)).toBe(rate);
 await page.locator('#canvas').focus();await page.keyboard.press(device==='opl'?'o':'p');await expect(page.locator('#logs')).toContainText('AUDIO_DONE');await page.waitForTimeout(300);
 const data=await page.evaluate(()=>(window as any).coupling);expect(data.rate).toBe(22050);expect(data.chunks.flat().some((n:number)=>Math.abs(n)>.005)).toBe(true);expect(data.errors).toEqual([]);
 await writeFile(`artifacts/phase9-8b/audio-${rate}-${device}.json`,JSON.stringify({guestRate:rate,device,wasmSha256:manifest.files['wdosbox.wasm'].sha256,...data}));await page.keyboard.press('q');await page.locator('#stop').click();
});
