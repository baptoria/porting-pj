import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {zipSync,unzipSync} from 'fflate';
import {register,stop,diagnostic,text} from '../phase9-8i/helpers';
test('uncertain optional reference is selectable; original BAT runs and normal engine remains explicit',async({page})=>{
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 const files={...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':text('IF NOT EXIST OPT.BAT GOTO RUN\r\nCALL OPT.BAT\r\n:RUN\r\nED4TEST.COM\r\n')};
 await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'mod.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('#simple-issues')).toContainText('OPT.BAT');await page.locator('#simple-executable').selectOption('GAME.BAT');await page.locator('#simple-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#play-engine').selectOption('phase9-7');await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');expect((await diagnostic(page)).engine.artifact.id).toBe('phase9-7');await stop(page);
});
test('PE signature alone does not prevent a valid MZ DOS stub from executing',async({page})=>{
 const exe=new Uint8Array(160),d=new DataView(exe.buffer);exe.set([77,90]);d.setUint16(2,160,true);d.setUint16(4,1,true);d.setUint16(8,4,true);d.setUint16(10,32,true);d.setUint16(12,65535,true);d.setUint16(16,512,true);d.setUint16(24,64,true);d.setUint32(60,128,true);
 exe.set([0x0e,0x1f,0xba,14,0,0xb4,9,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21],64);exe.set(text('PUBLIC MOD DOS STUB\r\n$'),78);exe.set([80,69,0,0],128);
 await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');await page.locator('#simple-import').click();await page.locator('#simple-zip').setInputFiles({name:'unknown.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'MOD.EXE':exe}))});await page.locator('#simple-executable').selectOption('MOD.EXE');await page.locator('#simple-confirm').click();await expect(page.locator('#simple-import-dialog')).not.toBeVisible();
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('PUBLIC MOD DOS STUB');await stop(page);
});
test('K shortcut requires explicit confirmation, preserves normal selection and discards trial writes',async({page})=>{
 await register(page,{...unzipSync(await readFile('public/test-program.zip')),'GAME.BAT':text('ED4TEST.COM\r\n')});await page.locator('#play-engine').selectOption('phase9-7');await page.locator('#trial-k').click();await expect(page.locator('#boot-dialog')).toBeVisible();await expect(page.locator('#boot-engine')).toHaveValue('phase9-8k');await expect(page.locator('#run-state')).toHaveText('대기 중');
 await page.locator('#boot-start').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('s');await expect(page.locator('#logs')).toContainText('SAVE WRITTEN');const d=await diagnostic(page);expect(d.engine.artifact.id).toBe('phase9-8k');await stop(page);await expect(page.locator('#play-engine')).toHaveValue('phase9-7');
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('ED4 TEST READY');await page.keyboard.press('l');await expect(page.locator('#logs')).toContainText('NO SAVE');await stop(page);
});
