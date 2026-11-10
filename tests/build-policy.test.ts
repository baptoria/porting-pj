import {describe,it,expect} from 'vitest';
import {DEVELOPER_TOOLS,requireDeveloperTools} from '../src/build-policy';
import {DosEngine} from '../src/engine';
import {publicImportError} from '../src/import-messages';
describe('public capability boundary',()=>{
 it('defaults to public and refuses developer capability',()=>{expect(DEVELOPER_TOOLS).toBe(false);expect(requireDeveloperTools).toThrow('개발 빌드');});
 it.each(['phase9-7','phase9-8k','phase9-8i'] as const)('rejects diagnostic %s before Worker/audio/file access',async id=>{
  const engine=new DosEngine({} as HTMLCanvasElement,()=>{});
  await expect(engine.start(new Uint8Array(),[],{id,discardWrites:true})).rejects.toThrow('개발 빌드');
 });
 it.each([
  ['QuotaExceededError: secret-path','저장 공간'],['ZIP CRC invalid secret-path','압축파일'],
  ['ASCII secret-path','파일 이름'],['OPFS SecurityError secret-path','저장 권한'],
  ['unexpected stack secret-path','등록하지 못했습니다'],
  ['게임 본체가 없습니다. RAW 음악만 있는 폴더 대신 실행 파일이 들어 있는 전체 게임을 선택하세요.','게임 실행 파일'],
 ])('provides actionable copy without internal exception %s',(raw,expected)=>{
  const result=publicImportError(Error(raw));expect(result).toContain(expected);expect(result).not.toContain('secret-path');expect(result).not.toContain('Error');
 });
});
