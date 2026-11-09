import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
import {cpuBenchmark} from '../../scripts/phase9-6-probe.mjs';
import {timeProbe} from '../../scripts/phase9-8-time-probe.mjs';
const text=(s:string)=>new TextEncoder().encode(s);
for(const mode of ['12000','24000','max','24000-then-max'])test(`CPU budget versus BIOS time: ${mode}`,async({page},info)=>{
 const commands=mode==='24000-then-max'?'cycles 24000\r\ncycles max':`cycles ${mode}`;
 const fixture=zipSync({'ED4TEST.COM':cpuBenchmark(),'TIMER.COM':timeProbe(),'.jsdos/dosbox.conf':text(`[dosbox]\nmemsize=16\n[cpu]\ncore=normal\ncycles=12000\n[mixer]\nrate=22050\n[sblaster]\nsbtype=sb16\noplrate=22050\n[autoexec]\nmount c .\nc:\n${commands}\nCONFIG -get "cpu cycles"\nECHO ACTUAL_CYCLES=%CONFIG%\nED4TEST.COM\nTIMER.COM\n`)});
 // Public test fixture replaces wc-run only; production BAT safety remains intact.
 await page.addInitScript(({fixture})=>{
  const w=window as any;w.probe={text:'',events:[],perf:[]};const Native=Worker;
  window.Worker=class extends Native{postMessage(message:any,options?:any){if(message?.name==='wc-run'){const bytes=new Uint8Array(fixture);message={...message,props:{...message.props,bundles:[bytes]}};options=[bytes.buffer];}super.postMessage(message,options);}constructor(u:string|URL,o?:WorkerOptions){super(u,o);w.probeWorker=this;this.addEventListener('message',e=>{
   if(e.data?.name==='ed4-performance')w.probe.perf.push(e.data.props);
   if(e.data?.name==='ws-stdout'){
    const p=w.probe;p.text+=e.data.props.message;
    for(const m of p.text.matchAll(/(BENCH_BEGIN|BENCH_DONE_CHECKSUM_OK|TIMER_BEGIN|TIMER_DONE)/g))p.events.push({kind:m[1],time:performance.now()});
    p.text=p.text.replace(/BENCH_BEGIN|BENCH_DONE_CHECKSUM_OK|TIMER_BEGIN|TIMER_DONE/g,'').slice(-200);
   }
  });}};
 },{fixture:Array.from(fixture)});
 await page.goto('/porting-pj/ed4/');page.on('dialog',d=>void d.accept());
 await page.route('**/test-program.zip',r=>r.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':cpuBenchmark()}))}));
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');
 await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption('phase9-7');await page.locator('#boot-start').click();
 await expect(page.locator('#logs')).toContainText('BENCH_READY');await expect(page.locator('#logs')).toContainText('ACTUAL_CYCLES='+ (mode.includes('max')?'max':mode));
 await page.evaluate(()=>{const w=window as any;w.probeWorker.postMessage({name:'ed4-perf-start',id:91});w.perfPoll=setInterval(()=>w.probeWorker.postMessage({name:'ed4-perf-poll',id:91}),250);});
 await page.locator('#canvas').focus();
 for(let i=0;i<4;i++){await page.keyboard.press('b');await expect.poll(()=>page.evaluate(()=>(window as any).probe.events.length)).toBe((i+1)*2);}
 await page.keyboard.press('q');await expect(page.locator('#logs')).toContainText('TIMER_READY');
 for(let i=0;i<3;i++){await page.keyboard.press('t');await expect.poll(()=>page.evaluate(()=>(window as any).probe.events.length)).toBe(8+(i+1)*2);}
 const data=await page.evaluate(()=>{const w=window as any;clearInterval(w.perfPoll);w.probeWorker.postMessage({name:'ed4-perf-stop',id:91});return w.probe;});
 const durations=(kind:string)=>data.events.filter((e:any)=>e.kind===kind).map((e:any)=>{const i=data.events.indexOf(e);return data.events[i+1].time-e.time;});
 const cpuMs=durations('BENCH_BEGIN').slice(1),bios36TicksMs=durations('TIMER_BEGIN');
 expect(cpuMs).toHaveLength(3);expect(bios36TicksMs).toHaveLength(3);expect(bios36TicksMs.every((n:number)=>n>1500&&n<4000)).toBe(true);
 expect(data.perf.some((p:any)=>p.cyclesAuto===(mode.includes('max')?1:0))).toBe(true);
 const measurement=JSON.stringify({mode,requestedSpeed:null,note:'CPU setting experiment only; no 2x game-time implementation',cpuMs,bios36TicksMs,nativeSamples:data.perf,wasmSha256:'f7f88a62de8e99d241eb16f07d30fa4b75049843e41de1e7d60c80c04eebfed3'},null,2);
 await writeFile(info.outputPath('measurement.json'),measurement);await writeFile(`artifacts/phase9-8/time-${mode}.json`,measurement);
 await page.keyboard.press('q');await page.locator('#stop').click();
});
