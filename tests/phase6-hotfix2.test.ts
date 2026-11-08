import {describe,it,expect} from 'vitest';
import {bootPlan} from '../src/boot-trace';
import type {Files} from '../src/model';
const text=(s:string)=>new TextEncoder().encode(s);
const program=new Uint8Array([0xb8,0,0x4c,0xcd,0x21]);
const files=(command:string,extra:Files={}):Files=>({'GAME.BAT':text(command),'SOUNDRV.COM':program,'DRIVER.EXE':program,'ED4.EXE':program,...extra});
const game=['@ECHO OFF','@SOUNDRV.COM > NUL','@DRIVER.EXE ED4.EXE','@SOUNDRV.COM/U > NUL','@ECHO ON'];
describe('Hotfix 2 executable and switch separation',()=>{
 it.each(['SOUNDRV.COM/U','SOUNDRV.COM /U','SOUNDRV.COM/U > NUL','SOUNDRV.COM /U > NUL',
  '  @soundrv.com/u\t>\tNul  '])('preserves and parses %s',line=>{
  const f=files(line),before=structuredClone(f),p=bootPlan(f,'GAME.BAT');expect(p.issues).toEqual([]);
  expect(p.steps[0].program).toBe('SOUNDRV.COM');expect(p.steps[0].arguments?.map(s=>s.toUpperCase())).toEqual(['/U']);
  expect(p.steps[0].redirection).toBe(/>/.test(line)?'> NUL':undefined);
  expect(new TextDecoder().decode(p.generated[p.executable])).toContain(`@echo E4TRACE BEFORE 1 END\r\n${line}\r\n@echo E4TRACE AFTER 1 END`);expect(f).toEqual(before);
 });
 it.each(['DRIVER.EXE/QUIET','SOUNDRV.COM/UNLOAD','SOUNDRV.COM/U2'])('supports simple switches on other DOS executables: %s',line=>{
  const p=bootPlan(files(line),'GAME.BAT');expect(p.issues).toEqual([]);expect(p.steps[0].arguments).toEqual([line.slice(line.indexOf('/'))]);
 });
 it.each(['TOOLS\\SOUNDRV.COM/U','C:\\TOOLS\\SOUNDRV.COM/U','\\TOOLS\\SOUNDRV.COM/U','TOOLS.COM\\SOUNDRV.COM/U'])('keeps a DOS path separate from its switch: %s',line=>{
  const p=bootPlan(files(line,{'TOOLS/SOUNDRV.COM':program,'TOOLS.COM/SOUNDRV.COM':program}),'GAME.BAT');expect(p.issues).toEqual([]);
  expect(p.steps[0].program).toBe(line.startsWith('TOOLS.COM')?'TOOLS.COM/SOUNDRV.COM':'TOOLS/SOUNDRV.COM');expect(p.steps[0].arguments).toEqual(['/U']);
 });
 it('resolves relative DOS paths from the batch working directory',()=>{
  const p=bootPlan({'ROOT/GAME.BAT':text('..\\TOOLS\\SOUNDRV.COM/U'),'TOOLS/SOUNDRV.COM':program},'ROOT/GAME.BAT');
  expect(p.issues).toEqual([]);expect(p.steps[0].program).toBe('TOOLS/SOUNDRV.COM');
 });
 it.each(['SOUNDRV.COM//U','SOUNDRV.COM/../U','SOUNDRV.COM/U/OTHER.EXE','SOUNDRV.COM/U:PATH',
  'SOUNDRV.COM /../','SOUNDRV.COM /U=BAD','SOUNDRV.COM/U & ED4.EXE','SOUNDRV.COM/U | ED4.EXE',
  'SOUNDRV.COM/U >> NUL','SOUNDRV.COM/U > OUT.TXT','%PROGRAM%/U','GAME.BAT/U','CALL SOUNDRV.COM/U',
  'TOOLS/SOUNDRV.COM/U','C:/TOOLS/SOUNDRV.COM/U','C:SOUNDRV.COM/U','D:\\SOUNDRV.COM/U','..\\SOUNDRV.COM/U','SOUNDRV.COM/'])('rejects ambiguous/unsafe paths and arguments: %s',line=>{
  const p=bootPlan(files(line),'GAME.BAT');expect(p.issues.length).toBeGreaterThan(0);expect(p.issues.join()).toContain('GAME.BAT:1');
 });
 it('never treats a COM-named directory as the executable',()=>{
  const p=bootPlan({'GAME.BAT':text('SOUNDRV.COM/U'),'SOUNDRV.COM/U.EXE':program},'GAME.BAT');expect(p.issues.length).toBeGreaterThan(0);expect(p.steps[0].program).toBeUndefined();
 });
 it('retains missing executable checks after splitting a valid switch',()=>{
  const p=bootPlan({'GAME.BAT':text('SOUNDRV.COM/U > NUL')},'GAME.BAT');expect(p.issues.join()).toContain('실행 파일 누락');
 });
 it('analyzes all five supplied lines and keeps DRIVER child argument separate',()=>{
  const f=files(game.join('\r\n')),before=structuredClone(f),p=bootPlan(f,'GAME.BAT');expect(p.issues).toEqual([]);expect(p.steps).toHaveLength(5);
  expect(p.steps.map(s=>s.line)).toEqual([1,2,3,4,5]);expect(p.steps[2].program).toBe('DRIVER.EXE');expect(p.steps[2].arguments).toEqual(['ED4.EXE']);
  expect(p.steps[3]).toMatchObject({program:'SOUNDRV.COM',arguments:['/U'],redirection:'> NUL'});
  const generated=new TextDecoder().decode(p.generated[p.executable]);
  for(const [i,line] of game.entries())expect(generated).toContain(`@echo E4TRACE BEFORE ${i+1} END\r\n${line}\r\n@echo E4TRACE AFTER ${i+1} END`);
  expect(f).toEqual(before);
 });
});
