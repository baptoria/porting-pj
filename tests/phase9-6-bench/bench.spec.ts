import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {cpuBenchmark} from '../../scripts/phase9-6-probe.mjs';
const text=(s:string)=>new TextEncoder().encode(s);
// ABBA order, same workload and max setting; startup and warm-up excluded.
for(const [i,variant]of ['phase9-5b','phase9-6','phase9-6','phase9-5b'].entries())test(`max ABBA ${i} ${variant}`,async({page},info)=>{
 const dir=`artifacts/${variant}/engines/instrumented`,wasm=await readFile(dir+'/wdosbox.wasm');
 await page.route('**/vendor/wdosbox.wasm',r=>r.fulfill({contentType:'application/wasm',body:wasm}));
 const js=await readFile(dir+'/wdosbox.js');await page.route('**/vendor/wdosbox.js',r=>r.fulfill({contentType:'text/javascript',body:js}));
 await page.addInitScript(()=>{(window as any).__bench={text:'',events:[]};const W=window.Worker;window.Worker=class extends W{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{if(e.data?.name==='ws-stdout'){const b=(window as any).__bench;b.text+=e.data.props.message;for(const m of b.text.matchAll(/BENCH_(BEGIN|DONE_CHECKSUM_OK)/g))b.events.push({kind:m[1],time:performance.now()});b.text=b.text.replace(/BENCH_(BEGIN|DONE_CHECKSUM_OK)/g,'').slice(-200);}});}};});
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-cpu.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'BENCH.COM':cpuBenchmark(),'START.BAT':text('@ECHO OFF\r\ncycles max\r\nCONFIG -get "cpu cycles"\r\nECHO ACTUAL_CYCLES=%CONFIG%\r\nBENCH.COM\r\n')}))});
 await expect(page.locator('#simple-choice')).toBeVisible();await page.locator('#simple-executable').selectOption('START.BAT');await page.locator('#simple-confirm').click();await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('BENCH_READY');await expect(page.locator('#logs')).toContainText('ACTUAL_CYCLES=max');
 // One identical untimed warm-up, then three fixed-work trials.
 await page.locator('#canvas').focus();await page.keyboard.press('b');await expect.poll(()=>page.evaluate(()=>(window as any).__bench.events.length),{timeout:60000}).toBe(2);
 const trials=[];for(let n=0;n<3;n++){await page.keyboard.press('b');await expect.poll(()=>page.evaluate(()=>(window as any).__bench.events.length),{timeout:60000}).toBe((n+2)*2);const e=await page.evaluate(()=>(window as any).__bench.events.slice(-2));trials.push({ms:e[1].time-e[0].time,innerIterations:6553500,loopInstructions:13107000});}
 await expect(page.locator('#logs')).not.toContainText('BENCH_CHECKSUM_FAILED');await writeFile(info.outputPath('result.json'),JSON.stringify({variant,order:i,cycles:'max',wasmSha256:createHash('sha256').update(wasm).digest('hex'),trials},null,2));await page.keyboard.press('q');await page.locator('#stop').click();
});
