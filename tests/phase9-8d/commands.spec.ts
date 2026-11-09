import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {zipSync} from 'fflate';
import {BGM_BOUNDARY_ENGINE} from '../../src/generated/phase9-8d-engine';
const app='/porting-pj/ed4/';
const text=(s:string)=>new TextEncoder().encode(s);
async function download(page:any){const pending=page.waitForEvent('download');await page.locator('#run-diagnostics').click();return JSON.parse(await readFile((await(await pending).path())!,'utf8'));}
for(const variant of ['phase9-7','phase9-8d'])test(`synthetic INT66 requests, bounded metadata and unchanged guest result: ${variant}`,async({page,context},info)=>{
 const program=Buffer.from((await readFile('tests/fixtures/phase9-8d-probe.b64','utf8')).trim(),'base64');
 const files={'ED4TEST.COM':new Uint8Array(program),'ED4-01.RAW':text('RAWTEST1abcd'),'TEST.EFC':text('EFCTEST1efgh')};
 page.on('dialog',d=>void d.accept());await page.goto(app);await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'public-int66.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await expect(page.locator('#profile-title')).toHaveText('public-int66');
 await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.reload();await context.setOffline(true);
 await page.locator('#advanced-settings').evaluate(e=>(e as HTMLDetailsElement).open=true);await page.locator('#boot-open').click();await page.locator('#boot-engine').selectOption(variant);await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('BGM_PROBE_OK');
 const report=await download(page);await writeFile(info.outputPath('observed.json'),JSON.stringify(report,null,2));expect(report.engine.runtimeErrors.events).toEqual([]);expect(report.engine.audioOutput.adapter).toBe('mono-v1');expect(report.engine.cpuHistory.enabled).toBe(false);expect(await page.locator('#speed-toggle').isDisabled()).toBe(true);
 if(variant==='phase9-8d'){
  expect(report.engine.artifact.wasmSha256).toBe(BGM_BOUNDARY_ENGINE.wasmSha256);expect(report.engine.artifact.worker.bootstrap).toBe('ready');const b=report.engine.bgmCommands;
  expect(b.source).toBe('live-worker-query');expect(b.int69Calls).toBe(3);const commands69=b.events.filter((e:any)=>e.kind===4);expect(commands69.map((e:any)=>[e.command,e.bx])).toEqual([[9,7],[9,8],[10,8]]);expect(commands69[0].sequence).toBeLessThan(b.events.find((e:any)=>e.kind===2).sequence);expect(b.ownership).toBe('unknown');expect(b.commands).toMatchObject({'688':3,'68f':1,'695':1,'698':701,'69c':1});expect(b.events.length).toBe(288);expect(b.overwritten).toBeGreaterThan(400);
  const play=b.events.filter((e:any)=>e.kind===1&&e.command===0x688);expect(play).toHaveLength(3);expect(play[0].bufferMetadataValid).toBe(1);expect(play[0].frequency).toBe(22050);expect(play[0].bufferLength).toBe(4);expect(play[0].addressCandidateReadSequence).toBeGreaterThan(0);
  expect(play[1].bufferMetadataValid).toBe(0);expect(play[1].ds).toBe(65535);
  expect(play[2].bufferMetadataValid).toBe(1);expect(play[2].addressCandidateReadSequence).not.toBe(play[0].addressCandidateReadSequence);expect(play[2].fileBasenameHash).not.toBe(play[0].fileBasenameHash);
  expect(b.events.find((e:any)=>e.sequence===play[0].addressCandidateReadSequence).kind).toBe(2);expect(b.events.find((e:any)=>e.sequence===play[2].addressCandidateReadSequence).kind).toBe(3);
  expect(b.tracks.find((t:any)=>t.hash===play[0].fileBasenameHash).path).toBe('ED4-01.RAW');let end=0;for(const r of b.fileReads.filter((e:any)=>e.hash===play[0].fileBasenameHash)){expect(r.position).toBe(end);end+=r.length;}expect(end).toBe(12);
  const again=(await download(page)).engine.bgmCommands;expect(again).toEqual(b);expect(JSON.stringify(b)).not.toContain('RAWTEST1');expect(JSON.stringify(b)).not.toContain('EFCTEST1');
 }else expect(report.engine.bgmCommands).toBeUndefined();
 await writeFile(info.outputPath('result.json'),JSON.stringify(report,null,2));await page.keyboard.press('q');await page.locator('#stop').click();await expect(page.locator('#run-state')).toHaveText('종료됨');
});
