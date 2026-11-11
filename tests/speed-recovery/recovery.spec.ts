import {test,expect,Page} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {folderFixture} from '../folder-fixture';
import {menu,stop} from '../phase9-8i/helpers';
const phase=(p:Page)=>p.locator('#speed-toggle');
async function setup(page:Page){
 page.on('dialog',d=>void d.accept());
 await page.addInitScript(()=>{
  const w=window as any;w.hf={gap:0,episodes:0,clamps:0,overflow:0,acks:[],stats:null,actualStats:null,holdOne:false,release:null,signalFrames:0,frames:0};
  const Native=Worker;window.Worker=class extends Native{constructor(u:string|URL,o?:WorkerOptions){super(u,o);this.addEventListener('message',e=>{const s=w.hf,p=e.data?.props;if(e.data?.name!=='ed4-speed-response')return;
   if((s.holdOne&&p.ok&&p.rate===1)||(s.holdStatus&&p.ok&&p.rate===2)){s.holdOne=false;s.holdStatus=false;e.stopImmediatePropagation();s.release=()=>this.dispatchEvent(new MessageEvent('message',{data:e.data}));return;}
   if(s.wrongRate&&p.ok&&p.rate===2){s.wrongRate=false;p.rate=1;}
   if(s.failOne&&p.ok&&p.rate===1){p.ok=false;p.error='synthetic native recovery refusal';}
   p.audioClamps+=s.clamps;if(s.acks.length<300)s.acks.push({...p});
  });}};
  const Node=AudioWorkletNode;window.AudioWorkletNode=class extends Node{constructor(c:BaseAudioContext,n:string,o?:AudioWorkletNodeOptions){super(c,n,o);w.hf.node=this;
   this.port.addEventListener('message',e=>{const s=w.hf;if(s.wrongWorklet&&e.data?.kind==='ack'&&e.data.rate===2){s.wrongWorklet=false;e.data.rate=1;}if(e.data?.kind==='stats'){s.actualStats={...e.data.stats};const p=e.data.stats;p.underflowFrames+=s.gap*p.outputRate/1000;p.underruns+=s.episodes;p.overflows+=s.overflow;s.stats={...p};}});this.port.start();
  }};
  // Read-only PCM observation on an extra test tap. Original gain->destination stays connected.
  const gain=AudioContext.prototype.createGain;AudioContext.prototype.createGain=function(){const out=gain.call(this),tap=this.createScriptProcessor(1024,1,1);tap.onaudioprocess=e=>{const s=w.hf,x=e.inputBuffer.getChannelData(0);s.frames+=x.length;for(const v of x)if(Math.abs(v)>.01)s.signalFrames++;};out.connect(tap);tap.connect(this.destination);return out;};
 });
 await page.goto('/porting-pj/'+(process.env.ED4_TEST_PUBLIC?'ed4':'ed4-dev')+'/');await expect(page.locator('#offline')).toHaveText('오프라인 준비 완료');
 await page.locator('#simple-import').click();await page.locator('#simple-folder').setInputFiles(await folderFixture({'GAME.BAT':new TextEncoder().encode('AUDIO.COM\r\n'),'AUDIO.COM':new Uint8Array(Buffer.from((await readFile('tests/fixtures/phase9-7-audio.b64','utf8')).trim(),'base64'))},'recovery-audio'));
 await expect(page.locator('#simple-import-dialog')).not.toBeVisible();await page.locator('#play').click();await expect(phase(page)).toBeEnabled();await page.locator('#fullscreen').click();
}
async function tone(page:Page){const n=await page.evaluate(()=>(window as any).hf.signalFrames);await page.locator('#canvas').focus();await page.keyboard.press('p',{delay:100});await expect.poll(()=>page.evaluate(()=>(window as any).hf.signalFrames)).toBeGreaterThan(n+1000);await page.waitForTimeout(1500);}
async function inject(page:Page,gap:number,episodes=1){await page.evaluate(({gap,episodes})=>{(window as any).hf.gap+=gap;(window as any).hf.episodes+=episodes;},{gap,episodes});}
async function two(page:Page){await phase(page).click();await expect(phase(page)).toHaveAttribute('aria-pressed','true');await expect(phase(page)).toBeEnabled();}
async function ready(page:Page){await expect(phase(page)).toHaveAttribute('data-speed-phase','ready-to-retry',{timeout:16000});await expect(phase(page)).toBeEnabled();await expect(phase(page)).toHaveText('2× 다시 켜기');}
test('read-only status poll cannot swallow a click and late status cannot overwrite the set ACK',async({page})=>{
 await setup(page);await two(page);await page.evaluate(()=>(window as any).hf.holdStatus=true);await expect.poll(()=>page.evaluate(()=>typeof (window as any).hf.release)).toBe('function');
 await expect(phase(page)).toBeEnabled();await phase(page).click();await expect(phase(page)).toHaveAttribute('aria-pressed','false');await expect(phase(page)).toBeEnabled();await page.evaluate(()=>(window as any).hf.release());await page.waitForTimeout(1000);await expect(phase(page)).toHaveAttribute('data-speed-phase','normal-1x');await stop(page);
});
for(const mobile of [false,true])test(`24ms warning, repeat recovery, same session retry and real output mobile=${mobile}`,async({page},info)=>{
 if(mobile)await page.setViewportSize({width:844,height:390});await setup(page);await tone(page);await two(page);
 await inject(page,24.2);await expect(phase(page)).toHaveAttribute('data-speed-phase','transient-warning');await expect(phase(page)).toHaveAttribute('aria-pressed','true');await expect(phase(page)).toBeEnabled();await page.waitForTimeout(5000);await expect(phase(page)).toHaveAttribute('data-speed-phase','normal-2x');
 await inject(page,14);await expect(phase(page)).toHaveAttribute('data-speed-phase','transient-warning');await inject(page,14);
 await expect(phase(page)).toHaveAttribute('data-speed-phase','stabilizing');await expect(phase(page)).toHaveAttribute('aria-pressed','false');await expect(phase(page)).toBeDisabled();await page.screenshot({path:info.outputPath('stabilizing.png')});await ready(page);
 await page.screenshot({path:info.outputPath('ready.png')});await two(page);await tone(page);await phase(page).click();await expect(phase(page)).toHaveAttribute('aria-pressed','false');
 await expect(phase(page)).toBeEnabled();await expect.poll(()=>page.evaluate(()=>(window as any).hf.stats?.rate)).toBe(1);
 const r=await page.evaluate(()=>{const {acks,stats,actualStats,frames,signalFrames}=(window as any).hf;return {acks,stats,actualStats,frames,signalFrames,injection:'Only telemetry counters; PCM is unmodified CC0 tone'};});expect(r.stats.rate).toBe(1);expect(r.actualStats.consumedFrames).toBeGreaterThan(22050);expect(r.actualStats.overflows).toBe(0);expect(r.actualStats.droppedFrames).toBe(0);expect(new Set(r.acks.map((a:any)=>a.session)).size).toBe(1);await writeFile(info.outputPath('recovery.json'),JSON.stringify(r,null,2));await stop(page);
});
test('old native clamp does not re-trigger recovery and pause time cannot qualify stabilization',async({page})=>{
 await setup(page);await two(page);await page.evaluate(()=>(window as any).hf.clamps=1);await expect(phase(page)).toHaveAttribute('data-speed-phase','stabilizing');await menu(page);await page.locator('#pause').click();await page.waitForTimeout(9000);await expect(phase(page)).toHaveAttribute('data-speed-phase','stabilizing');await page.locator('#pause').click();await ready(page);if(await page.locator('#player-menu').isVisible())await page.locator('#player-menu').click();await two(page);await page.waitForTimeout(4000);await expect(phase(page)).toHaveAttribute('data-speed-phase','normal-2x');await stop(page);
});
for(const action of ['pause','stop'])test(`delayed recovery native ACK then ${action} does not mutate a later session`,async({page})=>{
 await setup(page);await two(page);await page.evaluate(()=>(window as any).hf.holdOne=true);await inject(page,130);await expect(phase(page)).toHaveAttribute('data-speed-phase','recovering-1x');await menu(page);
 if(action==='pause'){await page.locator('#pause').click();await page.evaluate(()=>(window as any).hf.release());await expect(phase(page)).toHaveAttribute('data-speed-phase','stabilizing');await expect(phase(page)).toBeDisabled();await page.locator('#pause').click();await ready(page);await stop(page);}
 else{await stop(page);await page.evaluate(()=>(window as any).hf.release());await page.locator('#play').click();await expect(phase(page)).toBeEnabled();await expect(phase(page)).toHaveAttribute('aria-pressed','false');await stop(page);}
});
for(const fault of ['wrongRate','overflow','processor','recoveryFailure','workletMismatch'])test(`fatal ${fault} cannot silently enable retry`,async({page})=>{
 await setup(page);if(fault==='wrongRate'||fault==='workletMismatch'){await page.evaluate(f=>(window as any).hf[f==='wrongRate'?'wrongRate':'wrongWorklet']=true,fault);await phase(page).click();}
 else{await two(page);await page.evaluate(f=>{const s=(window as any).hf;if(f==='overflow')s.overflow=1;else if(f==='recoveryFailure'){s.failOne=true;s.gap+=130;s.episodes++;}else s.node.onprocessorerror(new Event('processorerror'));},fault);}
 await expect(phase(page)).toHaveAttribute('data-speed-phase','fatal-fault');await expect(phase(page)).toBeDisabled();await expect(phase(page)).toHaveText('배속 사용 불가');await expect(page.locator('#run-state')).toHaveText('실행 중');await stop(page);
});
