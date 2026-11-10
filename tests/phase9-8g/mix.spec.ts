import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
function component(samples:number[],rate:number,hz:number){
 let s=0,c=0;for(let i=0;i<samples.length;i++){s+=samples[i]*Math.sin(2*Math.PI*hz*i/rate);c+=samples[i]*Math.cos(2*Math.PI*hz*i/rate);}return 2*Math.hypot(s,c)/samples.length;
}
test('public premix BGM-only exclusion keeps SE PCM, real DMA completion IRQ and guest time',async({page},info)=>{
 await page.addInitScript(()=>{
  const w=window as any;w.mixCapture={chunks:[],rate:0};const NativeWorker=window.Worker;
  window.Worker=class extends NativeWorker{constructor(url:string|URL,o?:WorkerOptions){super(url,o);this.addEventListener('message',e=>{if(e.data?.name==='ws-sound-init')w.mixCapture.rate=e.data.props.freq;if(e.data?.name==='ws-sound-push'&&w.mixCapture.chunks.length<500)w.mixCapture.chunks.push(Array.from(e.data.props.samples));});}};
 });
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8g-mix-probe.b64','utf8')).trim(),'base64');
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-mix.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'ED4TEST.COM':program}))});await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-8f');await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('MIX_READY');
 const results:any[]=[];
 for(let key=1;key<=6;key++){
  await page.evaluate(()=>{(window as any).mixCapture.chunks=[];});await page.locator('#canvas').focus();await page.keyboard.press(String(key));
  await expect.poll(async()=>((await page.locator('#logs').textContent())!.match(/MIX_DONE/g)??[]).length).toBe(key);await page.waitForTimeout(120);
  const data=await page.evaluate(()=>(window as any).mixCapture),samples:number[]=data.chunks.flat();expect(data.rate).toBe(22050);
  const first=samples.findIndex(x=>Math.abs(x)>.005),start=Math.max(0,first)+Math.floor(data.rate*.15),window=samples.slice(start,start+Math.floor(data.rate*.4));expect(window.length).toBe(Math.floor(data.rate*.4));
  const state=[...(await page.locator('#logs').textContent())!.matchAll(/MIX_STATE BGM SE IRQ DMA TICKS: ([0-9A-F]{4}) ([0-9A-F]{4}) ([0-9A-F]{4}) ([0-9A-F]{4}) ([0-9A-F]{4})/g)].at(-1);
  expect(state).toBeTruthy();const values=state!.slice(1).map(v=>parseInt(v,16));
  const row={key,state:values,rate:data.rate,bgm500:component(window,data.rate,500),se1000:component(window,data.rate,1000),peak:Math.max(...samples.map(Math.abs)),steadyPeak:Math.max(...window.map(Math.abs)),steadyMean:window.reduce((a,b)=>a+b,0)/window.length,firstSignal:first,lastLarge:samples.reduce((last,x,i)=>Math.abs(x)>.9?i:last,-1),firstLarge:samples.findIndex(x=>Math.abs(x)>.9),sampleCount:samples.length,preTransientPeak:Math.max(...samples.slice(0,Math.max(0,samples.findIndex(x=>Math.abs(x)>.9)-50)).map(Math.abs))};results.push(row);
  if(key===4)await writeFile(info.outputPath('public-silence-transient.json'),JSON.stringify({rate:data.rate,firstSignal:first,blocks:Array.from({length:Math.ceil(samples.length/221)},(_,i)=>{const a=samples.slice(i*221,(i+1)*221);return {start:i*221,peak:Math.max(...a.map(Math.abs)),mean:a.reduce((s,v)=>s+v,0)/a.length};})}));
  expect(values[2]).toBe(1);expect(values[3]).toBe(65535);expect(values[4]).toBeGreaterThanOrEqual(30);expect(values[4]).toBeLessThanOrEqual(31);
 }
 await writeFile(info.outputPath('measurements.json'),JSON.stringify(results,null,2));
 for(let i=0;i<3;i++)expect(results[i+3].state.slice(0,4)).toEqual(results[i].state.slice(0,4));
 expect(results[0].bgm500).toBeGreaterThan(.01);expect(results[1].se1000).toBeGreaterThan(.01);
 expect(results[2].bgm500).toBeGreaterThan(.01);expect(results[2].se1000).toBeGreaterThan(.01);
 expect(results[3].steadyPeak).toBeLessThan(.0001);expect(results[3].firstLarge).toBeGreaterThan(10000);expect(results[3].preTransientPeak).toBeLessThan(.0001);
 expect(results[4].se1000/results[1].se1000).toBeGreaterThan(.98);expect(results[4].se1000/results[1].se1000).toBeLessThan(1.02);
 expect(results[5].se1000/results[1].se1000).toBeGreaterThan(.98);expect(results[5].se1000/results[1].se1000).toBeLessThan(1.02);
 expect(results[5].bgm500).toBeLessThan(results[2].bgm500*.01);
 const download=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const d=JSON.parse(await readFile((await(await download).path())!,'utf8'));
 expect(d.engine.artifact.id).toBe('phase9-8f');expect(d.engine.cpuHistory.enabled).toBe(false);expect(d.engine.audioOutput.adapter).toBe('mono-v1');expect(d.engine.runtimeErrors.events).toEqual([]);await expect(page.locator('#speed-toggle')).toBeDisabled();
 await page.locator('#canvas').focus();await page.keyboard.press('q');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
});
