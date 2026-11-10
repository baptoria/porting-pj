import {describe,it,expect} from 'vitest';
import {analyzeLaunch,manualLaunchChoice} from '../src/launch-analysis';
import {buildBundle,readZip,canonicalPath} from '../src/archive';
import {checkRequirements} from '../src/integrity';
import {DEFAULT_SETTINGS,type Archive,type Profile} from '../src/model';
const bytes=(s:string)=>new TextEncoder().encode(s);
describe('execution-first entry, with security unchanged',()=>{
 it('explicit selection accepts uncertain optional BAT references, never rewrites bytes',()=>{
  const files={'GAME.BAT':bytes('IF NOT EXIST OPT.BAT GOTO RUN\r\nCALL OPT.BAT\r\n:RUN\r\nMOD.COM\r\n'),'MOD.COM':new Uint8Array([0xcd,0x20])};
  const a=analyzeLaunch(files);expect(a.automatic).toBeUndefined();expect(a.candidates.find(c=>c.path==='GAME.BAT')!.missing).toContain('OPT.BAT');
  expect(manualLaunchChoice(a,'GAME.BAT',files).source).toBe('user-choice');
  const p={id:'p',baseId:'a',patchIds:[],executable:'GAME.BAT',settings:DEFAULT_SETTINGS} as unknown as Profile;
  const result=readZip(buildBundle(p,[{id:'a',name:'public',size:100,createdAt:0,files} as Archive]),true);expect(result['GAME.BAT']).toEqual(files['GAME.BAT']);
 });
 it('modified hashes and unknown version remain informational, optional resources need no whitelist',()=>{
  const a={id:'a',name:'modified',sha256:'b'.repeat(64),versionId:'unknown',files:{'MOD.COM':new Uint8Array([0xcd,0x20,9,8,7])}} as unknown as Archive;
  const p={id:'p',baseId:'a',patchIds:[],requiredBaseVersion:'older',archiveIdentities:{a:{sha256:'a'.repeat(64),versionId:'older'}},executable:'MOD.COM',settings:DEFAULT_SETTINGS} as unknown as Profile;
  expect(checkRequirements(p,[a])).toHaveLength(2);expect(()=>buildBundle(p,[a])).not.toThrow();
 });
 it('PE/NE candidate can be explicitly attempted without claiming DOS API compatibility',()=>{
  const exe=new Uint8Array(100);exe.set([77,90]);exe[60]=80;exe.set([78,69],80);const files={'MOD.EXE':exe};
  const a=analyzeLaunch(files);expect(a.automatic).toBeUndefined();expect(manualLaunchChoice(a,'MOD.EXE',files).source).toBe('user-choice');
 });
 it.each(['LONGDIRECTORY/GO.COM','BAD&X.COM','BAD%X.COM','BAD^X.COM'])('rejects unsafe or unmapped DOS entry %s',path=>{
  const files={[path]:new Uint8Array([0xcd,0x20])};expect(()=>manualLaunchChoice(analyzeLaunch(files),path,files)).toThrow();
 });
 it.each(['../GAME.COM','/GAME.COM','C:/GAME.COM','NUL.COM','A/../B.COM','한글/GO.COM'])('preserves path and encoding boundary %s',path=>expect(()=>canonicalPath(path)).toThrow());
});
