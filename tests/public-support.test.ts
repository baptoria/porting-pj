import {it,expect} from 'vitest';
import {supportReceipt} from '../src/public-support';
it('speed recovery failure is distinct from save recovery failure',()=>{expect(supportReceipt('배속 1× 복구 확인 실패','실행 중').category).toBe('speed-or-audio');expect(supportReceipt('세이브 복구 실패','실행 중').category).toBe('save-or-recovery');});
it('public error receipt excludes private exception/file data and unrecognized engine fields',()=>{
 const r=supportReceipt('파일 C:\\private\\SAVE.DAT token=secret','C:/private',{id:'phase9-8k',wasmSha256:'a'.repeat(64)});
 expect(r.category).toBe('registration-or-file');expect(r.stage).toBe('other');expect(r.engine?.wasmSha256).toHaveLength(64);
 expect(JSON.stringify(r)).not.toMatch(/private|secret|SAVE\.DAT/);
 expect(supportReceipt('Worker failed','시작 실패',{id:'https://private',wasmSha256:'secret'}).engine).toBeUndefined();
});
