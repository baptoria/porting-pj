import {describe,it,expect} from 'vitest';
import {bgmDiagnostics} from '../src/bgm-diagnostics';
describe('BGM metadata export boundary',()=>{
 it('fails closed on absent, unbounded or sample-shaped payloads',()=>{for(const v of [null,{}, {version:1,header:Array(33).fill(0),rows:Array(289).fill(Array(32).fill(0))},{version:1,header:Array(33).fill(0),rows:[Array(32).fill(.5)]}])expect(bgmDiagnostics(v).source).toBe('invalid-or-unavailable');});
 it('exports only whitelisted metadata and explicitly unknown ownership',()=>{const d=bgmDiagnostics({version:1,header:Array(33).fill(0),rows:[Array(32).fill(0)],samples:[123],tracks:[{hash:5,path:'EFFECT/ED4-01.RAW',bytes:[1]},{hash:6,path:'../secret'},{hash:7,path:'C:/USERS/A'}],fileReads:{total:1,overwritten:0,events:[{sequence:1,hash:5,position:8,length:4,samples:[1,2]}]}});expect(d.source).toBe('live-worker-query');expect(d.ownership).toBe('unknown');expect(d.tracks).toEqual([{hash:5,path:'EFFECT/ED4-01.RAW'}]);expect(JSON.stringify(d)).not.toContain('samples');expect(d.fileReads).toEqual([{sequence:1,hash:5,position:8,length:4}]);});
});
