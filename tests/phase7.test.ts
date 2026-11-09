import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {RuntimeErrors,diagnosticText} from '../src/runtime-errors';
import {runtimeComparison} from '../src/runtime-comparison';
import type {DosSettings} from '../src/model';
const settings={cycles:12000,memory:16,sound:'sb16',prelude:''} as DosSettings;
describe('Phase 7 error metadata',()=>{
 it('keeps WASM and JS locations but never arbitrary error/rejection properties',()=>{
  const r=new RuntimeErrors();r.record('worker-error',{name:'RuntimeError',message:'null function',stack:'RuntimeError: null function\n at wasm://wasm/a:wasm-function[42]:0x123\n at run (https://host/porting-pj/ed4/vendor/wdosbox.js?token=SECRET:1:2)',filename:'https://host/dos-worker.js',lineno:9,colno:4,bytes:new Uint8Array([1,2]),save:'PRIVATE'});
  const e=r.report().events[0];expect(e.stackAvailable).toBe(true);expect(e.wasmLocations).toEqual([{functionIndex:42,offset:'0x123'}]);expect(e.filename).toBe('dos-worker.js');expect(e.lineno).toBe(9);
  expect(JSON.stringify(r.report())).not.toMatch(/PRIVATE|SECRET|https:\/\/host|"bytes"/);
 });
 it('reports missing stacks honestly and bounds records preserving the first',()=>{
  const r=new RuntimeErrors();for(let i=0;i<20;i++)r.record('parent-error',{message:String(i)});
  expect(r.report().events).toHaveLength(16);expect(r.report().dropped).toBe(4);expect(r.report().events[0]).toMatchObject({message:'0',stackAvailable:false});
 });
 it.each(['C:\\Users\\private\\save.bin','/storage/emulated/0/game/file','/home/alice/game','file:///C:/secret/data','https://name:secret@host/file.js?token=PRIVATE','token=PRIVATE','Bearer PRIVATE'])('redacts %s',value=>{
  expect(diagnosticText(value)).not.toMatch(/private|alice|secret|PRIVATE|emulated/i);
 });
 it('omits non-string inputs and bounds stack length',()=>{expect(diagnosticText({save:'data'})).toBe('');expect(diagnosticText('x'.repeat(30000))).toHaveLength(8192);});
});
function workerHarness(factory?: (options:any)=>unknown){
 const listeners:Record<string,((e:any)=>void)[]>={},messages:any[]=[];
 const context:any={self:{addEventListener:(n:string,f:(e:any)=>void)=>(listeners[n]??=[]).push(f),postMessage:(m:any)=>messages.push(m),location:{href:'https://example/porting-pj/ed4/dos-worker.js'}},
  importScripts:()=>{},WDOSBOX:factory??(()=>Promise.resolve({})),URL,performance,FileReaderSync:class{}};
 runInNewContext(readFileSync('public/dos-worker.js','utf8'),context);
 return {context,messages,emit:(n:string,e:any)=>listeners[n].forEach(f=>f(e))};
}
describe('Worker capture uses native error and rejection paths',()=>{
 it('forwards error stack, filename, line and column without suppressing the exception',()=>{
  const h=workerHarness();let suppressed=false;h.emit('error',{error:new WebAssembly.RuntimeError('null function'),message:'null function',filename:'https://host/wdosbox.js',lineno:12,colno:34,preventDefault:()=>suppressed=true});
  expect(h.messages[0].props).toMatchObject({source:'worker-error',name:'RuntimeError',filename:'wdosbox.js',lineno:12,colno:34});expect(h.messages[0].props.stack).toContain('RuntimeError');expect(suppressed).toBe(false);
 });
 it('distinguishes promise rejection and omits non-Error payload',()=>{
  const h=workerHarness();h.emit('unhandledrejection',{reason:{game:new Uint8Array([1,2]),save:'PRIVATE'}});expect(h.messages[0].props.source).toBe('unhandledrejection');expect(JSON.stringify(h.messages)).not.toContain('PRIVATE');expect(h.messages[0].props.stack).toBe('');
 });
 it('retains asynchronous factory failures and rethrows the original error',async()=>{
  const error=new Error('factory trap'),h=workerHarness(()=>Promise.reject(error));await expect(h.context.WDOSBOX({})).rejects.toBe(error);expect(h.messages[0].props.source).toBe('factory-rejection');
 });
 it('retains synchronous factory failures and rethrows the original error',()=>{
  const error=new Error('factory trap'),h=workerHarness(()=>{throw error;});expect(()=>h.context.WDOSBOX({})).toThrow(error);expect(h.messages[0].props.source).toBe('factory-exception');
 });
 it('keeps an existing onAbort hook and labels its observed JS stack separately',async()=>{
  const h=workerHarness();let called=false;const options={onAbort:()=>called=true};await h.context.WDOSBOX(options);options.onAbort();expect(called).toBe(true);expect(h.messages[0].props.source).toBe('emscripten-abort');
 });
});
describe('One-factor disposable runtime comparisons',()=>{
 const files={'GAME.BAT':new Uint8Array(),'NOSOUND.BAT':new Uint8Array()};
 it.each(['baseline','nosound','no-raw'] as const)('keeps CPU and memory for %s',mode=>{
  const before=structuredClone(settings),c=runtimeComparison(mode,files,'GAME.BAT',settings);expect(c.settings.cycles).toBe(settings.cycles);expect(c.settings.memory).toBe(settings.memory);expect(c.settings.sound).toBe('sb16');expect(settings).toEqual(before);
  expect(c.entry).toBe(mode==='nosound'?'NOSOUND.BAT':'GAME.BAT');expect(c.rawMounted).toBe(mode!=='no-raw');
 });
 it('refuses missing NOSOUND instead of generating it or using another installation',()=>{expect(()=>runtimeComparison('nosound',{'A/GAME.BAT':new Uint8Array(),'B/NOSOUND.BAT':new Uint8Array()},'A/GAME.BAT',settings)).toThrow('NOSOUND');});
 it('refuses ambiguous GAME paths',()=>{expect(()=>runtimeComparison('baseline',{'A/GAME.BAT':new Uint8Array(),'B/GAME.BAT':new Uint8Array()},'START.BAT',settings)).toThrow('여러');});
});
