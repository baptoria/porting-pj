import {describe,it,expect,vi} from 'vitest';
import {bootPlan,BootTrace} from '../src/boot-trace';
import {buildBundle} from '../src/archive';
import {unzipSync} from 'fflate';
import {DEFAULT_SETTINGS,type Files,type Profile} from '../src/model';
import {ImportMeter,rememberImport,importTrace,importCommit,importOperation,failImport,timeoutMessage,IMPORT_SILENCE_MS} from '../src/import-trace';
const text=(s:string)=>new TextEncoder().encode(s);
const program=new Uint8Array([0xb8,0,0x4c,0xcd,0x21]);
const sample=(bat:string,extra:Files={}):Files=>({'GAME.BAT':text(bat),'ED4.EXE':program,...extra});
describe('Phase 6 disposable boot trace',()=>{
 it('retains command order, classifies evidence and preserves original BAT bytes',()=>{
  const f=sample('@echo off\r\nSOUNDRV.COM\r\nDRIVER.EXE\r\nED4.EXE',{'SOUNDRV.COM':program,'DRIVER.EXE':program});const before=structuredClone(f);
  const p=bootPlan(f,'GAME.BAT');expect(p.issues).toEqual([]);
  expect(p.steps.map(s=>s.command)).toEqual(['echo off','SOUNDRV.COM','DRIVER.EXE','ED4.EXE']);
  expect(p.steps[1].category).toBe('sound');expect(p.steps[2].category).toBe('initialization');expect(p.steps[3].category).toBe('game');
  expect(new TextDecoder().decode(p.generated[p.executable])).toContain('E4TRACE BEFORE 4 END\r\nED4.EXE\r\n@echo E4TRACE AFTER 4 END');expect(f).toEqual(before);
 });
 it('traces nested CALL with unchanged working directory and returns to parent',()=>{
  const p=bootPlan(sample('CD SOUND\nCALL INIT.BAT\nCD ..\nED4.EXE',{'SOUND/INIT.BAT':text('DRIVER.COM'),'SOUND/DRIVER.COM':program}),'GAME.BAT');
  expect(p.issues).toEqual([]);expect(p.steps.map(s=>s.program).filter(Boolean)).toEqual(['SOUND/INIT.BAT','SOUND/DRIVER.COM','ED4.EXE']);
  expect(new TextDecoder().decode(p.generated[p.executable])).toMatch(/CALL C:\\ET\d+\.BAT/);
 });
 it('preserves a bare BAT tail transfer without inventing CALL or AFTER',()=>{
  const p=bootPlan(sample('SOUND.BAT',{'SOUND.BAT':text('ED4.EXE')}),'GAME.BAT');expect(p.issues).toEqual([]);
  expect(p.steps[0].afterExpected).toBe(false);expect(new TextDecoder().decode(p.generated[p.executable])).not.toContain('AFTER 1');
 });
 it.each(['IF ERRORLEVEL 1 GOTO END','GOTO START','ED4.EXE > X.TXT','%GAME%','CALL GAME.BAT ARG','PATH C:\\TOOLS','LH DRIVER.EXE'])('refuses unsafe trace transformation: %s',line=>{
  expect(bootPlan(sample(line),'GAME.BAT').issues.length).toBeGreaterThan(0);
 });
 it('detects missing programs, cycles and unsupported CD drive references',()=>{
  expect(bootPlan(sample('LOADER.COM\nED4.EXE'),'GAME.BAT').issues.join()).toContain('LOADER.COM');
  expect(bootPlan(sample('CALL GAME.BAT'),'GAME.BAT').issues.join()).toContain('순환');
  const p=bootPlan(sample('D:\\GAME.EXE',{'DISC.CUE':text('file disc.bin')}),'GAME.BAT');expect(p.evidence.cdImages).toEqual(['DISC.CUE']);expect(p.evidence.driveCommands).toHaveLength(1);expect(p.issues.length).toBeGreaterThan(0);
 });
 it('does not invent NOSOUND, loaders or CD requirements',()=>{
  const p=bootPlan(sample('ED4.EXE'),'GAME.BAT');expect(p.evidence).toEqual({koreanCandidates:[],cdImages:[],driveCommands:[]});expect(Object.keys(p.generated).some(p=>/NOSOUND|LOADER/.test(p))).toBe(false);
 });
 it('preserves OEM Korean output bytes without asserting a loader is required',()=>{
  const f=sample('ED4.EXE');f['GAME.BAT']=new Uint8Array([...text('ECHO '),0xb0,0xa1,13,10,...text('ED4.EXE')]);
  const p=bootPlan(f,'GAME.BAT');expect(p.issues).toEqual([]);expect(Array.from(p.generated[p.executable])).toContain(0xb0);expect(Array.from(p.generated[p.executable])).toContain(0xa1);
 });
 it('does not overwrite generated-name collisions and preserves archives and saves',()=>{
  const f=sample('ED4.EXE',{'ET000001.BAT':text('original')});const p=bootPlan(f,'GAME.BAT');expect(p.executable).toBe('ET000002.BAT');
  const profile:Profile={id:'p',gameId:'ed4',engineId:'js-dos-v7',name:'test',kind:'vanilla',baseId:'a',patchIds:[],executable:p.executable,settings:DEFAULT_SETTINGS,createdAt:0};
  const a={id:'a',name:'source',files:f,size:100,createdAt:0},save={'TEST.SAV':text('keep')};const before=structuredClone({a,save});
  const out=unzipSync(buildBundle(profile,[a],save,[],p.generated));expect(out['GAME.BAT']).toEqual(f['GAME.BAT']);expect(out[p.executable]).toBeDefined();expect({a,save}).toEqual(before);
  expect(()=>buildBundle(profile,[a],save,[],{'GAME.BAT':text('bad')})).toThrow();
 });
 it('parses split stdout without double counting; entry is not proof of hang',()=>{
  const trace=new BootTrace(bootPlan(sample('ED4.EXE'),'GAME.BAT'));
  trace.accept('E4TRA');trace.accept('CE BEFORE 1 E');expect(trace.report().lastEntered).toBeUndefined();trace.accept('ND\r\n');
  expect(trace.report().lastEntered?.program).toBe('ED4.EXE');expect(trace.report().returned).toBe(false);
  trace.accept('noise');trace.accept('E4TRACE AFTER 1 END\n');expect(trace.events).toHaveLength(2);expect(trace.report().returned).toBe(true);
 });
});
describe('import phase evidence',()=>{
 it('measures independent stages and records pending operations without payload',async()=>{
  const snapshots:any[]=[];const m=new ImportMeter('zip',x=>snapshots.push(x));m.sync('crc',100,()=>42);await m.async('read',200,async()=>new Uint8Array(200));m.publish(true);
  expect(m.data.stages.crc?.bytes).toBe(100);expect(m.data.stages.read?.bytes).toBe(200);expect(m.data.pending).toBe(false);expect(JSON.stringify(snapshots)).not.toContain('Uint8Array');
 });
 it('keeps the 60 second watchdog and reports the last observed stage on failure',()=>{
  const m=new ImportMeter('zip',()=>{});rememberImport(m.data);importOperation('zipSha');failImport(Error('private filename'));
  expect(IMPORT_SILENCE_MS).toBe(60000);expect(timeoutMessage(importTrace())).toContain('ZIP SHA-256');expect(importTrace()?.status).toBe('failed');expect(JSON.stringify(importTrace())).not.toContain('private filename');
 });
 it('records successful IDB confirmation separately and marks failed transactions',async()=>{
  rememberImport(new ImportMeter('folder',()=>{}).data);await importCommit('musicDb',async()=>{});await importCommit('profileDb',async()=>{});
  expect(importTrace()?.status).toBe('committed');expect(importTrace()?.stages.profileDb?.calls).toBe(1);
  await expect(importCommit('profileDb',async()=>{throw new DOMException('quota','QuotaExceededError');})).rejects.toThrow();expect(importTrace()?.status).toBe('failed');expect(importTrace()?.pending).toBe(true);
 });
 it('does not send perpetual heartbeats while an async operation is stuck',async()=>{
  vi.useFakeTimers();try{
   const send=vi.fn();const m=new ImportMeter('zip',send);let release!:()=>void;
   const waiting=m.async('read',10,()=>new Promise<void>(resolve=>release=resolve));
   await vi.advanceTimersByTimeAsync(1000);const count=send.mock.calls.length;
   await vi.advanceTimersByTimeAsync(60000);expect(send).toHaveBeenCalledTimes(count);expect(m.data.pending).toBe(true);
   release();await waiting;expect(m.data.pending).toBe(false);
  }finally{vi.useRealTimers();}
 });
});
