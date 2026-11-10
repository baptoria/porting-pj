import {describe,it,expect} from 'vitest';
import {validateEngineSession} from '../src/engine-session';
describe('public engine/session admission',()=>{
 it.each(['phase9-7','phase9-8k'] as const)('admits explicit ordinary and read-only preview %s',id=>{
  expect(()=>validateEngineSession({id,purpose:'normal-play',discardWrites:false})).not.toThrow();
  expect(()=>validateEngineSession({id,purpose:'recovery-preview',discardWrites:true})).not.toThrow();
 });
 it.each([
  {id:'phase9-8k',discardWrites:false},
  {id:'phase9-8k',discardWrites:true},
  {id:'phase9-8k',discardWrites:false,purpose:'recovery-preview'},
  {id:'phase9-8k',discardWrites:true,purpose:'normal-play'},
  {id:'phase9-8h',discardWrites:false,purpose:'normal-play'},
  {id:'phase9-8k',discardWrites:false,purpose:'normal-play',cyclesPolicy:24000},
  {id:'unknown',discardWrites:false,purpose:'normal-play'},
 ])('rejects forged or developer-only session %j',session=>expect(()=>validateEngineSession(session as any)).toThrow());
});
