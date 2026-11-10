import {test,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {strToU8} from 'fflate';
import {folderFixture} from '../folder-fixture';
import {stop} from '../phase9-8i/helpers';

// CC0 input injector: BIOS keyboard-store P, then DOS exit. No commercial bytes.
const firstCue=new Uint8Array([0xb9,0x70,0x19,0xb4,5,0xcd,0x16,0xb8,0,0x4c,0xcd,0x21]);
for(const id of ['phase9-7','phase9-8k'])test(`ordinary ${id}: initial PCM without LOAD and repeated output`,async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const w=window as any;w.capture=[];const gain=AudioContext.prototype.createGain;
  AudioContext.prototype.createGain=function(){const out=gain.call(this),tap=this.createScriptProcessor(1024,1,1);
   w.outputRate=this.sampleRate;tap.onaudioprocess=e=>{if(w.capture.length<400)w.capture.push(Array.from(e.inputBuffer.getChannelData(0)));e.outputBuffer.getChannelData(0).fill(0);};out.connect(tap);tap.connect(this.destination);return out;
  };
 });
 page.on('dialog',d=>void d.accept());await page.goto('/porting-pj/ed4/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({'GAME.BAT':strToU8('KEY.COM\r\nAUDIO.COM\r\n'),'KEY.COM':firstCue,'AUDIO.COM':new Uint8Array(Buffer.from((await readFile('tests/fixtures/phase9-7-audio.b64','utf8')).trim(),'base64'))},'initial-audio'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await page.locator('#game-settings').click();await page.locator('#play-engine').selectOption(id);await page.locator('[data-close=settings-dialog]').click();
 await page.locator('#play').click();await expect(page.locator('#logs')).toContainText('AUDIO_DONE');await page.waitForTimeout(200);
 const sample=()=>page.evaluate(()=>{
  const w=window as any,x=w.capture.flat(),rate=w.outputRate,first=x.findIndex((n:number)=>Math.abs(n)>.01),last=x.findLastIndex((n:number)=>Math.abs(n)>.01);const crossings:number[]=[];
  for(let i=Math.max(1,first+rate*.1|0);i<Math.min(last,first+rate*.3);i++)if(x[i]<=0&&x[i+1]>0)crossings.push(i-x[i]/(x[i+1]-x[i]));
  return {rate,frames:x.length,active:first>=0,seconds:(last-first)/rate,hz:crossings.length>1?rate*(crossings.length-1)/(crossings.at(-1)!-crossings[0]):0};
 });
 const initial=await sample();expect(initial.active).toBe(true);expect(initial.hz).toBeGreaterThan(900);expect(initial.hz).toBeLessThan(1100);
 await page.locator('#fullscreen').click();const rows=[{speed:1,...initial}];
 for(const speed of (id==='phase9-8k'?[2,1,2,1]:[1])){
  if(id==='phase9-8k'){await page.locator('#speed-toggle').click();await expect(page.locator('#speed-toggle')).toHaveAttribute('aria-pressed',String(speed===2));await expect(page.locator('#speed-toggle')).toBeEnabled();}
  await page.evaluate(()=>(window as any).capture=[]);await page.locator('#canvas').focus();await page.keyboard.press('p');
  await page.waitForTimeout(speed===2?1500:2500);const value=await sample();rows.push({speed,...value});expect(value.active).toBe(true);
  expect(value.hz/speed).toBeGreaterThan(900);expect(value.hz/speed).toBeLessThan(1100);expect(value.seconds*speed/initial.seconds).toBeGreaterThan(.9);expect(value.seconds*speed/initial.seconds).toBeLessThan(1.1);
 }
 await writeFile(info.outputPath('public-pcm.json'),JSON.stringify(rows,null,2));await stop(page);expect(errors).toEqual([]);
});
