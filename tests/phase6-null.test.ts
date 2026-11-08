import {describe,it,expect} from 'vitest';
import {bootPlan} from '../src/boot-trace';
import {DosObservation} from '../src/dos-observation';
const text=(s:string)=>new TextEncoder().encode(s);
const files=(line:string)=>({'GAME.BAT':text(line),'SOUNDRV.COM':new Uint8Array([0xb8,0,0x4c,0xcd,0x21])});
describe('limited null-device redirection',()=>{
 it.each(['@SOUNDRV.COM > NUL','  @soundrv.com>Nul  ','SOUNDRV.COM\t>\tNUL','SOUNDRV.COM /Q > NUL'])('preserves original bytes and surrounds %s with visible markers',line=>{
  const f=files(line),before=structuredClone(f),p=bootPlan(f,'GAME.BAT');expect(p.issues).toEqual([]);
  expect(new TextDecoder().decode(p.generated[p.executable])).toContain(`@echo E4TRACE BEFORE 1 END\r\n${line}\r\n@echo E4TRACE AFTER 1 END`);
  expect(p.steps[0].program).toBe('SOUNDRV.COM');expect(f).toEqual(before);
 });
 it.each(['SOUNDRV.COM >> NUL','SOUNDRV.COM > OUT.TXT','SOUNDRV.COM 2> NUL','SOUNDRV.COM >NUL & BAD.COM',
  'SOUNDRV.COM > NUL | BAD.COM','SOUNDRV.COM < NUL','SOUNDRV.COM > "NUL"','SOUNDRV.COM > NUL.TXT',
  'SOUNDRV.COM > NUL:','SOUNDRV.COM > C:\\NUL','SOUNDRV.COM > NUL > NUL','%CMD% > NUL',
  'IF EXIST SOUNDRV.COM SOUNDRV.COM > NUL','CALL SOUNDRV.COM > NUL'])('retains rejection for %s',line=>{
  const p=bootPlan(files(line),'GAME.BAT');expect(p.issues.length).toBeGreaterThan(0);expect(p.issues.join()).toContain('GAME.BAT:1');
 });
 it('does not hide nested batch markers with a whole-BAT redirect',()=>{
  const p=bootPlan({...files('SOUND.BAT > NUL'),'SOUND.BAT':text('SOUNDRV.COM')},'GAME.BAT');expect(p.issues.join()).toContain('마커를 숨기므로');
 });
 it('shows the original unsafe command and exact line number in rejection',()=>{
  const p=bootPlan(files('REM original\n@SOUNDRV.COM > OUT.TXT'),'GAME.BAT');expect(p.issues[0]).toContain('GAME.BAT:2');expect(p.issues[0]).toContain('@SOUNDRV.COM > OUT.TXT');expect(p.issues[0]).toContain('단일 > NUL');
 });
});
describe('existing DOSBox log observations',()=>{
 it('records nested EXEC requests even before engine consumers attach; does not claim load success',()=>{
  const o=new DosObservation();o.observe('ws-err',{tag:'LOG_EXEC',message:'Execute C:\\DRIVER.EXE 0'});
  o.observe('ws-err',{tag:'LOG_EXEC',message:'Execute C:\\ED4.EXE 0'});
  o.observe('ws-update-lines');o.observe('ws-sound-push');o.observe('ws-stdout',{message:'Now Loading...'});
  const r=o.report();expect(r.requests.map(e=>e.program)).toEqual(['C:\\DRIVER.EXE','C:\\ED4.EXE']);expect(r.latestRequest?.mode).toBe(0);
  expect(r.sinceLatestRequest?.framePackets).toBe(1);expect(r.sinceLatestRequest?.audioPackets).toBe(1);expect(r.sinceLatestRequest?.stdout[0].message).toBe('Now Loading...');
  expect(r.workerError).toBeUndefined();expect(r.note).toContain('로딩 성공');
 });
 it('does not interpret shell parse logs, stdout, or other tags as execution evidence',()=>{
  const o=new DosObservation();o.observe('ws-stdout',{tag:'LOG_EXEC',message:'Execute ED4.EXE 0'});
  o.observe('ws-log',{tag:'worker',message:'Execute ED4.EXE 0'});o.observe('ws-err',{tag:'LOG_EXEC',message:'Parsing command line: ED4.EXE'});
  expect(o.report().requests).toEqual([]);expect(o.report().recentLogs).toHaveLength(2);
 });
 it('keeps load-only modes explicit and does not deduplicate repeated execution attempts',()=>{
  const o=new DosObservation();for(let i=0;i<2;i++)o.observe('ws-err',{tag:'LOG_EXEC',message:'Execute ED4.EXE 1'});
  expect(o.report().requests).toHaveLength(2);expect(o.report().latestRequest?.mode).toBe(1);
 });
 it('bounds logs and preserves execution evidence after unrelated log flooding',()=>{
  const o=new DosObservation();o.observe('ws-log',{tag:'LOG_EXEC',message:'Execute DRIVER.EXE 0'});
  for(let i=0;i<200;i++)o.observe('ws-log',{tag:'LOG_CPU',message:'x'.repeat(2000)});
  expect(o.report().recentLogs).toHaveLength(128);expect(o.report().droppedLogs).toBe(73);expect(o.report().latestRequest?.program).toBe('DRIVER.EXE');
  expect(o.report().recentLogs[0].message).toHaveLength(1024);
 });
 it('reports late Worker errors and exit separately from game execution',()=>{
  const o=new DosObservation();o.observe('ws-ready');o.error('late failure');expect(o.report().state).toBe('worker-error');
  expect(o.report().workerError).toBe('late failure');o.observe('ws-exit');expect(o.report().state).toBe('exited');o.stopped();expect(o.report().state).toBe('stopped');
 });
});
