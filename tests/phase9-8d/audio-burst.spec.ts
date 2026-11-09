import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
for(const variant of ['phase9-7','phase9-8d'])test(`${variant} synthetic burst queue never alters PCM and reveals scheduling overlap`,async({page},info)=>{
 await page.addInitScript(()=>{
  const w=window as any;w.burst={armed:false,remaining:2,events:[],packets:[]};const Native=Worker;
  window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{
   if(e.data?.name==='ws-sound-push'&&w.burst.armed&&w.burst.remaining>0){
    const samples=Float32Array.from({length:11025},(_,i)=>Math.sin(i*2*Math.PI*440/22050)*.1);
    e.data.props.samples=samples;w.burst.remaining--;w.burst.injecting=true;w.burst.packets.push(Array.from(samples));
   }
  });}};
  const native=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof native>){if(w.burst.injecting&&this.buffer){w.burst.injecting=false;w.burst.events.push({at:args[0],duration:this.buffer.duration,samples:Array.from(this.buffer.getChannelData(0))});}return native.apply(this,args);};
 });
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption(variant);await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');
 await page.evaluate(()=>{(window as any).burst.armed=true;});await expect.poll(()=>page.evaluate(()=>(window as any).burst.events.length)).toBe(2);
 const data=await page.evaluate(()=>(window as any).burst);for(let i=0;i<2;i++)expect(data.events[i].samples).toEqual(data.packets[i]);
 const overlap=data.events[0].at+data.events[0].duration-data.events[1].at;
 if(variant==='phase9-7')expect(overlap).toBeGreaterThan(.3);else expect(overlap).toBeLessThanOrEqual(.000001);
 const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const report=JSON.parse(await readFile((await(await pending).path())!,'utf8'));
 if(variant==='phase9-8d'){expect(report.engine.audioStartup.samplesExported).toBe(false);expect(report.engine.audioStartup.events.every((e:any)=>e.overlapMs===0||e.overlapMs===null)).toBe(true);}
 expect(report.engine.runtimeErrors.events).toEqual([]);await writeFile(info.outputPath('queue.json'),JSON.stringify({variant,overlapSeconds:overlap,packetsPreserved:true,diagnostics:report},null,2));await page.locator('#stop').click();
});
