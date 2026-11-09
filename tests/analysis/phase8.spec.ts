// CC0 authored DOS reboot probes; NOT a commercial game and NOT a fix.
// Fresh Playwright contexts only. Existing app/engine artifacts remain unchanged.
import {test,expect} from '@playwright/test';
import {zipSync} from 'fflate';
import {readFile,writeFile} from 'node:fs/promises';
test.use({serviceWorkers:'block'});
for(const [name,code]of [
 ['int19',[0xcd,0x19]],['int18',[0xcd,0x18]],['reset-vector',[0xea,0xf0,0xff,0,0xf0]],['int19-observed',[0xcd,0x19]],
] as const)test(`public BIOS reboot probe ${name}`,async({page},info)=>{
 const scalars:any[]=[];
 if(name==='int19-observed'){
  page.on('console',m=>{if(m.text().startsWith('PHASE8_SCALARS='))scalars.push(JSON.parse(m.text().slice(15)));});
  // Read-only observation in a test-only JS response. Do not change WASM,
  // Asyncify state, pointers, dispatch or any source/deployment file on disk.
  await page.route('**/vendor/wdosbox.js',async route=>{
   const response=await route.fetch(),body=await response.text();const anchor='return WDOSBOX.ready',invoke='try{return original.apply(null,arguments)}finally';expect(body.split(anchor)).toHaveLength(2);expect(body.split(invoke)).toHaveLength(2);
   const observe=(phase:string)=>`const loop=HEAPU32[276624>>>2];console.log('PHASE8_SCALARS='+JSON.stringify({phase:'${phase}',asyncifyState:Asyncify.state,loopPointer:loop,tableZeroNull:wasmTable.get(0)===null,loopTableFunction:wasmTable.get(loop)?.name}));`;
   await route.fulfill({response,body:body.replace(invoke,`try{return original.apply(null,arguments)}catch(e){if(e instanceof WebAssembly.RuntimeError && /null function/.test(e.message)){${observe('before-finally')}}throw e}finally`).replace(anchor,`self.addEventListener('error',()=>{${observe('worker-error')}});\n${anchor}`)});
  });
 }
 await page.route('**/test-program.zip',route=>route.fulfill({contentType:'application/zip',body:Buffer.from(zipSync({'ED4TEST.COM':new Uint8Array([...code,0xb8,0,0x4c,0xcd,0x21])}))}));
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);
 await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();
 await expect(page.locator('#logs')).toContainText(/DOS Worker 오류|Aborted|Reboot requested/,{timeout:20000});
 const download=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const data=JSON.parse(await readFile((await(await download).path())!,'utf8'));
 await writeFile(info.outputPath('diagnostics.json'),JSON.stringify(data,null,2));
 if(name==='int19-observed'){
  await expect.poll(()=>scalars.length).toBeGreaterThan(0);await writeFile(info.outputPath('scalars.json'),JSON.stringify(scalars,null,2));console.log('read-only scalars',scalars);
  expect(scalars[0]).toMatchObject({phase:'before-finally',asyncifyState:1,loopPointer:1,tableZeroNull:true,loopTableFunction:'2686'});
 }
 console.log(name,JSON.stringify(data.engine?.runtimeErrors?.events?.map((e:any)=>({source:e.source,message:e.message,wasmLocations:e.wasmLocations,stack:e.stack}))));
 expect(data.engine?.artifact?.wasmSha256).toBe('5a932a483cc366ce581ff3bee46a2e775fa315a8fb492dffb3029594ea2472bf');
 const failure=data.engine.runtimeErrors.events.find((e:any)=>e.message==='null function');
 expect(failure.wasmLocations[0]).toEqual({functionIndex:481,offset:'0x14405'});
 expect(failure.wasmLocations.some((f:any)=>f.functionIndex===2613)).toBe(true);
});

async function shellProbe(page:import('@playwright/test').Page,files:Record<string,Uint8Array>){
 await page.route('**/test-program.zip',route=>route.fulfill({contentType:'application/zip',body:Buffer.from(zipSync(files))}));
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);
 await page.locator('#demo').click();await expect(page.locator('#status')).toContainText('공개 테스트 준비 완료');await page.locator('#play').click();await expect(page.locator('#run-state')).toHaveText('실행 중');
 await page.locator('#canvas').focus();
}
async function capture(page:import('@playwright/test').Page,path:string){
 const d=page.waitForEvent('download');await page.locator('#run-diagnostics').click();const data=JSON.parse(await readFile((await(await d).path())!,'utf8'));await writeFile(path,JSON.stringify(data,null,2));return data;
}
test('original short EFC name survives a long duplicate-like name',async({page},info)=>{
 const b:number[]=[],fix:{at:number;name:string}[]=[],labels:Record<string,number>={};
 const emit=(...v:number[])=>b.push(...v),ptr=(name:string)=>{fix.push({at:b.length,name});emit(0,0);};
 emit(0xba);ptr('path');emit(0xb8,0,0x3d,0xcd,0x21,0x89,0xc3,0xb9,64,0,0xba);ptr('buffer');
 emit(0xb4,0x3f,0xcd,0x21,0x89,0xc1,0xbb,1,0,0xb4,0x40,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21);
 labels.path=b.length;emit(...Buffer.from('EFFECT\\000.EFC\0'));labels.buffer=b.length;emit(...new Array(64).fill(0));
 for(const f of fix){const value=0x100+labels[f.name];b[f.at]=value&255;b[f.at+1]=value>>>8;}
 await shellProbe(page,{'ED4TEST.COM':new Uint8Array(b),'EFFECT/000.EFC':Buffer.from('ORIGINAL_EFC\r\n'),'EFFECT/000 (1).EFC':Buffer.from('OTHER_EFC\r\n')});
 await expect(page.locator('#logs')).toContainText('ORIGINAL_EFC');
 await page.keyboard.type('dir effect');await page.keyboard.press('Enter');await expect(page.locator('#logs')).toContainText('000(1)~1');
 const data=await capture(page,info.outputPath('efc.json'));expect(data.engine.runtimeErrors.events).toEqual([]);expect(data.logs.join('')).toMatch(/000\s+EFC/);
});
test('literal illegal commands alone do not reproduce the WASM trap',async({page},info)=>{
 const commands=['ouGGuG ddggw >nul','cycles max >nul','cgGe normal >nul','oplggte 44100 >nul','echo COMMANDS_COMPLETED'];
 await shellProbe(page,{'ED4TEST.COM':new Uint8Array([0xb8,0,0x4c,0xcd,0x21]),'PROBE.BAT':Buffer.from(commands.join('\r\n'))});
 // Literal BAT bytes avoid browser key synthesis/Shift changing > into a dot.
 await page.keyboard.type('probe.bat');await page.keyboard.press('Enter');
 await expect(page.locator('#logs')).toContainText('COMMANDS_COMPLETED');const data=await capture(page,info.outputPath('commands.json'));
 for(const cmd of ['ouGGuG','cgGe','oplggte'])expect(data.logs.join('')).toContain('Illegal command: '+cmd);
 expect(data.engine.runtimeErrors.events).toEqual([]);
});
